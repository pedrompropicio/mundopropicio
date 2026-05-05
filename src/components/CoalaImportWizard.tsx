import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/mock-data";

type Step = "upload" | "review" | "applying" | "done";
type SyncMode = "replace" | "append";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  eventName?: string;
}

/**
 * 4-step Coala BP importer wizard:
 *  1. Upload XLSX + version label
 *  2. Review parsed totals + validation issues + pendencies
 *  3. Confirm sync mode and totals → apply
 *  4. Done summary with link to pendency report
 *
 * Generic: works for ANY future Coala version (V13, V14, …). The version label
 * the user types is what gets stamped on the import run + BP snapshot.
 */
export function CoalaImportWizard({ open, onOpenChange, eventId, eventName }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileVersion, setFileVersion] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [parseResp, setParseResp] = useState<any | null>(null);
  const [syncMode, setSyncMode] = useState<SyncMode>("replace");
  const [ackTotals, setAckTotals] = useState(false);
  const [applyResp, setApplyResp] = useState<any | null>(null);

  const reset = () => {
    setStep("upload");
    setFile(null);
    setFileVersion("");
    setParseResp(null);
    setApplyResp(null);
    setAckTotals(false);
    setSyncMode("replace");
  };
  const close = () => { onOpenChange(false); setTimeout(reset, 250); };

  const toBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = reject;
      r.readAsDataURL(f);
    });

  async function handleParse() {
    if (!file || !fileVersion.trim()) {
      toast({ title: "Faltam dados", description: "Seleciona o ficheiro e indica a versão (ex: V13).", variant: "destructive" });
      return;
    }
    setParsing(true);
    try {
      const fileBase64 = await toBase64(file);
      const { data, error } = await supabase.functions.invoke("parse-coala-bp", {
        body: { fileBase64, fileName: file.name, fileVersion: fileVersion.trim(), eventId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setParseResp(data);
      setStep("review");
    } catch (e: any) {
      toast({ title: "Erro a analisar XLSX", description: e.message, variant: "destructive" });
    } finally { setParsing(false); }
  }

  async function handleApply() {
    if (!file || !fileVersion.trim() || !ackTotals) return;
    setStep("applying");
    try {
      const fileBase64 = await toBase64(file);
      const { data, error } = await supabase.functions.invoke("apply-coala-bp", {
        body: { fileBase64, fileName: file.name, fileVersion: fileVersion.trim(), eventId, syncMode, ackTotals: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setApplyResp(data);
      qc.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      qc.invalidateQueries({ queryKey: ["event_transactions_actual", eventId] });
      setStep("done");
    } catch (e: any) {
      toast({ title: "Erro a aplicar import", description: e.message, variant: "destructive" });
      setStep("review");
    }
  }

  const t = parseResp?.parsed?.totals;
  const ft = parseResp?.parsed?.fileTotalsRow;
  const issues = parseResp?.validation?.issues ?? [];
  const hasErrors = parseResp?.validation?.hasErrors;

  return (
    <Dialog open={open} onOpenChange={(o) => o ? onOpenChange(o) : close()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Coala — {eventName ?? "BP"}
          </DialogTitle>
          <DialogDescription>
            Importador genérico para qualquer versão do ficheiro Coala (V13, V14, …).
            A versão indicada vai ser registada no histórico e na BP Version criada.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Versão do ficheiro</Label>
              <Input
                placeholder="Ex: V13, V14, V15…"
                value={fileVersion}
                onChange={(e) => setFileVersion(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ficheiro XLSX (Coala BP)</Label>
              <Input
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && <p className="text-xs text-muted-foreground">{file.name} • {(file.size / 1024).toFixed(0)} KB</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={close}>Cancelar</Button>
              <Button onClick={handleParse} disabled={!file || !fileVersion.trim() || parsing}>
                {parsing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Analisar
              </Button>
            </div>
          </div>
        )}

        {step === "review" && parseResp && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card label="Linhas importáveis" value={String(t.importableLines)} />
              <Card label="Linhas A&B excluídas" value={String(t.excludedLines)} tone="muted" />
              <Card label="Σ Net" value={formatCurrency(t.netSum)} />
              <Card label="Σ IVA" value={formatCurrency(t.ivaSum)} />
              <Card label="Σ Bruto" value={formatCurrency(t.grossSum)} />
              <Card label="Σ Pago bruto" value={formatCurrency(t.paidGrossSum)} />
              <Card label="Fornecedores distintos" value={String(t.suppliersDistinct)} />
              <Card label="Patrocínios confirmados" value={formatCurrency(t.sponsorsConfirmed)} />
            </div>

            {ft?.paidGross != null && (
              <p className="text-xs text-muted-foreground">
                Total Pago no XLSX (R2): <span className="font-mono">{formatCurrency(ft.paidGross)}</span> • calculado: <span className="font-mono">{formatCurrency(t.paidGrossSum)}</span>
              </p>
            )}

            <div className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {hasErrors ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                Validação
              </div>
              {issues.length === 0 && <p className="text-xs text-muted-foreground">Sem alertas.</p>}
              <ul className="space-y-1 text-xs">
                {issues.map((i: any, idx: number) => (
                  <li key={idx} className={
                    i.level === "error" ? "text-destructive" :
                    i.level === "warning" ? "text-warning" : "text-muted-foreground"
                  }>
                    [{i.level.toUpperCase()}] {i.message}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <Label>Modo de sincronização</Label>
              <RadioGroup value={syncMode} onValueChange={(v) => setSyncMode(v as SyncMode)}>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="replace" id="r1" />
                  <Label htmlFor="r1" className="font-normal text-sm">
                    <span className="font-medium">Substituir</span> — apaga linhas BP atuais sem transação ligada e reimporta tudo (recomendado para nova versão).
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="append" id="r2" />
                  <Label htmlFor="r2" className="font-normal text-sm">
                    <span className="font-medium">Acrescentar</span> — mantém o BP existente e adiciona linhas novas (cuidado com duplicação).
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-start gap-2 rounded border border-warning/40 bg-warning/5 p-3">
              <Checkbox id="ack" checked={ackTotals} onCheckedChange={(v) => setAckTotals(!!v)} />
              <Label htmlFor="ack" className="text-xs font-normal leading-relaxed">
                Confirmo que revi os totais acima (Net, IVA, Bruto, Pago) e os {t.importableLines} linhas a importar.
                Será criada automaticamente uma versão do BP antes de aplicar.
              </Label>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
              <Button onClick={handleApply} disabled={!ackTotals}>Aplicar Import</Button>
            </div>
          </div>
        )}

        {step === "applying" && (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">A aplicar import e a criar transações…</p>
          </div>
        )}

        {step === "done" && applyResp && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Import concluído</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Card label="Linhas BP criadas" value={String(applyResp.summary.forecastsCreated)} />
              <Card label="Transações criadas" value={String(applyResp.summary.transactionsCreated)} />
              <Card label="Fornecedores novos" value={String(applyResp.summary.suppliersCreated)} />
              <Card label="A&B excluídos" value={String(applyResp.summary.excludedAB)} tone="muted" />
            </div>
            <div className="rounded border border-border/60 p-3 text-xs space-y-1">
              <p className="font-semibold flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Pendências para revisão</p>
              <p>• Sem CC (→ "0.0.99"): {applyResp.summary.pendencies.noCC}</p>
              <p>• Data em intervalo: {applyResp.summary.pendencies.dateInterval}</p>
              <p>• Formalidade ambígua: {applyResp.summary.pendencies.formalidadeAmbiguous}</p>
              <p>• IVA ajustado por snap: {applyResp.summary.pendencies.ivaSnapped}</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={close}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "muted" }) {
  return (
    <div className={`rounded-lg border border-border/60 p-3 ${tone === "muted" ? "bg-muted/30" : "bg-card"}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-mono font-semibold mt-1">{value}</p>
    </div>
  );
}
