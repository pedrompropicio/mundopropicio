/**
 * Porta de entrada das faturas de tráfego pago (D-ERP31).
 *
 * Fluxo obrigatório em três fases, sem exceção:
 *   1. escolher plataforma e ficheiro PDF;
 *   2. ler (dry-run) e mostrar o que o parser encontrou — nada é gravado;
 *   3. só depois de a pessoa confirmar é que a proposta é gravada.
 *
 * O PDF fica sempre arquivado no bucket privado "ads-invoices", em caminho
 * isolado por empresa, porque a fatura é um facto externo.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/mock-data";

type Platform = "meta" | "google";

interface DryRunResult {
  platform: string;
  invoice_number: string;
  billing_period: string;
  issue_date: string | null;
  period_start?: string | null;
  period_end?: string | null;
  total_amount: number;
  lines_sum: number;
  reconcilia: boolean;
  linhas: number;
  warnings?: string[];
}

const platformLabels: Record<Platform, string> = { meta: "Meta", google: "Google" };

/**
 * Num non-2xx o `data` vem null e a mensagem do erro é genérica: o corpo real
 * está em `error.context`, que é um Response. Mesmo padrão do callApply.
 */
async function fnErrorMessage(error: unknown): Promise<string> {
  const anyErr = error as any;
  const ctx = anyErr?.context;
  let payload: any = null;
  try { payload = await ctx?.json?.(); } catch { /* sem corpo JSON */ }
  if (payload?.error) return String(payload.error);
  const status = ctx?.status;
  if (status) return `${anyErr?.message ?? "erro da função"} (HTTP ${status})`;
  return anyErr?.message ?? String(error);
}

function periodLabel(period: string | null | undefined): string {
  if (!period) return "—";
  const [y, m] = period.split("-");
  return `${m}/${y}`;
}

export function AdsInvoiceImportDialog({ companyId }: { companyId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("google");
  const [file, setFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setFilePath(null);
    setPreview(null);
    setError(null);
    setBusy(false);
  };

  const action = platform === "meta" ? "parse_meta" : "parse_google";

  /** Fase 2 — sobe o ficheiro e lê, sem gravar nada. */
  const doRead = async () => {
    if (!file || !companyId) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${companyId}/faturas/${platform}/${stamp}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("ads-invoices")
        .upload(path, file, { contentType: "application/pdf", upsert: true });
      if (upErr) throw new Error(`arquivo do ficheiro: ${upErr.message}`);
      setFilePath(path);

      const { data, error: fnErr } = await supabase.functions.invoke("ads-invoice-ingest", {
        body: { action, file_path: path, company_id: companyId, dry_run: true },
      });
      if (fnErr) throw new Error(await fnErrorMessage(fnErr));
      if ((data as any)?.error) throw new Error(String((data as any).error));
      setPreview(data as DryRunResult);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  /** Fase 3 — grava a proposta. Só chega aqui depois da confirmação humana. */
  const doSave = async () => {
    if (!filePath || !companyId) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("ads-invoice-ingest", {
        body: { action, file_path: filePath, company_id: companyId },
      });
      if (fnErr) throw new Error(await fnErrorMessage(fnErr));
      if ((data as any)?.error) throw new Error(String((data as any).error));
      await qc.invalidateQueries({ queryKey: ["ads-invoices"] });
      await qc.invalidateQueries({ queryKey: ["ads-invoice-lines"] });
      toast.success(
        `Fatura ${(data as any).invoice_number} importada — ${(data as any).linhas} linhas, ` +
          `${formatCurrency(Number((data as any).total_amount))}`,
      );
      setOpen(false);
      reset();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="mr-2 h-4 w-4" /> Importar fatura
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar fatura de tráfego pago</DialogTitle>
          <DialogDescription>
            O ficheiro é lido primeiro e mostrado aqui. Nada é gravado até confirmares.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plataforma</Label>
            <div className="flex gap-2">
              {(["google", "meta"] as Platform[]).map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={platform === p ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => {
                    setPlatform(p);
                    setPreview(null);
                    setFilePath(null);
                  }}
                >
                  {platformLabels[p]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ads-invoice-file">Ficheiro PDF da fatura</Label>
            <Input
              id="ads-invoice-file"
              type="file"
              accept="application/pdf"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setFilePath(null);
                setError(null);
              }}
            />
          </div>

          {preview && (
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">
                  {platformLabels[platform]} · fatura {preview.invoice_number}
                </span>
                {preview.reconcilia ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-4 w-4" /> Reconcilia
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-warning">
                    <AlertTriangle className="h-4 w-4" /> Não reconcilia
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Período</dt>
                <dd>{periodLabel(preview.billing_period)}</dd>
                {preview.period_start && (
                  <>
                    <dt className="text-muted-foreground">Dias faturados</dt>
                    <dd>
                      {preview.period_start} a {preview.period_end}
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Total da fatura</dt>
                <dd>{formatCurrency(Number(preview.total_amount))}</dd>
                <dt className="text-muted-foreground">Soma das linhas</dt>
                <dd>{formatCurrency(Number(preview.lines_sum))}</dd>
                <dt className="text-muted-foreground">Linhas</dt>
                <dd>{preview.linhas}</dd>
              </dl>
              {preview.warnings && preview.warnings.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-warning">
                  {preview.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              {!preview.reconcilia && (
                <p className="mt-2 text-[11px] text-warning">
                  A soma das linhas não bate com o total. Verifica o ficheiro antes de gravar.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {!companyId && (
            <Badge variant="outline" className="text-warning">
              Empresa ativa não resolvida
            </Badge>
          )}
        </div>

        <DialogFooter>
          {!preview ? (
            <Button disabled={!file || !companyId || busy} onClick={doRead}>
              {busy ? "A ler…" : "Ler ficheiro"}
            </Button>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>
                Voltar
              </Button>
              <Button disabled={busy} onClick={doSave}>
                {busy ? "A gravar…" : "Gravar proposta"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
