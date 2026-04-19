import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  X, Upload, FileArchive, CheckCircle2, AlertCircle, Loader2, Trash2, FileText,
} from "lucide-react";
import { matchFilesToForecasts, type BpForecastForMatch, type FileMatch } from "@/lib/bp-attachment-matching";

interface Props {
  /** All event IDs whose BP forecasts can receive attachments (master + children, or single event). */
  eventIds: string[];
  onClose: () => void;
}

interface PendingFile {
  id: string;
  name: string;
  size: number;
  blob: Blob;
  forecastId: string | null;
  score: number;
  strategy: FileMatch["strategy"];
  /** Per-row override of forecast picked by user */
  overridden: boolean;
  /** Excluded by user (won't upload) */
  excluded: boolean;
  /** Upload state */
  status: "pending" | "uploading" | "done" | "error";
  errorMsg?: string;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function bytesToReadable(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function strategyLabel(s: FileMatch["strategy"]): { label: string; cls: string } {
  switch (s) {
    case "drive-id":
      return { label: "Drive ID", cls: "bg-success/15 text-success" };
    case "supplier":
      return { label: "Fornecedor", cls: "bg-primary/15 text-primary" };
    case "similarity":
      return { label: "Similaridade", cls: "bg-warning/15 text-warning" };
    case "none":
      return { label: "Sem sugestão", cls: "bg-muted text-muted-foreground" };
  }
}

export default function BPBulkAttachmentsModal({ eventIds, onClose }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Load forecasts + suppliers (via linked transactions) for all events in scope
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["bp_bulk_candidates", eventIds],
    queryFn: async (): Promise<BpForecastForMatch[]> => {
      if (eventIds.length === 0) return [];
      const { data: forecasts, error } = await supabase
        .from("event_forecasts")
        .select("id, event_id, description, amount, transaction_id, attachment_refs")
        .in("event_id", eventIds);
      if (error) throw error;
      const txIds = (forecasts ?? [])
        .map((f: any) => f.transaction_id)
        .filter(Boolean) as string[];
      const supplierByTx = new Map<string, string>();
      if (txIds.length > 0) {
        const { data: txs } = await supabase
          .from("transactions")
          .select("id, suppliers:supplier_id(name)")
          .in("id", txIds);
        for (const t of txs ?? []) {
          const name = (t as any).suppliers?.name;
          if (name) supplierByTx.set((t as any).id, name);
        }
      }
      return (forecasts ?? []).map((f: any) => ({
        id: f.id,
        event_id: f.event_id,
        description: f.description,
        amount: Number(f.amount) || 0,
        supplier_name: f.transaction_id ? supplierByTx.get(f.transaction_id) ?? null : null,
        attachment_refs: Array.isArray(f.attachment_refs) ? f.attachment_refs : [],
      }));
    },
  });

  const forecastById = useMemo(() => {
    const m = new Map<string, BpForecastForMatch>();
    for (const f of candidates) m.set(f.id, f);
    return m;
  }, [candidates]);

  /** Add raw files (and unzip ZIPs into individual entries) and run matching. */
  const addFiles = async (incoming: File[]) => {
    if (incoming.length === 0) return;
    setExtracting(true);
    try {
      const expanded: { name: string; blob: Blob; size: number }[] = [];
      for (const f of incoming) {
        if (/\.zip$/i.test(f.name)) {
          try {
            const zip = await JSZip.loadAsync(f);
            const entries = Object.values(zip.files).filter((e) => !e.dir);
            for (const e of entries) {
              const blob = await e.async("blob");
              const baseName = e.name.split("/").pop() ?? e.name;
              if (blob.size === 0) continue;
              if (blob.size > MAX_FILE_BYTES) {
                toast({
                  title: `Ficheiro ignorado: ${baseName}`,
                  description: `Demasiado grande (>${MAX_FILE_BYTES / 1024 / 1024}MB)`,
                  variant: "destructive",
                });
                continue;
              }
              expanded.push({ name: baseName, blob, size: blob.size });
            }
          } catch (err: any) {
            toast({ title: `Erro ao ler ${f.name}`, description: err.message, variant: "destructive" });
          }
        } else {
          if (f.size > MAX_FILE_BYTES) {
            toast({ title: `Ficheiro ignorado: ${f.name}`, description: "Demasiado grande", variant: "destructive" });
            continue;
          }
          expanded.push({ name: f.name, blob: f, size: f.size });
        }
      }

      // Run matching
      const matches = matchFilesToForecasts({
        fileNames: expanded.map((e) => e.name),
        forecasts: candidates,
      });
      const matchByName = new Map<string, FileMatch>();
      for (const m of matches) matchByName.set(m.fileName, m);

      const added: PendingFile[] = expanded.map((e, idx) => {
        const m = matchByName.get(e.name) ?? { fileName: e.name, forecastId: null, score: 0, strategy: "none" as const };
        return {
          id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
          name: e.name,
          size: e.size,
          blob: e.blob,
          forecastId: m.forecastId,
          score: m.score,
          strategy: m.strategy,
          overridden: false,
          excluded: false,
          status: "pending",
        };
      });
      setFiles((prev) => [...prev, ...added]);
    } finally {
      setExtracting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    void addFiles(dropped);
  };

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    void addFiles(list);
  };

  const setForecast = (id: string, forecastId: string | null) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, forecastId, overridden: true } : f)));
  };
  const toggleExclude = (id: string) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, excluded: !f.excluded } : f)));
  };
  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const acceptAllConfident = () => {
    setFiles((prev) =>
      prev.map((f) =>
        f.forecastId && f.score >= 0.7 && !f.overridden ? { ...f, overridden: true } : f,
      ),
    );
    toast({ title: "Sugestões com alta confiança aceites" });
  };

  const eligible = files.filter((f) => f.forecastId && !f.excluded && f.status !== "done");

  // Summary stats for the banner
  const stats = useMemo(() => {
    const total = files.length;
    const matched = files.filter((f) => f.forecastId && !f.excluded).length;
    const unmatched = files.filter((f) => !f.forecastId && !f.excluded).length;
    const byDriveId = files.filter((f) => f.strategy === "drive-id" && !f.excluded).length;
    const bySupplier = files.filter((f) => f.strategy === "supplier" && !f.excluded).length;
    const bySimilarity = files.filter((f) => f.strategy === "similarity" && !f.excluded).length;

    // BP rows that still have no attachments (no attachment_refs)
    const rowsWithoutAttachments = candidates.filter(
      (c) => !c.attachment_refs || c.attachment_refs.length === 0,
    ).length;
    const totalRows = candidates.length;

    return { total, matched, unmatched, byDriveId, bySupplier, bySimilarity, rowsWithoutAttachments, totalRows };
  }, [files, candidates]);

  const handleUpload = async () => {
    if (eligible.length === 0) {
      toast({ title: "Nada para subir", description: "Atribui pelo menos uma linha do BP a um ficheiro.", variant: "destructive" });
      return;
    }
    setUploading(true);
    let attached = 0;
    let failed = 0;
    try {
      // Upload in parallel with a small concurrency cap to be gentle with storage.
      const queue = [...eligible];
      const CONCURRENCY = 4;
      const workers: Promise<void>[] = [];
      const startWorker = async () => {
        while (queue.length > 0) {
          const item = queue.shift()!;
          setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: "uploading" } : f)));
          const forecast = forecastById.get(item.forecastId!);
          if (!forecast) {
            setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: "error", errorMsg: "Linha não encontrada" } : f)));
            failed++;
            continue;
          }
          try {
            // Storage path: bp-attachments/<forecast_id>/<timestamp>-<safe-name>
            const safe = item.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
            const storagePath = `bp-attachments/${forecast.id}/${Date.now()}-${safe}`;
            const { error: upErr } = await supabase.storage
              .from("transaction-documents")
              .upload(storagePath, item.blob, {
                contentType: item.blob.type || "application/octet-stream",
              });
            if (upErr) throw upErr;

            // Append to forecast.attachment_refs
            const refs = Array.isArray(forecast.attachment_refs) ? [...forecast.attachment_refs] : [];
            refs.push({
              url: storagePath,
              type: "upload",
              name: item.name,
              size: item.size,
              uploadedAt: new Date().toISOString(),
              uploadedBy: user?.email ?? "system",
            } as any);
            const { error: dbErr } = await supabase
              .from("event_forecasts")
              .update({ attachment_refs: refs as any } as any)
              .eq("id", forecast.id);
            if (dbErr) throw dbErr;

            // If linked to a transaction, mirror as a transaction_document so it shows in the Tx UI.
            const { data: forecastRow } = await supabase
              .from("event_forecasts")
              .select("transaction_id")
              .eq("id", forecast.id)
              .maybeSingle();
            const txId = (forecastRow as any)?.transaction_id;
            if (txId) {
              await supabase.from("transaction_documents").insert({
                transaction_id: txId,
                name: item.name,
                file_url: storagePath,
                doc_type: "outro",
                uploaded_by: user?.email ?? "system",
                is_accounting: true,
              } as any);
            }

            // Update local cache copy so subsequent matches by Drive ID still work.
            forecast.attachment_refs = refs;
            attached++;
            setFiles((prev) => prev.map((f) => (f.id === item.id ? { ...f, status: "done" } : f)));
          } catch (err: any) {
            failed++;
            setFiles((prev) =>
              prev.map((f) => (f.id === item.id ? { ...f, status: "error", errorMsg: err.message } : f)),
            );
          }
        }
      };
      for (let i = 0; i < CONCURRENCY; i++) workers.push(startWorker());
      await Promise.all(workers);

      // Refresh BP queries
      for (const eid of eventIds) {
        queryClient.invalidateQueries({ queryKey: ["event_forecasts", eid] });
      }
      queryClient.invalidateQueries({ queryKey: ["transaction_documents_summary"] });
      queryClient.invalidateQueries({ queryKey: ["bp_bulk_candidates", eventIds] });

      toast({
        title: `${attached} anexo(s) carregado(s)`,
        description: failed > 0 ? `${failed} falha(s) — vê na tabela.` : undefined,
        variant: failed > 0 && attached === 0 ? "destructive" : undefined,
      });
    } finally {
      setUploading(false);
    }
  };

  const sorted = useMemo(() => {
    const order = (s: FileMatch["strategy"]) =>
      s === "drive-id" ? 0 : s === "supplier" ? 1 : s === "similarity" ? 2 : 3;
    return [...files].sort((a, b) => order(a.strategy) - order(b.strategy) || b.score - a.score);
  }, [files]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="glass w-full max-w-5xl rounded-xl p-6 space-y-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FileArchive className="h-5 w-5 text-primary" />
              Upload em massa de anexos
            </h2>
            <p className="text-xs text-muted-foreground">
              Arrasta um <strong>.zip</strong> da pasta do Drive ou ficheiros soltos. O sistema sugere a linha do BP por fornecedor e descrição.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drop zone */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-primary/5"
          }`}
        >
          <input type="file" multiple accept=".zip,*/*" className="hidden" onChange={onPickFiles} />
          <Upload className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">
            {extracting ? "A descomprimir…" : "Arrasta ficheiros ou .zip aqui (ou clica para escolher)"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isLoading ? "A carregar BP…" : `${candidates.length} linha(s) do BP elegíveis · máx ${MAX_FILE_BYTES / 1024 / 1024}MB por ficheiro`}
          </p>
        </label>

        {files.length > 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                {files.length} ficheiro(s) · {eligible.length} prontos a anexar
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={acceptAllConfident}
                  className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
                >
                  Aceitar sugestões ≥70%
                </button>
                <button
                  onClick={() => setFiles([])}
                  className="rounded-lg bg-destructive/15 text-destructive px-3 py-1.5 text-xs font-medium hover:bg-destructive/25"
                >
                  Limpar tudo
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-2 py-2 text-left">Ficheiro</th>
                    <th className="px-2 py-2 text-left">Linha do BP</th>
                    <th className="px-2 py-2 text-left">Match</th>
                    <th className="px-2 py-2 text-right">Tamanho</th>
                    <th className="px-2 py-2 text-center">Estado</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((f) => {
                    const lbl = strategyLabel(f.strategy);
                    return (
                      <tr
                        key={f.id}
                        className={`border-t border-border ${f.excluded ? "opacity-40" : ""}`}
                      >
                        <td className="px-2 py-1.5 font-mono truncate max-w-[260px]" title={f.name}>
                          <FileText className="inline h-3 w-3 text-muted-foreground mr-1" />
                          {f.name}
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={f.forecastId ?? ""}
                            onChange={(e) => setForecast(f.id, e.target.value || null)}
                            disabled={f.status === "uploading" || f.status === "done"}
                            className="w-full max-w-[300px] rounded border border-border bg-background px-1.5 py-1 text-xs"
                          >
                            <option value="">— Não anexar —</option>
                            {candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.description}
                                {c.supplier_name ? ` · ${c.supplier_name}` : ""}
                                {` (${c.amount.toFixed(2)}€)`}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${lbl.cls}`}>
                            {lbl.label}
                            {f.score > 0 && f.strategy !== "drive-id" ? ` ${Math.round(f.score * 100)}%` : ""}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">{bytesToReadable(f.size)}</td>
                        <td className="px-2 py-1.5 text-center">
                          {f.status === "uploading" && <Loader2 className="inline h-3.5 w-3.5 animate-spin text-primary" />}
                          {f.status === "done" && <CheckCircle2 className="inline h-3.5 w-3.5 text-success" />}
                          {f.status === "error" && (
                            <span title={f.errorMsg}>
                              <AlertCircle className="inline h-3.5 w-3.5 text-destructive" />
                            </span>
                          )}
                          {f.status === "pending" && (
                            <button
                              onClick={() => toggleExclude(f.id)}
                              className="text-[10px] underline text-muted-foreground hover:text-foreground"
                            >
                              {f.excluded ? "incluir" : "excluir"}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            onClick={() => removeFile(f.id)}
                            disabled={f.status === "uploading"}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                disabled={uploading}
                className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50"
              >
                Fechar
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || eligible.length === 0}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Carregar ({eligible.length})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}