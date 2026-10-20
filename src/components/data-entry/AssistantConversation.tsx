import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AssistantTurnResult, DataEntryAdapter, DataEntryContext } from "@/lib/data-entry-client";

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
  const generation = useRef(0);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => { generation.current += 1; }, []);
  useEffect(() => { box.current?.focus(); }, [busy]);
  const persist = (h: Turn[]) => { const v = h.slice(-MAX_TURNS); setHistory(v); try { localStorage.setItem(historyKey(context), JSON.stringify(v)); } catch { /* sem armazenamento */ } };

  const send = async (message: string, selection?: { message_id?: string; event_id?: string }) => {
    if (!adapter.assistantTurn || !message.trim()) return;
    const gen = ++generation.current;
    setBusy(true); setError(null);
    const base = selection ? history : [...history, { role: "user" as const, text: message.trim() }];
    if (!selection) { persist(base); setText(""); setPendingText(message.trim()); }
    try {
      const r = await adapter.assistantTurn({ text: message.trim(), history: base.slice(0, selection ? base.length : -1), ...(selection ? { selection } : {}), known_message_ids: known }, context);
      if (gen !== generation.current) return;
      setLast(r); setKnown(r.known_message_ids ?? []);
      persist([...base, { role: "assistant", text: r.text }]);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : "Assistente indisponível.");
    } finally { if (gen === generation.current) setBusy(false); }
  };
  const stop = () => { generation.current += 1; setBusy(false); setError("Parado. Nada foi gravado."); };
  const clear = () => { persist([]); setLast(null); setKnown([]); setPendingText(null); try { localStorage.removeItem(historyKey(context)); } catch { /* */ } };

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
        {history.length > 0 && !busy && <Button size="sm" variant="ghost" onClick={clear}>Nova conversa</Button>}
      </div>
      <p className="text-xs text-muted-foreground">Pode pesquisar e ler o teu Gmail e consultar o ERP. Nunca grava sozinho: lançamentos exigem prévia e autorização expressa.</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {history.length > 0 && (
        <ol aria-label="Conversa" className="max-h-64 space-y-1.5 overflow-y-auto overscroll-contain text-sm">
          {history.map((t, i) => (
            <li key={i} className={t.role === "user" ? "ml-6 rounded-md bg-secondary px-2 py-1 text-secondary-foreground break-words" : "mr-6 break-words"}>{t.text}</li>
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
              onClick={() => void send(pendingText ?? history.filter((h) => h.role === "user").at(-1)?.text ?? "", last.status === "select_message" ? { message_id: o.id } : { event_id: o.id })}>{o.label}</Button>
          ))}
        </div>
      )}
      {p && (
        <div aria-label="Proposta" className="space-y-2 rounded-md border border-border p-2 text-xs">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">Apuramento {p.statement_number ?? "?"}</Badge>
            <Badge variant="outline">Evento: {p.event?.name ?? "por escolher"}</Badge>
            <Badge variant="outline">Σ {eur(p.sum_cents)} · total {eur(p.document_total_cents)}</Badge>
          </div>
          <ul className="space-y-0.5">{p.checks.map((c) => <li key={c.code} className={c.ok ? "" : "text-destructive"}>{c.ok ? "✓" : "✗"} {c.message}</li>)}</ul>
          {p.needs.length > 0 && <div><div className="font-semibold">Pendências</div><ul className="list-disc pl-4">{p.needs.map((n) => <li key={n}>{n}</li>)}</ul></div>}
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
