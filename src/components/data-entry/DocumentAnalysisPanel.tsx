import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputTextarea, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
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
  const [text, setText] = useState("");
  const [reviewed, setReviewed] = useState<string[]>([]);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const section = useRef<HTMLElement | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { if (!busy && enabled && !locked) section.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus(); }, [busy, enabled, locked]);
  const analyze = async (question: string) => {
    if (!enabled || locked || controller.current || !adapter.analyze) return;
    const history: AnalysisTurn[] = messages.map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.parts.filter((p) => p.type === "text").map((p) => p.type === "text" ? p.text : "").join("") }));
    if (history.length > 8) { setError("Limite desta conversa atingido. Continua pela revisão manual."); return; }
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); onBusy(true); setError(null); setReport(null); setReviewed([]);
    setMessages((old) => [...old, { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: question }] }]); setText("");
    try {
      const result = parseAnalysisReport(await adapter.analyze(sessionId, doc.id, question, history, context, abort.signal));
      if (!alive.current || abort.signal.aborted) return;
      if (result.document_id !== doc.id || result.document_sha256 !== doc.sha256 || result.company_id !== context.company_id) throw new Error("Contexto da análise alterado. Resposta descartada.");
      setReport(result); setMessages((old) => [...old, { id: crypto.randomUUID(), role: "assistant", parts: [{ type: "text", text: result.answer }] }]);
    } catch (e) { if (alive.current) setError(abort.signal.aborted ? "Análise cancelada. Nenhum dado foi confirmado." : e instanceof Error ? e.message : "Análise indisponível."); }
    finally { if (alive.current) { setBusy(false); onBusy(false); controller.current = null; } }
  };
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
      <div><strong>Encontrado no ERP</strong><p>NIF da empresa: {report.erp.company_tax ?? "não disponível"}</p></div>
      {report.warnings.map((w, i) => <p key={i} className="text-warning">{w}</p>)}
      {report.candidates.map((c) => <div key={c.field} className="border-b border-border pb-2 space-y-1">
        <div className="font-medium">{LABELS[c.field]}: {c.value ?? "não encontrado"}</div>
        <p className="text-muted-foreground">{c.origin === "document" ? "Documento — referência sugerida pelo analista" : "Scanner sem trecho documental; confirma no documento"}{c.page ? ` · página ${c.page}` : ""}{c.confidence ? ` · confiança ${c.confidence === "high" ? "alta" : c.confidence === "medium" ? "média" : "baixa"}` : " · sem confiança por campo"}</p>
        {c.quote && <blockquote className="border-l-2 border-border pl-2 break-words">{c.quote}</blockquote>}
        {c.uncertainty && <p className="text-warning">{c.uncertainty}</p>}
        {c.field !== "currency" && <Button size="sm" variant="ghost" type="button" disabled={!(c.reviewable ?? c.usable) || busy || locked} onClick={() => { onCandidate(c); setReviewed((old) => [...old.filter((key) => key !== c.field), c.field]); }}>Revi e usar {LABELS[c.field].toLowerCase()}</Button>}
        {c.field !== "currency" && !(c.reviewable ?? c.usable) && <p className="text-warning">Campo ausente ou inválido; preenche e confirma manualmente nos dados da fatura.</p>}
        {reviewed.includes(c.field) && <p className="text-success">Confirmado por ti na revisão; aguarda a prévia.</p>}
      </div>)}
    </div>}
    {enabled && <PromptInput onSubmit={({ text: value }) => analyze(value)}>
      <PromptInputTextarea value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Pergunta sobre este documento…" aria-label="Pergunta documental" disabled={locked || busy} />
      <PromptInputFooter className="justify-end"><PromptInputSubmit aria-label={busy ? "Parar análise" : "Enviar pergunta"} status={busy ? "streaming" : "ready"} disabled={!busy && (!text.trim() || locked)} onStop={() => controller.current?.abort()} /></PromptInputFooter>
    </PromptInput>}
  </section>;
}