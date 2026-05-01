import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Upload, AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  parseSponsorsXlsx,
  SPONSOR_KIND_LABEL,
  type ParsedSponsorRow,
  type SponsorImportKind,
} from "@/lib/parse-sponsors-xlsx";
import type {
  SponsorshipDocStatus,
  SponsorshipStage,
} from "@/lib/sponsorship-pipeline";
import { syncSponsorToBP } from "@/lib/sponsorship-bp-sync";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
  companyId: string | null;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n || 0);

/** Mapping kind do parser → estado no pipeline CRM */
function kindToPipeline(kind: SponsorImportKind): {
  stage: SponsorshipStage;
  doc_status: SponsorshipDocStatus | null;
} {
  switch (kind) {
    case "paid":
      return { stage: "closed", doc_status: "invoice_received" };
    case "pending_invoiced":
      return { stage: "closed", doc_status: "invoice_sent" };
    case "pending_post_event":
      return { stage: "closed", doc_status: "post_event" };
    case "barter":
      return { stage: "barter", doc_status: null };
    case "forecast_only":
    default:
      return { stage: "negotiating", doc_status: "awaiting" };
  }
}

export function SponsorshipPipelineImportModal({
  open,
  onOpenChange,
  eventId,
  companyId,
}: Props) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ReturnType<typeof parseSponsorsXlsx> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeKinds, setIncludeKinds] = useState<Record<SponsorImportKind, boolean>>({
    paid: true,
    pending_invoiced: true,
    pending_post_event: true,
    barter: true,
    forecast_only: true,
  });

  useEffect(() => {
    if (!open) {
      setFile(null);
      setFileName("");
      setParsed(null);
      setError(null);
    }
  }, [open]);

  async function handleFile(f: File) {
    setFile(f);
    setFileName(f.name);
    setError(null);
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const result = parseSponsorsXlsx(buf);
      setParsed(result);
    } catch (e: any) {
      setError(e.message || "Erro ao ler ficheiro.");
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }

  const filteredRows: ParsedSponsorRow[] = useMemo(
    () => (parsed?.rows || []).filter((r) => includeKinds[r.kind]),
    [parsed, includeKinds],
  );

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Empresa não identificada — recarrega a página.");
      if (!filteredRows.length) throw new Error("Nada para importar (todos os tipos desligados).");

      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id ?? null;

      // Carregar pipeline existente para idempotência por (event_id, supplier_name)
      const { data: existing, error: exErr } = await supabase
        .from("sponsorship_pipeline" as never)
        .select("id, supplier_name")
        .eq("event_id", eventId);
      if (exErr) {
        console.error("[sponsors-import] select existing failed", exErr);
        throw new Error(`Não consegui ler o pipeline existente: ${exErr.message}`);
      }

      const norm = (s: string) =>
        s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      const map = new Map<string, any>();
      for (const r of (existing as any[]) || []) map.set(norm(r.supplier_name), r);

      let inserted = 0;
      let updated = 0;
      const failures: string[] = [];

      for (const row of filteredRows) {
        const { stage, doc_status } = kindToPipeline(row.kind);
        const isClosed = stage === "closed" || stage === "barter";
        const payload: any = {
          event_id: eventId,
          company_id: companyId,
          created_by: userId,
          supplier_name: row.supplierName,
          stage,
          doc_status,
          proposed_amount: isClosed ? 0 : row.effectiveAmount,
          confirmed_amount: isClosed ? row.effectiveAmount : 0,
          currency: "EUR",
          iva_rate: 23,
          priority: "medium",
          // Patrocínios "fechados" (com fatura recebida, enviada ou pós-evento) sincronizam
          // automaticamente para o BP/TX. Permutas e leads em negociação ficam só no pipeline.
          auto_sync_bp:
            row.kind === "paid" ||
            row.kind === "pending_invoiced" ||
            row.kind === "pending_post_event",
          notes: row.rawStatus
            ? `Importado de ${fileName} • estado original: "${row.rawStatus}"`
            : `Importado de ${fileName}`,
        };

        const found = map.get(norm(row.supplierName));
        let synced: { id: string; row: any } | null = null;
        if (found) {
          const { data: upd, error } = await supabase
            .from("sponsorship_pipeline" as never)
            .update({
              stage: payload.stage,
              doc_status: payload.doc_status,
              proposed_amount: payload.proposed_amount,
              confirmed_amount: payload.confirmed_amount,
              notes: payload.notes,
              auto_sync_bp: payload.auto_sync_bp,
            } as never)
            .eq("id", found.id)
            .select()
            .single();
          if (error || !upd) {
            console.error("[sponsors-import] update failed", row.supplierName, error);
            failures.push(`${row.supplierName}: ${error?.message ?? "update vazio"}`);
            continue;
          }
          updated++;
          synced = { id: (upd as any).id, row: upd };
        } else {
          const { data: ins, error } = await supabase
            .from("sponsorship_pipeline" as never)
            .insert(payload as never)
            .select()
            .single();
          if (error || !ins) {
            console.error("[sponsors-import] insert failed", row.supplierName, payload, error);
            failures.push(`${row.supplierName}: ${error?.message ?? "insert vazio"}`);
            continue;
          }
          inserted++;
          synced = { id: (ins as any).id, row: ins };
        }

        // Sincronização BP/TX (best-effort, não bloqueia o import)
        if (synced) {
          try {
            await syncSponsorToBP(synced.row);
          } catch (e) {
            console.error("[sponsors-import] sync BP failed", row.supplierName, e);
            failures.push(`${row.supplierName} (sync BP): ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      console.log("[sponsors-import] done", { inserted, updated, failuresCount: failures.length, failures });
      return { inserted, updated, failures };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sponsorship-pipeline", eventId] });
      qc.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });

      if (res.inserted === 0 && res.updated === 0) {
        // Tudo falhou — não fechar e mostrar erro detalhado
        const sample = res.failures.slice(0, 3).join(" | ");
        toast({
          title: "Nada foi importado",
          description: res.failures.length
            ? `${res.failures.length} falhas. Exemplo: ${sample}`
            : "Verifica permissões ou conteúdo do ficheiro.",
          variant: "destructive",
        });
        return;
      }

      const failNote = res.failures.length ? ` • ${res.failures.length} falhas (ver consola)` : "";
      toast({
        title: "Pipeline atualizado",
        description: `${res.inserted} novos, ${res.updated} atualizados.${failNote}`,
      });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({ title: "Erro na importação", description: e.message, variant: "destructive" }),
  });

  // Re-sync de cards já existentes no pipeline cujo BP/TX ainda não foi criado
  // (útil quando uma importação anterior falhou no sync mas inseriu o card).
  const resyncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("sponsorship_pipeline" as never)
        .select("*")
        .eq("event_id", eventId)
        .eq("auto_sync_bp", true)
        .eq("stage", "closed")
        .is("linked_transaction_id", null);
      if (error) throw error;
      const rows = (data as any[]) || [];
      let synced = 0;
      const failures: string[] = [];
      for (const r of rows) {
        try {
          const res = await syncSponsorToBP(r);
          if (!("skipped" in res) || !res.skipped) synced++;
          else failures.push(`${r.supplier_name}: ${res.reason}`);
        } catch (e) {
          failures.push(`${r.supplier_name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      console.log("[sponsors-resync] done", { total: rows.length, synced, failures });
      return { total: rows.length, synced, failures };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sponsorship-pipeline", eventId] });
      qc.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      const failNote = res.failures.length
        ? ` • ${res.failures.length} falhas: ${res.failures.slice(0, 2).join(" | ")}`
        : "";
      toast({
        title: "Re-sincronização concluída",
        description: `${res.synced}/${res.total} cards sincronizados com BP/TX.${failNote}`,
        variant: res.synced === 0 && res.total > 0 ? "destructive" : "default",
      });
    },
    onError: (e: Error) =>
      toast({ title: "Erro na re-sincronização", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar patrocínios para o pipeline</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto pr-1">
          {!parsed && (
            <div className="space-y-2">
              <Label>Ficheiro Excel (BP com aba "Pipe")</Label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                disabled={parsing}
              />
              {parsing && (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> A processar…
                </p>
              )}
              {error && (
                <p className="text-sm text-destructive flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  {error}
                </p>
              )}
            </div>
          )}

          {parsed && (
            <>
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="font-medium mb-1">Resumo do ficheiro</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <Stat label="Total linhas" value={String(parsed.totals.countTotal)} />
                  <Stat label="Confirmados (Fatura recebida)" value={fmt(parsed.totals.sumPaid)} />
                  <Stat label="Pendentes (Faturados/Pós-evento)" value={fmt(parsed.totals.sumPending)} />
                  <Stat label="Permutas" value={String(parsed.totals.countBarter)} />
                  <Stat label="Em negociação (sem estado)" value={fmt(parsed.totals.sumForecastOnly)} />
                  <Stat label="Total geral" value={fmt(parsed.totals.sumGrand)} highlight />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Que tipos de linhas importar?
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(
                    ["paid", "pending_invoiced", "pending_post_event", "barter", "forecast_only"] as SponsorImportKind[]
                  ).map((k) => {
                    const count = parsed.rows.filter((r) => r.kind === k).length;
                    const sum = parsed.rows
                      .filter((r) => r.kind === k)
                      .reduce((s, r) => s + r.effectiveAmount, 0);
                    return (
                      <label
                        key={k}
                        className="flex items-center gap-2 text-sm rounded border p-2 cursor-pointer hover:bg-accent/40"
                      >
                        <Checkbox
                          checked={includeKinds[k]}
                          onCheckedChange={(v) =>
                            setIncludeKinds((s) => ({ ...s, [k]: !!v }))
                          }
                        />
                        <div className="flex-1">
                          <div className="font-medium">{SPONSOR_KIND_LABEL[k]}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {count} linhas • {fmt(sum)}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  <b>Fatura recebida</b>, <b>Fatura enviada</b> e <b>Pós-evento</b> entram com auto-sync ao BP
                  (fatura recebida cria TX paga; restantes ficam pendentes). <b>Permutas</b> e linhas
                  em negociação ficam só no pipeline até promoção manual.
                </p>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pré-visualização ({filteredRows.length} linhas)
                </Label>
                <ScrollArea className="h-64 rounded border mt-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Patrocinador</TableHead>
                        <TableHead>Estado original</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((r) => (
                        <TableRow key={`${r.rowIndex}-${r.supplierName}`}>
                          <TableCell className="font-medium">{r.supplierName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.rawStatus || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {SPONSOR_KIND_LABEL[r.kind]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.kind === "barter" ? (
                              <span className="text-muted-foreground">permuta</span>
                            ) : (
                              fmt(r.effectiveAmount)
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              {parsed.warnings.length > 0 && (
                <div className="text-xs text-amber-400 space-y-1">
                  {parsed.warnings.slice(0, 5).map((w, i) => (
                    <p key={i}>⚠ {w}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => resyncMutation.mutate()}
            disabled={resyncMutation.isPending || importMutation.isPending}
            title="Cria BP e transações para cards 'fechados' do pipeline que ainda não foram sincronizados"
          >
            {resyncMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : null}
            Re-sincronizar pendentes
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={!parsed || !filteredRows.length || importMutation.isPending}
          >
            {importMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            Importar {filteredRows.length} linhas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={highlight ? "font-bold text-primary" : "font-semibold"}>{value}</p>
    </div>
  );
}
