import TicketlineReviewPanel from "./TicketlineReviewPanel";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataEntryError, type AssistantTurnResult, type DataEntryAdapter, type DataEntryContext } from "@/lib/data-entry-client";

type Turn = { role: "user" | "assistant"; text: string };
const MAX_TURNS = 20;
/** Só textos da conversa por user+empresa; nunca corpos de email, propostas ou resultados de ferramentas. */
export const historyKey = (c: DataEntryContext) => `data-entry-assistant:${c.user_id}:${c.company_id}`;
const loadHistory = (c: DataEntryContext): Turn[] => {
  try {
    const v = JSON.parse(localStorage.getItem(historyKey(c)) ?? "[]");
    return Array.isArray(v) ? v.filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string").slice(-MAX_TURNS) : [];
  } catch { return []; }
};
const kb = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
const eur = (cents: number | null) => cents == null ? "—" : (cents / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

type Props = { adapter: DataEntryAdapter; context: DataEntryContext };

/** #333 fase12 — entrada principal em texto livre. Só leitura e proposta; execução bloqueada nesta entrega. */
export default function AssistantConversation(props: Props) {
  return <Conversation key={historyKey(props.context)} {...props} />;
}

function Conversation({ adapter, context }: Props) {
  const [history, setHistory] = useState<Turn[]>(() => loadHistory(context));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<AssistantTurnResult | null>(null);
  const [known, setKnown] = useState<string[]>([]);
  const [pendingText, setPendingText] = useState<string | null>(null);
  /** Signed selector held only in memory (never localStorage); lost on refresh by design. */
  const [canReturn, setCanReturn] = useState(false);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const continuation = useRef<string | undefined>();
  const continuationText = useRef<string | undefined>();
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => { generation.current += 1; abort.current?.abort(); }, []);
  useEffect(() => { box.current?.focus(); }, [busy]);
  const persist = (h: Turn[]) => { const v = h.slice(-MAX_TURNS); setHistory(v); try { localStorage.setItem(historyKey(context), JSON.stringify(v)); } catch { /* sem armazenamento */ } };

  const send = async (message: string, selection?: { message_id?: string; event_id?: string }, intent?: "list") => {
    if (!adapter.assistantTurn || !message.trim()) return;
    if (intent && !continuation.current) return;
    const gen = ++generation.current;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(null);
    const base = selection ? history : [...history, { role: "user" as const, text: message.trim() }];
    if (!selection) { persist(base); setText(""); if (!intent) setPendingText(message.trim()); }
    // A signed selector continues after a choice or after a revalidated review; numbers/IDs never come from history.
    const continuing = Boolean(continuation.current && (intent || selection || last?.status === "select_message" || last?.review_message_id));
    // Switching email removes the previous review/proposal at once, so no old candidate or authorization stays usable.
    if (intent || selection?.message_id) setLast(prev => prev && { ...prev, review_message_id: undefined, attachments: undefined, proposal: undefined, candidate: undefined, candidate_token: undefined });
    try {
      const r = await adapter.assistantTurn({ text: message.trim(), history: base.slice(0, selection ? base.length : -1), ...(selection ? { selection } : {}), ...(intent ? { intent } : {}), ...(continuing ? { continuation: continuation.current, continuation_text: continuationText.current } : {}), known_message_ids: known }, context, controller.signal);
      if (gen !== generation.current) return;
      setLast(r); setKnown(r.known_message_ids ?? []);
      continuation.current = r.continuation; setCanReturn(Boolean(r.continuation));
      // Keep the ORIGINAL request bound by the signature across follow-up turns, unless the server started a new search.
      continuationText.current = r.continuation ? (continuing && !r.continuation_rebound ? continuationText.current ?? message.trim() : message.trim()) : undefined;
      persist([...base, { role: "assistant", text: r.text }]);
    } catch (e) {
      if (gen !== generation.current) return;
      setError(e instanceof Error ? e.message : "Assistente indisponível.");
      // Expired/foreign selector: the return button would only fail again.
      if (continuing && e instanceof DataEntryError && e.status === 409) { continuation.current = undefined; continuationText.current = undefined; setCanReturn(false); }
    } finally { if (gen === generation.current) setBusy(false); }
  };
  const stop = () => { generation.current += 1; abort.current?.abort(); setBusy(false); setError("Cancelamento pedido. Nada foi gravado; a cobrança de IA pode ocorrer."); };
  const clear = () => { persist([]); setLast(null); setKnown([]); setPendingText(null); setCanReturn(false); continuation.current = undefined; continuationText.current = undefined; try { localStorage.removeItem(historyKey(context)); } catch { /* */ } };

  if (!adapter.assistantTurn) return null;
  const p = last?.proposal;
  return (
    <section aria-label="Assistente" className="space-y-2 rounded-md border border-border p-3">
      <label htmlFor="assistant-input" className="block text-sm font-semibold">O que pretende fazer?</label>
      <textarea id="assistant-input" ref={box} rows={3} maxLength={2000} value={text} disabled={busy}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ex.: Chegou ao meu email o fecho de um evento da Ticketline. Lê-o e prepara os lançamentos do fecho."
        className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-2 text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !text.trim()} onClick={() => void send(text)}>Enviar</Button>
        {busy && <Button size="sm" variant="outline" onClick={stop}>Parar</Button>}
        {canReturn && !busy && last && last.status !== "select_message" && <Button size="sm" variant="outline" onClick={() => void send("Escolher outro email", undefined, "list")}>Escolher outro email</Button>}
        {history.length > 0 && !busy && <Button size="sm" variant="ghost" onClick={clear}>Nova conversa</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Pode pesquisar e ler o teu Gmail e consultar o ERP. Nunca grava sozinho: lançamentos exigem prévia e autorização expressa.</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {history.length > 0 && (
        <ol aria-label="Conversa" className="max-h-64 space-y-1.5 overflow-y-auto overscroll-contain text-sm">
          {history.map((t, i) => (
            <li key={i} className={t.role === "user" ? "ml-6 rounded-md bg-secondary px-2 py-1 text-secondary-foreground break-words whitespace-pre-wrap" : "min-w-0 break-words [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4"}>
              {t.role === "user" ? t.text : <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
                table: ({ children }) => <div className="max-w-full overflow-x-auto"><table className="w-full text-xs [&_th]:text-left [&_td]:align-top [&_td]:p-1 [&_th]:p-1">{children}</table></div>,
                a: ({ children }) => <span>{children}</span>, img: () => null,
              }}>{t.text}</ReactMarkdown>}
            </li>
          ))}
          {busy && <li role="status" className="text-xs text-muted-foreground">A trabalhar…</li>}
        </ol>
      )}
      {last && last.trace.length > 0 && (
        <details className="text-xs"><summary className="cursor-pointer">Trabalho feito ({last.trace.length})</summary>
          <ul className="list-disc pl-4">{last.trace.map((t, i) => <li key={i} className={t.ok ? "" : "text-warning"}>{t.summary}</li>)}</ul>
        </details>
      )}
      {last?.options && last.options.length > 0 && (last.status === "select_message" || last.status === "select_event") && (
        <div role="group" aria-label={last.status === "select_message" ? "Escolher email" : "Escolher evento"} className="space-y-1">
          {last.options.map((o) => (
            <Button key={o.id} size="sm" variant="outline" className="h-auto w-full justify-start whitespace-normal break-words text-left" disabled={busy}
              onClick={() => void send(pendingText ?? history.filter((h) => h.role === "user").at(-1)?.text ?? "", last.status === "select_message" ? { message_id: o.id } : { event_id: o.id })}><span className="min-w-0 whitespace-pre-line">{o.label}</span></Button>
          ))}
        </div>
      )}
      {last?.review_message_id && last.attachments && !adapter.ticketlineCandidate && (
        <div aria-label="Anexos do email" className="space-y-0.5 rounded-md border border-border p-2 text-xs">
          <div className="font-semibold">Anexos reais do email ({last.attachments.length})</div>
          {last.attachments.length === 0 ? <p className="text-muted-foreground">Sem anexos; a revisão usa o corpo.</p> : (
            <ol className="space-y-0.5">{last.attachments.map(a => <li key={a.part_id} className="min-w-0 break-words">{a.n}. {a.filename} <span className="text-muted-foreground">· {a.mime} · {kb(a.size_bytes)}</span></li>)}</ol>)}
        </div>
      )}
      {last?.review_message_id && adapter.ticketlineCandidate && <TicketlineReviewPanel key={last.review_message_id} adapter={adapter} context={context} messageId={last.review_message_id}
        initialAttachments={last.attachments?.map(({ part_id, filename, mime, size_bytes }) => ({ part_id, filename, mime, size_bytes }))} />}
      {p && (
        <div aria-label="Proposta" className="space-y-2 rounded-md border border-border p-2 text-xs">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">Apuramento {p.statement_number ?? "?"}</Badge>
            <Badge variant="outline">Evento: {p.event?.name ?? "por escolher"}</Badge>
            <Badge variant="outline">Σ {eur(p.sum_cents)} · total {eur(p.document_total_cents)}</Badge>
          </div>
          <ul className="space-y-0.5">{p.checks.map((c) => <li key={c.code} className={c.ok ? "" : "text-destructive"}>{c.ok ? "✓" : "✗"} {c.message}</li>)}</ul>
          {p.needs.length > 0 && <div><div className="font-semibold">Pendências</div><ul className="list-disc pl-4">{p.needs.map((n) => <li key={n}>{n}</li>)}</ul></div>}
          {p.source_message_id && adapter.ticketlineCandidate && <TicketlineReviewPanel key={`${p.source_message_id}:${p.effects_hash}`} adapter={adapter} context={context} messageId={p.source_message_id} initial={last?.candidate && last.candidate_token ? { candidate: last.candidate, candidate_token: last.candidate_token } : undefined} events={[...(p.event ? [{ id: p.event.id, label: p.event.name }] : []), ...(last?.status === "select_event" ? last.options ?? [] : [])]} />}
          <div className="font-semibold">Ações propostas (pelos fluxos existentes)</div>
          <ol className="space-y-1">{p.actions.map((a) => (
            <li key={a.id} className="break-words"><span className="font-medium">{a.id}. {a.label}</span>
              <div className="text-muted-foreground">{a.existing_flow}{a.depends_on.length ? ` · depende de ${a.depends_on.join(", ")}` : ""}</div>
              {a.blocked_reason && <div className="text-warning">Bloqueado: {a.blocked_reason}</div>}</li>))}</ol>
          <div role="status" className="rounded bg-muted/40 p-2">
            <div className="font-semibold">Execução ainda não disponível</div>
            <ul className="list-disc pl-4">{last.execution.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
          </div>
        </div>
      )}
    </section>
  );
}
