import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Upload, AlertTriangle, CheckCircle2, FileText, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/mock-data";

type Step = "upload" | "review" | "review-duplicates" | "applying" | "done";
type SyncMode = "replace" | "append";
type Decision = "skip" | "create";

interface FuzzyItem {
  rowNumber: number;
  description: string;
  netAmount: number;
  candidates: { id: string; description: string; amount: number; score: number }[];
  ai: { verdict: "same" | "different" | "unsure"; confidence: number; reason: string; bestCandidateId?: string };
}

interface PreviewResp {
  ok: boolean;
  summary: { totalImportable: number; exactDuplicates: number; fuzzyCandidates: number; clean: number };
  exactDuplicates: { rowNumber: number; description: string; netAmount: number }[];
  clean: { rowNumber: number; description: string; netAmount: number }[];
  review: FuzzyItem[];
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  eventName?: string;
}

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
  const [previewing, setPreviewing] = useState(false);
  const [previewResp, setPreviewResp] = useState<PreviewResp | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  const reset = () => {
    setStep("upload"); setFile(null); setFileVersion(""); setParseResp(null);
    setApplyResp(null); setAckTotals(false); setSyncMode("replace");
    setPreviewResp(null); setDecisions({});
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
      toast({ title: "Faltam dados", description: "Seleciona o ficheiro e indica a versão.", variant: "destructive" });
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

  async function handlePreview() {
    if (!file || !fileVersion.trim() || !ackTotals) return;
    setPreviewing(true);
    try {
      const fileBase64 = await toBase64(file);
      const { data, error } = await supabase.functions.invoke("apply-coala-bp", {
        body: { fileBase64, fileName: file.name, fileVersion: fileVersion.trim(), eventId, syncMode, ackTotals: true, phase: "preview" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const pv = data as PreviewResp;
      setPreviewResp(pv);
      // pré-preencher decisões com sugestões da IA: same → skip, different → create, unsure → vazio
      const initial: Record<string, Decision> = {};
      for (const r of pv.review) {
        if (r.ai.verdict === "same" && r.ai.confidence >= 0.75) initial[String(r.rowNumber)] = "skip";
        else if (r.ai.verdict === "different" && r.ai.confidence >= 0.75) initial[String(r.rowNumber)] = "create";
      }
      setDecisions(initial);
      if (pv.review.length === 0) {
        // Sem ambíguos → aplicar logo
        await handleApply(initial);
      } else {
        setStep("review-duplicates");
      }
    } catch (e: any) {
      toast({ title: "Erro na pré-análise", description: e.message, variant: "destructive" });
    } finally { setPreviewing(false); }
  }

  async function handleApply(decisionsToUse?: Record<string, Decision>) {
    if (!file || !fileVersion.trim()) return;
    // exigir decisão para todos os ambíguos
    const useD = decisionsToUse ?? decisions;
    if (previewResp) {
      const undecided = previewResp.review.filter((r) => !useD[String(r.rowNumber)]);
      if (undecided.length > 0) {
        toast({ title: "Faltam decisões", description: `${undecided.length} linha(s) ainda sem decisão.`, variant: "destructive" });
        return;
      }
    }
    setStep("applying");
    try {
      const fileBase64 = await toBase64(file);
      const { data, error } = await supabase.functions.invoke("apply-coala-bp", {
        body: { fileBase64, fileName: file.name, fileVersion: fileVersion.trim(), eventId, syncMode, ackTotals: true, phase: "apply", decisions: useD },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setApplyResp(data);
      qc.invalidateQueries({ queryKey: ["event_forecasts", eventId] });
      qc.invalidateQueries({ queryKey: ["event_transactions_actual", eventId] });
      setStep("done");
    } catch (e: any) {
      toast({ title: "Erro a aplicar import", description: e.message, variant: "destructive" });
      setStep(previewResp ? "review-duplicates" : "review");
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
            Importador genérico (V13, V14, …). A versão indicada é registada no histórico e na BP Version criada.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Versão do ficheiro</Label>
              <Input placeholder="Ex: V13, V14, V15…" value={fileVersion} onChange={(e) => setFileVersion(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Ficheiro XLSX (Coala BP)</Label>
              <Input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
                  <li key={idx} className={i.level === "error" ? "text-destructive" : i.level === "warning" ? "text-warning" : "text-muted-foreground"}>
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
                    <span className="font-medium">Substituir</span> — apaga linhas BP atuais sem transação ligada e reimporta tudo.
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="append" id="r2" />
                  <Label htmlFor="r2" className="font-normal text-sm">
                    <span className="font-medium">Acrescentar</span> — mantém o BP existente e adiciona linhas novas.
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-start gap-2 rounded border border-warning/40 bg-warning/5 p-3">
              <Checkbox id="ack" checked={ackTotals} onCheckedChange={(v) => setAckTotals(!!v)} />
              <Label htmlFor="ack" className="text-xs font-normal leading-relaxed">
                Confirmo que revi os totais acima. Será criada uma versão do BP antes de aplicar.
              </Label>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
              <Button onClick={handlePreview} disabled={!ackTotals || previewing}>
                {previewing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Pré-analisar duplicados (IA)
              </Button>
            </div>
          </div>
        )}

        {step === "review-duplicates" && previewResp && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              <Card label="Total" value={String(previewResp.summary.totalImportable)} />
              <Card label="Já existem (exato)" value={String(previewResp.summary.exactDuplicates)} tone="muted" />
              <Card label="Sem match" value={String(previewResp.summary.clean)} />
              <Card label="A decidir" value={String(previewResp.summary.fuzzyCandidates)} />
            </div>
            <div className="rounded border border-primary/30 bg-primary/5 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-semibold mb-1"><Sparkles className="h-3.5 w-3.5" /> A IA já sugeriu decisões com confiança alta. Revê e decide os restantes.</p>
              <p className="text-muted-foreground">Quando consideras "Já existe" a categoria atual no BP é mantida.</p>
            </div>

            <div className="space-y-2 max-h-[45vh] overflow-y-auto">
              {previewResp.review.map((r) => {
                const dec = decisions[String(r.rowNumber)];
                const aiClass =
                  r.ai.verdict === "same" ? "border-success/40 bg-success/5" :
                  r.ai.verdict === "different" ? "border-info/40 bg-info/5" :
                  "border-warning/40 bg-warning/5";
                return (
                  <div key={r.rowNumber} className={`rounded border p-3 space-y-2 ${aiClass}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs flex-1 min-w-0">
                        <p className="font-mono text-[10px] text-muted-foreground">Linha #{r.rowNumber}</p>
                        <p className="font-medium truncate">{r.description}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{formatCurrency(r.netAmount)}</p>
                      </div>
                      <div className="text-[10px] uppercase font-semibold whitespace-nowrap">
                        IA: {r.ai.verdict} ({Math.round((r.ai.confidence ?? 0) * 100)}%)
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground italic">{r.ai.reason}</div>
                    <div className="space-y-1">
                      {r.candidates.map((c) => (
                        <div key={c.id} className={`text-[11px] rounded bg-background/60 px-2 py-1 ${c.id === r.ai.bestCandidateId ? "ring-1 ring-primary/40" : ""}`}>
                          <span className="font-mono text-muted-foreground">{Math.round(c.score * 100)}%</span> · {c.description} · <span className="font-mono">{formatCurrency(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant={dec === "skip" ? "default" : "outline"}
                        onClick={() => setDecisions({ ...decisions, [String(r.rowNumber)]: "skip" })}>
                        É a mesma · saltar
                      </Button>
                      <Button size="sm" variant={dec === "create" ? "default" : "outline"}
                        onClick={() => setDecisions({ ...decisions, [String(r.rowNumber)]: "create" })}>
                        É diferente · criar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center gap-2 pt-2">
              <p className="text-xs text-muted-foreground">
                {Object.keys(decisions).length}/{previewResp.review.length} decididos
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("review")}>Voltar</Button>
                <Button onClick={() => handleApply()} disabled={Object.keys(decisions).length < previewResp.review.length}>
                  Aplicar Import
                </Button>
              </div>
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
              <Card label="BP duplicados (skip)" value={String(applyResp.summary.forecastsSkipped ?? 0)} tone="muted" />
              <Card label="TX duplicadas (skip)" value={String(applyResp.summary.transactionsSkipped ?? 0)} tone="muted" />
              <Card label="Fornecedores novos" value={String(applyResp.summary.suppliersCreated)} />
              <Card label="A&B excluídos" value={String(applyResp.summary.excludedAB)} tone="muted" />
            </div>
            <div className="rounded border border-border/60 p-3 text-xs space-y-2">
              <p className="font-semibold flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Pendências para revisão</p>
              <PendencyGroup label={`Sem CC (→ "0.0.99")`} count={applyResp.summary.pendencies.noCC} rows={applyResp.summary.pendencies.details?.noCC} />
              <PendencyGroup label="Data em intervalo" count={applyResp.summary.pendencies.dateInterval} rows={applyResp.summary.pendencies.details?.dateInterval} />
              <PendencyGroup label="Formalidade ambígua" count={applyResp.summary.pendencies.formalidadeAmbiguous} rows={applyResp.summary.pendencies.details?.formalidadeAmbiguous} />
              <PendencyGroup label="IVA ajustado por snap" count={applyResp.summary.pendencies.ivaSnapped} rows={applyResp.summary.pendencies.details?.ivaSnapped} />
              <PendencyGroup label="A&B excluídos" count={applyResp.summary.pendencies.excludedAB} rows={applyResp.summary.pendencies.details?.excludedAB} />
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

interface PendencyRow { row: number; description: string; supplier?: string | null; amount?: number; detail?: string }
function PendencyGroup({ label, count, rows }: { label: string; count: number; rows?: PendencyRow[] }) {
  const [open, setOpen] = useState(false);
  if (!count) return <p className="text-muted-foreground">• {label}: 0</p>;
  return (
    <div>
      <button type="button" onClick={() => setOpen(o => !o)} className="text-left w-full hover:text-primary transition">
        • {label}: <span className="font-semibold">{count}</span> {rows?.length ? <span className="text-[10px] text-muted-foreground">({open ? "ocultar" : "ver linhas"})</span> : null}
      </button>
      {open && rows?.length ? (
        <ul className="mt-1 ml-3 space-y-0.5 max-h-48 overflow-y-auto border-l border-border/40 pl-2">
          {rows.map((r, i) => (
            <li key={i} className="text-[11px] font-mono">
              <span className="text-muted-foreground">L{r.row}</span> · {r.description}
              {typeof r.amount === "number" ? <span className="text-muted-foreground"> · {r.amount.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</span> : null}
              {r.detail ? <span className="text-amber-400"> · {r.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

