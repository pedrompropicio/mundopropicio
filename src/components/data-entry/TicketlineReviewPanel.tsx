import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DataEntryAdapter, DataEntryContext, TicketlineCandidate, TicketlineEdits, TicketlineLineType, TicketlinePreviewResult, CandidateProvenance, TicketlineAttachment, TicketlineExecution } from "@/lib/data-entry-client";
import TicketlineExecutionPanel from "./TicketlineExecutionPanel";

const TYPES: [TicketlineLineType, string][] = [["event_right", "Direito do evento"], ["ticketline_invoice", "Fatura Ticketline"], ["venue_settlement", "Acerto da sala"], ["advance", "Repasse"], ["carry_over", "Transitado"]];
const eur = (c: number | null | undefined) => c == null ? "—" : (c / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const toCents = (s: string) => { const t = s.replace(/\s|€/g, ""); const n = Number(/,/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t); return t && Number.isFinite(n) ? Math.round(n * 100) : null; };
const fmt = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const kb = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
export function provLabel(p?: CandidateProvenance | null) {
  if (!p) return "sem origem";
  if (p.source === "human") return "revisto por si";
  if (p.source === "model") return "IA · do email";
  if (p.source === "attachment") return `anexo · ${p.sha256.slice(0, 8)}`;
  return `email · linha ${p.line}${p.truncated ? " (truncado)" : ""}`;
}
type Line = { line_type: TicketlineLineType; description: string; amount: string; event_hint: string | null };
type Initial = { candidate: TicketlineCandidate; candidate_token: string };

/** Revisão humana tipada. Qualquer edição invalida a prévia e qualquer autorização anterior. */
export default function TicketlineReviewPanel({ adapter, context, messageId, partId, events = [], initial }: {
  adapter: DataEntryAdapter; context: DataEntryContext; messageId: string; partId?: string; events?: { id: string; label: string }[]; initial?: Initial;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [cand, setCand] = useState<TicketlineCandidate | null>(null);
  const [form, setForm] = useState({ number: "", date: "", total: "", event_id: "", office: "" });
  const [lines, setLines] = useState<Line[]>([]);
  const [settle, setSettle] = useState({ account: "", date: "", amount: "", confirm: false });
  const [confirmed, setConfirmed] = useState(false);
  const [attachments, setAttachments] = useState<TicketlineAttachment[] | null>(null);
  const [part, setPart] = useState(partId ?? "");
  const [accounts, setAccounts] = useState<{ id: string; name: string; type?: string | null }[] | null>(null);
  const [auth, setAuth] = useState<{ id: string; action_ids: string[]; executor: boolean } | null>(null);
  const [eventOptions, setEventOptions] = useState(events);
  const [preview, setPreview] = useState<TicketlinePreviewResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (f: () => Promise<void>) => { setBusy(true); setError(null); setNotice(null); try { await f(); } catch (e) { setError(e instanceof Error ? e.message : "Indisponível."); } finally { setBusy(false); } };
  const apply = (r: Initial) => {
    setToken(r.candidate_token); setCand(r.candidate); setPreview(null); setStale(false); setConfirmed(false); setSelected([]); setAuth(null);
    setForm({ office: "", number: r.candidate.number?.value ?? "", date: r.candidate.date?.value ?? "", total: r.candidate.total_cents ? fmt(r.candidate.total_cents.value) : "", event_id: r.candidate.event_id?.value ?? "" });
    setLines(r.candidate.lines.map(l => ({ line_type: l.line_type, description: l.description, amount: fmt(l.amount_cents), event_hint: l.event_hint })));
  };
  useEffect(() => { if (initial) apply(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [initial?.candidate_token]);
  const load = () => run(async () => {
    if (!adapter.ticketlineCandidate) throw new Error("Revisão indisponível.");
    apply(await adapter.ticketlineCandidate({ message_id: messageId, ...(part ? { part_id: part } : {}) }, context));
  });
  const loadAttachments = () => run(async () => {
    if (!adapter.ticketlineAttachments) throw new Error("Lista de anexos indisponível.");
    setAttachments((await adapter.ticketlineAttachments({ message_id: messageId }, context)).attachments);
  });
  useEffect(() => {
    if (!cand || accounts || !adapter.ticketlineAccounts) return;
    adapter.ticketlineAccounts(context).then(r => setAccounts(r.accounts)).catch(() => setAccounts([]));
  }, [cand, accounts, adapter, context]);
  const edit = (f: () => void) => { f(); setStale(true); setSelected([]); setAuth(null); };
  const edits = (): TicketlineEdits => {
    const parsed = lines.map(l => ({ line_type: l.line_type, description: l.description, amount_cents: toCents(l.amount), event_hint: l.event_hint }));
    if (parsed.some(l => l.amount_cents === null)) throw new Error("Valor de linha inválido.");
    const total = form.total ? toCents(form.total) : null;
    if (form.total && total === null) throw new Error("Total inválido.");
    return { number: form.number.trim() || null, date: form.date || null, total_cents: total, event_id: form.event_id || null, office_account_id: form.office || null,
      lines: parsed as NonNullable<TicketlineEdits["lines"]>, confirm_review: confirmed };
  };
  const settlement = () => {
    if (!settle.account && !settle.date && !settle.amount) return undefined;
    if (!settle.account || !settle.date) throw new Error("Escolhe a conta e a data do recebimento.");
    if (!settle.confirm) throw new Error("Confirma que verificaste o recebimento no banco.");
    const amount_cents = toCents(settle.amount); if (!amount_cents) throw new Error("Valor recebido inválido.");
    return { financial_account_id: settle.account, date: settle.date, amount_cents, confirm: true as const };
  };
  const recalc = (save?: boolean) => run(async () => {
    if (!adapter.ticketlinePreview || !token) throw new Error("Revisão indisponível.");
    const r = await adapter.ticketlinePreview({ candidate_token: token, edits: edits(), settlement: settlement(),
      ...(save ? { save: { review_id: preview?.review?.review_id ?? null, expected_version: preview?.review?.version ?? null } } : {}) }, context);
    if (r.events?.length) setEventOptions(prev => [...new Map([...prev, ...r.events!].map(e => [e.id, e])).values()]);
    setPreview(r); setStale(false); setSelected([]);
  });
  const actions = preview?.proposal.actions ?? [];
  const toggle = (id: string) => {
    const deps = (x: string, acc = new Set<string>()): Set<string> => { acc.add(x); actions.find(a => a.id === x)?.depends_on.forEach(d => deps(d, acc)); return acc; };
    const dependents = (x: string, acc = new Set<string>()): Set<string> => { acc.add(x); actions.filter(a => a.depends_on.includes(x)).forEach(a => dependents(a.id, acc)); return acc; };
    setSelected(cur => cur.includes(id) ? cur.filter(x => !dependents(id).has(x)) : [...new Set([...cur, ...deps(id)])]);
  };
  const admissible = selected.length > 0 && selected.every(id => { const a = actions.find(x => x.id === id); return a && !a.blocked_reason && a.depends_on.every(d => selected.includes(d)); });
  const authorize = () => run(async () => {
    if (!adapter.ticketlineAuthorize || !preview?.review) throw new Error("Autorização indisponível.");
    const r = await adapter.ticketlineAuthorize({ review_id: preview.review.review_id, version: preview.review.version, effects_hash: preview.review.effects_hash,
      action_ids: [...selected].sort(), replay_key: crypto.randomUUID() }, context);
    setNotice(r.notice);
    setAuth({ id: r.authorization_id, action_ids: r.action_ids ?? [...selected].sort(), executor: r.executor === "disponível" });
  });
  const offices = (accounts ?? []).filter(a => a.type === "ticket_office");
  const input = "w-full min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  const sourcePicker = (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={loadAttachments}>Ver anexos deste email</Button>
        {cand && <Button size="sm" variant="ghost" disabled={busy} onClick={load}>Reler com a origem escolhida</Button>}
      </div>
      {attachments && (attachments.length === 0 ? <p className="text-muted-foreground">Este email não tem anexos; usa-se o corpo.</p> : (
        <fieldset className="min-w-0 space-y-1">
          <legend className="sr-only">Origem do documento</legend>
          <label className="flex min-w-0 items-center gap-2"><input type="radio" name={`part-${messageId}`} checked={!part} onChange={() => setPart("")} /> <span>Só o corpo do email</span></label>
          {attachments.map(a => (
            <label key={a.part_id} className="flex min-w-0 items-center gap-2">
              <input type="radio" name={`part-${messageId}`} checked={part === a.part_id} onChange={() => setPart(a.part_id)} />
              <span className="min-w-0 flex-1 truncate" title={a.filename}>{a.filename}</span><span className="shrink-0 text-muted-foreground">{kb(a.size_bytes)}</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );

  if (!cand) return (
    <div className="min-w-0 space-y-2 rounded-md border border-border p-2 text-xs">
      {sourcePicker}
      <Button size="sm" disabled={busy} onClick={load}>Rever fecho deste email</Button>
      {error && <p role="alert" className="break-words text-destructive">{error}</p>}
    </div>
  );
  return (
    <section aria-label="Revisão do fecho Ticketline" className="min-w-0 max-w-full space-y-3 overflow-hidden rounded-md border border-border p-2 text-xs sm:p-3">
      <div className="font-semibold">Revisão do fecho (candidato, nada gravado)</div>
      <div className="flex min-w-0 flex-wrap gap-1">{cand.sources.map((s, i) => <Badge key={i} variant="outline" className="max-w-full truncate">{provLabel(s)}</Badge>)}</div>
      {sourcePicker}
      {cand.incomplete.length > 0 && <ul className="list-disc space-y-0.5 break-words pl-4 text-destructive">{cand.incomplete.map(x => <li key={x}>{x}</li>)}</ul>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="min-w-0 space-y-0.5"><span className="block">Nº apuramento <span className="text-muted-foreground">({provLabel(cand.number?.prov)})</span></span>
          <input aria-label="Número" className={input} value={form.number} onChange={e => edit(() => setForm({ ...form, number: e.target.value }))} /></label>
        <label className="min-w-0 space-y-0.5"><span className="block">Data <span className="text-muted-foreground">({provLabel(cand.date?.prov)})</span></span>
          <input aria-label="Data" type="date" className={input} value={form.date} onChange={e => edit(() => setForm({ ...form, date: e.target.value }))} /></label>
        <label className="min-w-0 space-y-0.5"><span className="block">Total do documento (€) <span className="text-muted-foreground">({provLabel(cand.total_cents?.prov)})</span></span>
          <input aria-label="Total" inputMode="decimal" className={input} value={form.total} onChange={e => edit(() => setForm({ ...form, total: e.target.value }))} /></label>
        <label className="min-w-0 space-y-0.5"><span className="block">Evento</span>
          <select aria-label="Evento" className={input} value={form.event_id} onChange={e => edit(() => setForm({ ...form, event_id: e.target.value }))}>
            <option value="">{eventOptions.length ? "Por escolher" : "Recalcula para ver eventos possíveis"}</option>{eventOptions.map(ev => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
          </select></label>
        <label className="min-w-0 space-y-0.5 sm:col-span-2"><span className="block">Bilheteira do apuramento</span>
          <select aria-label="Bilheteira" className={input} value={form.office} onChange={e => edit(() => setForm({ ...form, office: e.target.value }))}>
            <option value="">{accounts === null ? "A carregar…" : offices.length ? "Escolher bilheteira" : "Sem bilheteiras disponíveis"}</option>
            {offices.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></label>
      </div>
      <div className="space-y-1">
        <div className="font-semibold">Linhas</div>
        {lines.map((l, i) => (
          <div key={i} className="grid min-w-0 grid-cols-[1fr_6.5rem] gap-1 rounded border border-border p-1.5 sm:grid-cols-[10rem_minmax(0,1fr)_7rem_auto]">
            <select aria-label={`Tipo da linha ${i + 1}`} className={`${input} col-span-2 sm:col-span-1`} value={l.line_type} onChange={e => edit(() => setLines(lines.map((x, j) => j === i ? { ...x, line_type: e.target.value as TicketlineLineType } : x)))}>
              {TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
            <input aria-label={`Descrição da linha ${i + 1}`} className={input} value={l.description} onChange={e => edit(() => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x)))} />
            <input aria-label={`Valor da linha ${i + 1}`} inputMode="decimal" className={`${input} text-right`} value={l.amount} onChange={e => edit(() => setLines(lines.map((x, j) => j === i ? { ...x, amount: e.target.value } : x)))} />
            <Button size="sm" variant="ghost" className="col-span-2 justify-self-end sm:col-span-1" onClick={() => edit(() => setLines(lines.filter((_, j) => j !== i)))}>Remover</Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => edit(() => setLines([...lines, { line_type: "event_right", description: "", amount: "0,00", event_hint: null }]))}>Adicionar linha</Button>
      </div>
      <fieldset className="min-w-0 space-y-1 rounded border border-border p-1.5">
        <legend className="px-1 font-semibold">Recebimento bancário (opcional, confirmado por si)</legend>
        <p className="text-muted-foreground">O fecho recebido não prova o recebimento. Indica só o que verificaste no banco; é conferido com o fecho confirmado no modal.</p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
          <select aria-label="Conta" className={input} value={settle.account} onChange={e => edit(() => setSettle({ ...settle, account: e.target.value }))}>
            <option value="">{accounts === null ? "A carregar contas…" : accounts.length ? "Escolher conta" : "Sem contas disponíveis"}</option>
            {(accounts ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input aria-label="Data do recebimento" type="date" className={input} value={settle.date} onChange={e => edit(() => setSettle({ ...settle, date: e.target.value }))} />
          <input aria-label="Valor recebido" inputMode="decimal" placeholder="0,00" className={input} value={settle.amount} onChange={e => edit(() => setSettle({ ...settle, amount: e.target.value }))} />
        </div>
        <label className="flex items-start gap-1.5"><input type="checkbox" className="mt-0.5" checked={settle.confirm} onChange={e => edit(() => setSettle({ ...settle, confirm: e.target.checked }))} /> <span>Confirmo que verifiquei este recebimento no banco</span></label>
      </fieldset>
      <label className="flex items-start gap-1.5 rounded border border-border p-1.5"><input type="checkbox" className="mt-0.5" aria-label="Confirmo a revisão" checked={confirmed} onChange={e => edit(() => setConfirmed(e.target.checked))} />
        <span>Revi número, data, total, evento e linhas no documento original.</span></label>
      {stale && preview && <p role="status" className="text-destructive">Alterado: a prévia anterior e qualquer autorização deixaram de valer. Recalcula.</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => recalc()}>Recalcular prévia</Button>
        <Button size="sm" variant="outline" disabled={busy || !preview || stale} onClick={() => recalc(true)}>Guardar revisão</Button>
      </div>
      {preview && !stale && (
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 flex-wrap gap-1">
            <Badge variant="outline">Σ {eur(preview.proposal.sum_cents)} · total {eur(preview.proposal.document_total_cents)}</Badge>
            <Badge variant="outline" className="max-w-full truncate">Versão {preview.review?.version ?? "não guardada"} · {preview.proposal.effects_hash.slice(0, 12)}</Badge>
          </div>
          <ul className="space-y-0.5 break-words">{preview.proposal.checks.map(c => <li key={c.code} className={c.ok ? "" : "text-destructive"}>{c.ok ? "✓" : "✗"} {c.message}</li>)}</ul>
          {preview.proposal.needs.length > 0 && <ul className="list-disc space-y-0.5 break-words pl-4">{preview.proposal.needs.map(n => <li key={n}>{n}</li>)}</ul>}
          <fieldset className="min-w-0 space-y-1">
            <legend className="font-semibold">Ações a autorizar (as dependências entram automaticamente)</legend>
            {(["prepare", "liquidate"] as const).map(stage => (
              <div key={stage} className="space-y-1">
                <div className="text-muted-foreground">{stage === "prepare" ? "Preparar e apurar" : "Liquidar"}</div>
                {actions.filter(a => (a.stage ?? (a.id === "a5" ? "liquidate" : "prepare")) === stage).map(a => (
                  <label key={a.id} className="flex min-w-0 items-start gap-1.5">
                    <input type="checkbox" className="mt-0.5" aria-label={a.label} disabled={!!a.blocked_reason || !preview.persisted} checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                    <span className="min-w-0 break-words">{a.label}{a.blocked_reason && <span className="block text-muted-foreground">Bloqueada: {a.blocked_reason}</span>}</span>
                  </label>
                ))}
              </div>
            ))}
          </fieldset>
          <Button size="sm" variant="outline" disabled={busy || stale || !preview.persisted || !admissible} onClick={authorize}>Autorizar</Button>
          {!preview.persisted && <p className="text-muted-foreground">{preview.notice ?? "Prévia não guardada."} Só uma revisão guardada pode ser autorizada.</p>}
        </div>
      )}
      {auth && !stale && <TicketlineExecutionPanel adapter={adapter} context={context} authorizationId={auth.id} actions={actions.filter(a => auth.action_ids.includes(a.id))} available={auth.executor} />}
      {!auth && <p className="text-muted-foreground">Nada é gravado no sistema antes de autorizar e executar cada ação.</p>}
      {notice && <p role="status" className="break-words">{notice}</p>}
      {error && <p role="alert" className="break-words text-destructive">{error}</p>}
    </section>
  );
}
