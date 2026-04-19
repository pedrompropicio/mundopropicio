/**
 * Attachments step inserted between sheet mapping and the final BP import in
 * the Implantação flow.
 *
 * Two sources of attachments are merged into the parsed rows in memory:
 *   1. **Column links (G–K)** — already extracted by `parseXlsxPL` into
 *      `ParsedRow.attachments`. Shown for the user to confirm/remove.
 *   2. **ZIP / file upload** — user can drop a ZIP (or individual files) that
 *      get matched to the rows via `matchFilesToForecasts`, uploaded to
 *      `transaction-documents` storage and added as URLs to the row.
 *
 * On confirm, the parent receives back the (mutated) sheet so it can run the
 * regular import — every URL ends up in `event_forecasts.attachment_refs`.
 */
import { useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload,
  FileArchive,
  Sparkles,
  X,
  ExternalLink,
  Paperclip,
  Loader2,
  Trash2,
  AlertCircle,
} from "lucide-react";
import type { ParsedRow } from "@/lib/import-pl-xlsx";
import { matchFilesToForecasts, type BpForecastForMatch, type FileMatch } from "@/lib/bp-attachment-matching";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Rows that will be imported. Mutated copy is returned via onConfirm. */
  rows: ParsedRow[];
  /** Display label for the destination event/sub-event */
  destinationLabel: string;
  /** Final confirm callback — receives rows with merged attachments */
  onConfirm: (rowsWithAttachments: ParsedRow[]) => void;
}

interface PendingFile {
  id: string;
  name: string;
  size: number;
  blob: Blob;
  /** index into rows[] (the matched ParsedRow), or null */
  rowIdx: number | null;
  score: number;
  strategy: FileMatch["strategy"];
  status: "pending" | "uploading" | "done" | "error";
  uploadedUrl?: string;
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

export default function BPAttachmentsStep({
  open,
  onOpenChange,
  rows,
  destinationLabel,
  onConfirm,
}: Props) {
  // Local working copy of the rows so the user can remove auto-extracted links
  // without affecting the parent state until they confirm.
  const [workingRows, setWorkingRows] = useState<ParsedRow[]>(rows);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (open) {
      // Deep-copy attachments so modal edits never leak back via reference
      setWorkingRows(rows.map((r) => ({ ...r, attachments: [...(r.attachments ?? [])] })));
      setFiles([]);
    }
  }, [open, rows]);

  /** Fake "forecasts" derived from the in-memory rows — index acts as ID. */
  const matchCandidates = useMemo<BpForecastForMatch[]>(
    () =>
      workingRows.map((r, idx) => ({
        id: String(idx),
        event_id: "_pending",
        description: r.description,
        amount: r.baseAmount,
        supplier_name: r.specification ?? null,
        attachment_refs: (r.attachments ?? []).map((url) => ({ url })),
      })),
    [workingRows],
  );

  const totalLinksFromColumns = useMemo(
    () => workingRows.reduce((s, r) => s + (r.attachments?.length ?? 0), 0),
    [workingRows],
  );

  /** Remove a column-extracted link from a specific row */
  const removeAttachment = (rowIdx: number, url: string) => {
    setWorkingRows((prev) => {
      const next = [...prev];
      next[rowIdx] = {
        ...next[rowIdx],
        attachments: (next[rowIdx].attachments ?? []).filter((u) => u !== url),
      };
      return next;
    });
  };

  /** Add raw files (unzipping ZIPs) and run matching */
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
              expanded.push({ name: e.name.split("/").pop() || e.name, blob, size: blob.size });
            }
          } catch (err: any) {
            toast.error(`Erro a abrir ZIP ${f.name}: ${err.message}`);
          }
        } else {
          expanded.push({ name: f.name, blob: f, size: f.size });
        }
      }

      const valid = expanded.filter((e) => e.size <= MAX_FILE_BYTES);
      const oversized = expanded.length - valid.length;
      if (oversized > 0) {
        toast.warning(`${oversized} ficheiro(s) ignorado(s) (>10 MB)`);
      }
      if (valid.length === 0) return;

      const matches = matchFilesToForecasts({
        fileNames: valid.map((v) => v.name),
        forecasts: matchCandidates,
      });

      const newPending: PendingFile[] = valid.map((v, i) => {
        const m = matches[i];
        const rowIdx = m.forecastId === null ? null : Number(m.forecastId);
        return {
          id: `${Date.now()}-${i}-${v.name}`,
          name: v.name,
          size: v.size,
          blob: v.blob,
          rowIdx: Number.isFinite(rowIdx as number) ? (rowIdx as number) : null,
          score: m.score,
          strategy: m.strategy,
          status: "pending",
        };
      });
      setFiles((prev) => [...prev, ...newPending]);
    } finally {
      setExtracting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const list = Array.from(e.dataTransfer.files ?? []);
    if (list.length > 0) void addFiles(list);
  };

  const reassignFile = (id: string, rowIdx: number | null) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, rowIdx } : f)));
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const filesByRow = useMemo(() => {
    const map = new Map<number, PendingFile[]>();
    for (const f of files) {
      if (f.rowIdx === null) continue;
      const arr = map.get(f.rowIdx) ?? [];
      arr.push(f);
      map.set(f.rowIdx, arr);
    }
    return map;
  }, [files]);

  const unmatchedCount = files.filter((f) => f.rowIdx === null).length;

  /** Upload all queued files to storage, merge URLs into rows, then call onConfirm. */
  const handleConfirm = async () => {
    setUploading(true);
    try {
      const finalRows = workingRows.map((r) => ({
        ...r,
        attachments: [...(r.attachments ?? [])],
      }));

      const uploadable = files.filter((f) => f.rowIdx !== null);
      let uploadedCount = 0;
      const uploadErrors: string[] = [];

      for (const f of uploadable) {
        try {
          // Sanitize and upload — store under bp-imports/<timestamp>/<name>
          const safeName = f.name.replace(/[^\w.\-]+/g, "_");
          const path = `bp-imports/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
          const { error: upErr } = await supabase.storage
            .from("transaction-documents")
            .upload(path, f.blob, { contentType: f.blob.type || undefined });
          if (upErr) throw upErr;

          const { data: signed } = await supabase.storage
            .from("transaction-documents")
            .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
          const url = signed?.signedUrl;
          if (!url) throw new Error("Sem URL assinada");

          const idx = f.rowIdx as number;
          if (!finalRows[idx].attachments.includes(url)) {
            finalRows[idx].attachments.push(url);
          }
          uploadedCount++;
        } catch (err: any) {
          uploadErrors.push(`${f.name}: ${err.message}`);
        }
      }

      if (uploadErrors.length > 0) {
        toast.error(`${uploadErrors.length} ficheiro(s) com erro`, {
          description: uploadErrors.slice(0, 2).join("; "),
        });
      }
      if (uploadedCount > 0) {
        toast.success(`${uploadedCount} ficheiro(s) anexado(s) ao BP`);
      }

      onConfirm(finalRows);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Erro a anexar: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-5 w-5 text-primary" />
            Anexos da importação — {destinationLabel}
          </DialogTitle>
          <DialogDescription>
            Confirma os links extraídos das colunas G–K do XLSX e/ou anexa um
            ZIP (ou ficheiros individuais) para casamento automático com as
            linhas. Os anexos serão guardados nas linhas do BP após a importação.
          </DialogDescription>
        </DialogHeader>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary" className="gap-1">
            <Paperclip className="h-3 w-3" />
            {totalLinksFromColumns} link(s) das colunas
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <FileArchive className="h-3 w-3" />
            {files.length} ficheiro(s) carregado(s)
          </Badge>
          {unmatchedCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              {unmatchedCount} sem destino
            </Badge>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Arrasta um ZIP ou ficheiros aqui</p>
          <p className="text-xs text-muted-foreground mb-3">
            Casamento automático por nome de fornecedor, Drive ID ou similaridade
          </p>
          <label className="inline-block">
            <input
              type="file"
              multiple
              className="hidden"
              accept=".zip,.pdf,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                if (list.length > 0) void addFiles(list);
                e.target.value = "";
              }}
            />
            <Button asChild variant="outline" size="sm" disabled={extracting}>
              <span>{extracting ? "A extrair…" : "Escolher ficheiros"}</span>
            </Button>
          </label>
        </div>

        {/* Files awaiting upload (with auto-matched row) */}
        {files.length > 0 && (
          <div className="rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Ficheiros sugeridos para anexar
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {files.map((f) => {
                const sl = strategyLabel(f.strategy);
                return (
                  <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="flex-1 min-w-0 truncate" title={f.name}>
                      {f.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {bytesToReadable(f.size)}
                      </span>
                    </span>
                    <Badge variant="outline" className={`text-[10px] ${sl.cls}`}>
                      {sl.label}
                    </Badge>
                    <Select
                      value={f.rowIdx === null ? "none" : String(f.rowIdx)}
                      onValueChange={(v) => reassignFile(f.id, v === "none" ? null : Number(v))}
                    >
                      <SelectTrigger className="h-7 w-64 text-xs">
                        <SelectValue placeholder="Escolher linha…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Não anexar</SelectItem>
                        {workingRows.map((r, idx) => (
                          <SelectItem key={idx} value={String(idx)}>
                            {r.description.slice(0, 60)}
                            {r.description.length > 60 ? "…" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeFile(f.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Existing column-extracted links per row */}
        {totalLinksFromColumns > 0 && (
          <div className="rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              Links detectados nas colunas G–K
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {workingRows.map((r, idx) => {
                if ((r.attachments ?? []).length === 0) return null;
                const incoming = filesByRow.get(idx)?.length ?? 0;
                return (
                  <div key={idx} className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{r.description}</span>
                      {incoming > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          +{incoming} novo(s)
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(r.attachments ?? []).map((url) => (
                        <span
                          key={url}
                          className="inline-flex items-center gap-1 rounded bg-accent/40 px-2 py-0.5 text-[11px]"
                        >
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:underline max-w-[280px] truncate"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx, url)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => onConfirm(workingRows)}
            disabled={uploading}
          >
            Saltar anexos
          </Button>
          <Button onClick={handleConfirm} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
            Anexar e importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
