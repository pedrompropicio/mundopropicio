import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { FileSearch, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { DataEntryAdapter, DataEntryContext, DataEntryDocument } from "@/lib/data-entry-client";
import { parseAnalysisReport, type AnalysisReport, type AnalysisCandidate, type AnalysisTurn } from "@/lib/data-entry-analysis";
const LABELS = { supplier_name: "Fornecedor", supplier_nif: "NIF do fornecedor", invoice_number: "Número da fatura", invoice_date: "Data", currency: "Moeda", total_amount: "Total", iva_amount: "IVA", customer_nif: "NIF do destinatário" };
type Props = { adapter: DataEntryAdapter; context: DataEntryContext; sessionId: string; doc: DataEntryDocument; enabled: boolean; locked: boolean; onCandidate: (candidate: AnalysisCandidate) => void; onBusy: (busy: boolean) => void };
export default function DocumentAnalysisPanel({ adapter, context, sessionId, doc, enabled, locked, onCandidate, onBusy }: Props) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [applied, setApplied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const section = useRef<HTMLElement | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const analyze = async (question: string) => {
    if (!enabled || locked || controller.current || !adapter.analyze) return;
    const history: AnalysisTurn[] = messages.map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.parts.filter((p) => p.type === "text").map((p) => p.type === "text" ? p.text : "").join("") }));
    if (history.length > 8) { setError("Limite desta conversa atingido. Continua pela revisão manual."); return; }
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); onBusy(true); setError(null); setReport(null); setValues({}); setChecked(false); setApplied(false);
    setMessages((old) => [...old, { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: question }] }]);
    try {
      const result = parseAnalysisReport(await adapter.analyze(sessionId, doc.id, question, history, context, abort.signal));
      if (!alive.current || abort.signal.aborted) return;
      if (result.document_id !== doc.id || result.document_sha256 !== doc.sha256 || result.company_id !== context.company_id) throw new Error("Contexto da análise alterado. Resposta descartada.");
      setReport(result); setValues(Object.fromEntries(result.candidates.map((c) => [c.field, c.value ?? ""]))); setMessages((old) => [...old, { id: crypto.randomUUID(), role: "assistant", parts: [{ type: "text", text: result.answer }] }]);
    } catch (e) { if (alive.current) setError(abort.signal.aborted ? "Análise cancelada. Nenhum dado foi confirmado." : e instanceof Error ? e.message : "Análise indisponível."); }
    finally { if (alive.current) { setBusy(false); onBusy(false); controller.current = null; } }
  };
  const reviewable = (report?.candidates ?? []).filter((c) => c.field !== "currency" && (c.reviewable ?? c.usable));
  const notices = [...new Set(report?.warnings ?? [])];
  return <section ref={section} aria-label="Análise documental" className="space-y-3 border-t border-border pt-3">
    <h4 className="text-sm font-semibold">Análise documental</h4>
    <Button size="sm" variant="outline" disabled={!enabled || locked || busy || !adapter.analyze} onClick={() => void analyze("Extrai os campos da fatura, indicando origem e incertezas; não inferir pagamento, IVA ausente ou NIF do destinatário; não lançar nada.")}><FileSearch className="size-4" />Analisar documento</Button>
    {!enabled && <p role="status" className="text-xs text-muted-foreground">Análise ainda não ativada. Configuração e validação do serviço pendentes.</p>}
    {messages.length > 0 && <Conversation className="h-48 min-h-0"><ConversationContent className="gap-3 p-1">
      {messages.map((m) => <Message key={m.id} from={m.role}><MessageContent className={m.role === "user" ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground" : ""}>{m.parts.map((p, i) => p.type === "text" ? <MessageResponse key={i}>{p.text}</MessageResponse> : null)}</MessageContent></Message>)}
      {busy && <Shimmer className="text-xs">A analisar o documento…</Shimmer>}
    </ConversationContent></Conversation>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {report && <div className="space-y-3 text-xs">
      <p className="text-muted-foreground">NIF da empresa no ERP: {report.erp.company_tax ?? "não disponível"}</p>
      {notices.length > 0 && <div role="status" className="rounded-md border border-warning/40 bg-warning/10 p-2 space-y-1">{notices.map((w) => <p key={w}>{w}</p>)}</div>}
      <fieldset className="space-y-2" disabled={busy || locked}>
        <legend className="font-medium">Confere cada valor com o documento e corrige se necessário</legend>
        {report.candidates.filter((c) => c.field !== "customer_nif" || c.value !== null).map((c) => {
          const editable = c.field !== "currency" && (c.reviewable ?? c.usable);
          const id = `analysis-${c.field}`;
          return <div key={c.field} className="grid grid-cols-[8rem_1fr] items-center gap-2">
            <label htmlFor={id} className="text-muted-foreground">{LABELS[c.field]}</label>
            {editable
              ? <Input id={id} className="h-8 text-xs" value={values[c.field] ?? ""} onChange={(e) => { setValues((v) => ({ ...v, [c.field]: e.target.value })); setApplied(false); }} />
              : <span id={id} className="text-muted-foreground">{c.field === "currency" ? (c.value ?? "não indicada") : c.value ? `${c.value} — introduz manualmente` : "não encontrado — preenche manualmente"}</span>}
          </div>;
        })}
        <label className="flex items-start gap-2 pt-1"><Checkbox checked={checked} onCheckedChange={(v) => { setChecked(v === true); setApplied(false); }} /><span>Confirmei estes valores no documento.</span></label>
        <Button size="sm" type="button" disabled={!checked || reviewable.length === 0} onClick={() => {
          for (const c of reviewable) { const value = (values[c.field] ?? "").trim(); if (value) onCandidate({ ...c, value }); }
          setApplied(true);
        }}>Passar para os dados da fatura</Button>
        {applied && <p role="status" className="text-success">Valores passados para os dados da fatura. Prepara a prévia para continuar.</p>}
      </fieldset>
    </div>}
    {busy && <Button type="button" size="sm" variant="outline" onClick={() => controller.current?.abort()}><Square className="size-4" />Parar análise</Button>}
  </section>;
}