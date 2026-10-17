import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { listLegacyAttempts, confirmNewIntent, attemptRequest, canConfirmNewIntent, latestInFamily, reviewMessage, type AttemptSummary, type Context } from "@/lib/standalone-attempt-client";

const STATE_LABEL: Record<string, string> = {
  prepare: "Preparada", authorized: "Autorizada", inprogress: "Em curso (por confirmar)",
  completed: "Concluída", review: "Em revisão",
};
const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-PT"); };

/** One page per user action. Local uncertainty blocks retries, never authorizes effects. */
export function StandaloneAttemptsPanel({ operation, context, onSelect, onBlocked }: {
  operation: "scanner_create" | "accountant_edit"; context: Context;
  onSelect: (a: AttemptSummary | null) => void; onBlocked?: (blocked: boolean) => void;
}) {
  const key = `attempt-intent-uncertain:${context.user_id}:${context.company_id}:${operation}`;
  const [items, setItems] = useState<AttemptSummary[] | null>(null);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [uncertain, setUncertain] = useState<AttemptSummary | null>(null);
  const gen = useRef(0);
  const flight = useRef(false);
  const cursors = useRef(new Set<string>());
  const scope = `${context.user_id}:${context.company_id}:${operation}`;
  const liveScope = useRef(scope); liveScope.current = scope;
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const blockedRef = useRef(onBlocked); blockedRef.current = onBlocked;
  const active = (g: number, s: string) => g === gen.current && s === liveScope.current;

  useEffect(() => {
    gen.current++; flight.current = false; cursors.current.clear();
    setItems(null); setSelected(""); setMessage(null); setConfirming(false); setBusy(false); setNext(null); setComplete(false);
    let saved: AttemptSummary | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { /* Invalid marker stays blocking, not authority. */ }
    setUncertain(saved); selectRef.current(null);
    blockedRef.current(sessionStorage.getItem(key) !== null);
    return () => { gen.current++; };
  }, [scope, key]);

  const load = async (more = false) => {
    if (flight.current) return;
    const g = gen.current, s = scope, after = more ? next : null;
    flight.current = true; setBusy(true); setMessage(null);
    try {
      const page = await listLegacyAttempts(operation, context, after);
      if (!active(g, s)) return;
      if (!more) cursors.current.clear();
      const repeated = page.next !== null && (page.next === after || cursors.current.has(page.next));
      if (page.next) cursors.current.add(page.next);
      setItems(prev => [...new Map([...(more ? prev ?? [] : []), ...page.items].map(a => [a.id, a])).values()]);
      setNext(repeated ? null : page.next); setComplete(!repeated && page.next === null);
      if (repeated) setMessage("Consulta incompleta. Não foi possível avançar para a página seguinte.");
    } catch { if (active(g, s)) setMessage("Consulta de tentativas indisponível neste ambiente."); }
    finally { if (active(g, s)) { flight.current = false; setBusy(false); } }
  };
  const current = items?.find(a => a.id === selected) ?? null;
  const allowNew = operation === "scanner_create" && current !== null && !uncertain && canConfirmNewIntent(current, latestInFamily(current, items ?? [], complete));

  const confirm = async () => {
    if (!current || !allowNew || flight.current) return;
    const g = gen.current, s = scope, original = current;
    flight.current = true; setBusy(true); blockedRef.current(true);
    // Persist before request: a lost response or remount is not permission to repeat.
    sessionStorage.setItem(key, JSON.stringify(original)); setUncertain(original);
    try {
      const created = await confirmNewIntent(original, context);
      if (!active(g, s)) return;
      setItems(prev => [...(prev ?? []).filter(a => a.id !== created.id), created]);
      setSelected(created.id); selectRef.current(created);
      sessionStorage.removeItem(key); setUncertain(null); setConfirming(false);
      setMessage("Nova intenção técnica confirmada. A fatura não foi gravada.");
      // Selected reservation remains read-only in the parent; no previous payload is reused.
      blockedRef.current(false);
    } catch {
      if (active(g, s)) { setConfirming(false); setMessage("Resultado por confirmar. Consulta a intenção; não repitas a confirmação."); }
    } finally { if (active(g, s)) { flight.current = false; setBusy(false); } }
  };

  const reconcile = async () => {
    if (!uncertain || flight.current) return;
    const original = uncertain, g = gen.current, s = scope;
    flight.current = true; setBusy(true);
    try {
      // Never confirm again. Only inspect already discovered candidates and verify server linkage.
      const candidates = (items ?? []).filter(a => a.hash === original.hash && a.intent_seq === (original.intent_seq ?? 0) + 1);
      for (const candidate of candidates) {
        const out = await attemptRequest({ action: "check", operation, id: candidate.id, hash: candidate.hash }, context);
        if (!active(g, s)) return;
        if (out.attempt?.prior_attempt_id === original.id && out.attempt?.hash === original.hash && out.attempt?.intent_seq === candidate.intent_seq) {
          setSelected(candidate.id); selectRef.current(candidate); sessionStorage.removeItem(key); setUncertain(null);
          blockedRef.current(false); setMessage("Intenção técnica encontrada e conferida. Nenhuma execução foi iniciada."); return;
        }
      }
      setMessage("Intenção ainda por confirmar. Carrega as páginas disponíveis e consulta novamente; não repitas a confirmação.");
    } catch { if (active(g, s)) setMessage("Conferência indisponível. A confirmação continua bloqueada."); }
    finally { if (active(g, s)) { flight.current = false; setBusy(false); } }
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => load()} disabled={busy}>Procurar as minhas tentativas</Button>
        {items && <span className="text-xs text-muted-foreground">{items.length} carregada(s)</span>}
        {next && <Button variant="outline" size="sm" onClick={() => load(true)} disabled={busy}>Carregar mais</Button>}
      </div>
      {items && items.length > 0 && (
        <select aria-label="Tentativa a consultar" disabled={busy || uncertain !== null} className="w-full rounded-md border border-input bg-background p-2 text-sm" value={selected}
          onChange={(e) => { if (flight.current || uncertain) return; setSelected(e.target.value); setConfirming(false); selectRef.current(items.find(a => a.id === e.target.value) ?? null); }}>
          <option value="">Selecionar tentativa</option>
          {items.map(a => <option key={a.id} value={a.id}>{a.name} — {a.reference ?? "Sem número"} — {STATE_LABEL[a.state] ?? a.state} — {fmt(a.created_at)}</option>)}
        </select>
      )}
      {current?.state === "review" && <Alert><AlertDescription>{reviewMessage(current.review_reason)}</AlertDescription></Alert>}
      {current && ["prepare", "authorized", "inprogress"].includes(current.state) && <p className="text-xs text-warning">Resultado por confirmar: consulta a tentativa; não é possível iniciar nova gravação.</p>}
      {allowNew && !confirming && <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>Registar outra fatura com os mesmos dados…</Button>}
      {allowNew && confirming && current && (
        <div className="space-y-2 rounded-md bg-muted p-2 text-sm">
          <p>Confirmas que <strong>{current.name}</strong> ({current.reference ?? "sem número"}, {fmt(current.created_at)}) é uma <strong>fatura nova e distinta</strong>, e não uma repetição? A confirmação fica registada em teu nome. Duplicados fortes continuam bloqueados.</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy} onClick={confirm}>Confirmar nova fatura</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      {uncertain && <Button size="sm" variant="outline" disabled={busy} onClick={reconcile}>Conferir intenção pendente</Button>}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
