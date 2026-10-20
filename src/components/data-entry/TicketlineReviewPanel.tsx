import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DataEntryAdapter, DataEntryContext, TicketlineCandidate, TicketlineEdits, TicketlineLineType, TicketlinePreviewResult, CandidateProvenance } from "@/lib/data-entry-client";

const TYPES: [TicketlineLineType, string][] = [["event_right", "Direito do evento"], ["ticketline_invoice", "Fatura Ticketline"], ["venue_settlement", "Acerto da sala"], ["advance", "Repasse"], ["carry_over", "Transitado"]];
const eur = (c: number | null | undefined) => c == null ? "—" : (c / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const toCents = (s: string) => { const n = Number(s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : null; };
export function provLabel(p?: CandidateProvenance | null) {
  if (!p) return "sem origem";
  if (p.source === "human") return "revisto por si";
  if (p.source === "attachment") return `anexo · ${p.sha256.slice(0, 8)}`;
  return `email · linha ${p.line}${p.truncated ? " (truncado)" : ""}`;
}
type Line = { line_type: TicketlineLineType; description: string; amount: string; event_hint: string | null };

/** Revisão humana tipada. Qualquer edição invalida a prévia e qualquer autorização anterior. */
export default function TicketlineReviewPanel({ adapter, context, messageId, partId, events = [] }: {
  adapter: DataEntryAdapter; context: DataEntryContext; messageId: string; partId?: string; events?: { id: string; label: string }[];
}) {
  const [token, setToken] = useState<string | null>(null);
  const [cand, setCand] = useState<TicketlineCandidate | null>(null);
  const [form, setForm] = useState({ number: "", date: "", total: "", event_id: "" });
  const [lines, setLines] = useState<Line[]>([]);
  const [settle, setSettle] = useState({ account: "", date: "", amount: "", confirm: false });
  const [preview, setPreview] = useState<TicketlinePreviewResult | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (f: () => Promise<void>) => { setBusy(true); setError(null); try { await f(); } catch (e) { setError(e instanceof Error ? e.message : "Indisponível."); } finally { setBusy(false); } };
  const load = () => run(async () => {
    if (!adapter.ticketlineCandidate) throw new Error("Revisão indisponível.");
    const r = await adapter.ticketlineCandidate({ message_id: messageId, ...(partId ? { part_id: partId } : {}) }, context);
    setToken(r.candidate_token); setCand(r.candidate); setPreview(null); setStale(false);
    setForm({ number: r.candidate.number?.value ?? "", date: r.candidate.date?.value ?? "", total: r.candidate.total_cents ? (r.candidate.total_cents.value / 100).toFixed(2).replace(".", ",") : "", event_id: r.candidate.event_id?.value ?? "" });
    setLines(r.candidate.lines.map(l => ({ line_type: l.line_type, description: l.description, amount: (l.amount_cents / 100).toFixed(2).replace(".", ","), event_hint: l.event_hint })));
  });
  const edit = (f: () => void) => { f(); setStale(true); };
  const edits = (): TicketlineEdits => {
    const parsed = lines.map(l => ({ line_type: l.line_type, description: l.description, amount_cents: toCents(l.amount), event_hint: l.event_hint }));
    if (parsed.some(l => l.amount_cents === null)) throw new Error("Valor de linha inválido.");
    return { number: form.number.trim() || null, date: form.date || null, total_cents: form.total ? toCents(form.total) : null, event_id: form.event_id || null,
      lines: parsed as NonNullable<TicketlineEdits["lines"]> };
  };
  const settlement = () => {
    if (!settle.account && !settle.date && !settle.amount) return undefined;
    if (!settle.confirm) throw new Error("Confirma que verificaste o recebimento no banco.");
    const amount_cents = toCents(settle.amount); if (!amount_cents) throw new Error("Valor recebido inválido.");
    return { financial_account_id: settle.account.trim(), date: settle.date, amount_cents, confirm: true as const };
  };
  const recalc = (save?: boolean) => run(async () => {
    if (!adapter.ticketlinePreview || !token) throw new Error("Revisão indisponível.");
    const r = await adapter.ticketlinePreview({ candidate_token: token, edits: edits(), settlement: settlement(),
      ...(save ? { save: { review_id: preview?.review?.review_id ?? null, expected_version: preview?.review?.version ?? null } } : {}) }, context);
    setPreview(r); setStale(false);
  });
  const allOpen = preview?.proposal.actions.every(a => !a.blocked_reason) ?? false;
  const authorize = () => run(async () => {
    if (!adapter.ticketlineAuthorize || !preview?.review) throw new Error("Autorização indisponível.");
    const r = await adapter.ticketlineAuthorize({ review_id: preview.review.review_id, version: preview.review.version, effects_hash: preview.review.effects_hash,
      action_ids: preview.proposal.actions.map(a => a.id), replay_key: crypto.randomUUID() }, context);
    setError(r.notice);
  });
  const input = "w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm";

  if (!cand) return (
    <div className="space-y-1 rounded-md border border-border p-2 text-xs">
      <Button size="sm" variant="outline" disabled={busy} onClick={load}>Rever fecho deste email</Button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  );
  return (
    <section aria-label="Revisão do fecho Ticketline" className="min-w-0 space-y-2 rounded-md border border-border p-2 text-xs">
      <div className="font-semibold">Revisão do fecho (candidato, nada gravado)</div>
      <div className="flex flex-wrap gap-1">{cand.sources.map((s, i) => <Badge key={i} variant="outline" className="max-w-full truncate">{provLabel(s)}</Badge>)}</div>
      {cand.incomplete.length > 0 && <ul className="list-disc pl-4 text-destructive">{cand.incomplete.map(x => <li key={x}>{x}</li>)}</ul>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="min-w-0">Nº apuramento <span className="text-muted-foreground">({provLabel(cand.number?.prov)})</span>
          <input aria-label="Número" className={input} value={form.number} onChange={e => edit(() => setForm({ ...form, number: e.target.value }))} /></label>
        <label className="min-w-0">Data <span className="text-muted-foreground">({provLabel(cand.date?.prov)})</span>
          <input aria-label="Data" type="date" className={input} value={form.date} onChange={e => edit(() => setForm({ ...form, date: e.target.value }))} /></label>
        <label className="min-w-0">Total do documento (€) <span className="text-muted-foreground">({provLabel(cand.total_cents?.prov)})</span>
          <input aria-label="Total" inputMode="decimal" className={input} value={form.total} onChange={e => edit(() => setForm({ ...form, total: e.target.value }))} /></label>
        <label className="min-w-0">Evento
          <select aria-label="Evento" className={input} value={form.event_id} onChange={e => edit(() => setForm({ ...form, event_id: e.target.value }))}>
            <option value="">Por escolher</option>{events.map(ev => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
          </select></label>
      </div>
      <div className="space-y-1">
        <div className="font-semibold">Linhas</div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-1 gap-1 rounded border border-border p-1 sm:grid-cols-[10rem_1fr_7rem_auto]">
            <select aria-label={`Tipo da linha ${i + 1}`} className={input} value={l.line_type} onChange={e => edit(() => setLines(lines.map((x, j) => j === i ? { ...x, line_type: e.target.value as TicketlineLineType } : x)))}>
              {TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <input aria-label={`Descrição da linha ${i + 1}`} className={input} value={l.description} onChange={e => edit(() => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x)))} />
            <input aria-label={`Valor da linha ${i + 1}`} inputMode="decimal" className={input} value={l.amount} onChange={e => edit(() => setLines(lines.map((x, j) => j === i ? { ...x, amount: e.target.value } : x)))} />
            <Button size="sm" variant="ghost" onClick={() => edit(() => setLines(lines.filter((_, j) => j !== i)))}>Remover</Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => edit(() => setLines([...lines, { line_type: "event_right", description: "", amount: "0,00", event_hint: null }]))}>Adicionar linha</Button>
      </div>
      <fieldset className="space-y-1 rounded border border-border p-1">
        <legend className="px-1 font-semibold">Recebimento bancário (opcional, confirmado por si)</legend>
        <p className="text-muted-foreground">O fecho recebido não prova o recebimento. Indica só o que verificaste no banco; a conta é validada no servidor.</p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
          <input aria-label="Conta" placeholder="ID da conta" className={input} value={settle.account} onChange={e => edit(() => setSettle({ ...settle, account: e.target.value }))} />
          <input aria-label="Data do recebimento" type="date" className={input} value={settle.date} onChange={e => edit(() => setSettle({ ...settle, date: e.target.value }))} />
          <input aria-label="Valor recebido" inputMode="decimal" className={input} value={settle.amount} onChange={e => edit(() => setSettle({ ...settle, amount: e.target.value }))} />
        </div>
        <label className="flex items-center gap-1"><input type="checkbox" checked={settle.confirm} onChange={e => edit(() => setSettle({ ...settle, confirm: e.target.checked }))} /> Confirmo que verifiquei este recebimento no banco</label>
      </fieldset>
      {stale && preview && <p role="status" className="text-destructive">Alterado: a prévia anterior e qualquer autorização deixaram de valer. Recalcula.</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => recalc()}>Recalcular prévia</Button>
        <Button size="sm" variant="outline" disabled={busy || !preview || stale} onClick={() => recalc(true)}>Guardar revisão</Button>
        <Button size="sm" variant="outline" disabled={busy || stale || !preview?.persisted || !allOpen} onClick={authorize}>Autorizar</Button>
      </div>
      {preview && !stale && (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">Σ {eur(preview.proposal.sum_cents)} · total {eur(preview.proposal.document_total_cents)}</Badge>
            <Badge variant="outline" className="max-w-full truncate">Versão {preview.review?.version ?? "não guardada"} · {preview.proposal.effects_hash.slice(0, 12)}</Badge>
          </div>
          <ul>{preview.proposal.checks.map(c => <li key={c.code} className={c.ok ? "" : "text-destructive"}>{c.ok ? "✓" : "✗"} {c.message}</li>)}</ul>
          {preview.proposal.needs.length > 0 && <ul className="list-disc pl-4">{preview.proposal.needs.map(n => <li key={n}>{n}</li>)}</ul>}
          {!preview.persisted && <p className="text-muted-foreground">{preview.notice ?? "Prévia não guardada."}</p>}
        </div>
      )}
      <p className="text-muted-foreground">Execução financeira desativada: nenhum apuramento, fecho, transação ou liquidação é gravado.</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </section>
  );
}
