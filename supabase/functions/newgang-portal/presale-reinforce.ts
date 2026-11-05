// #405 — Reforço da pré-venda NG27: lógica pura (elegibilidade, ordem, lote). Envio manual, sem cron, dry_run por defeito.
import { latestDecisions, type EmailConsentRow } from "./reminder-consent.ts";
import { PreSendError } from "./welcome.ts";

export const PRESALE_MAX_BATCH = 300;
export const PRESALE_TEMPLATE_NAME = "ng27_reforco";
export const presaleMessageId = (memberId: string) => `ng-reforco-${memberId}`;
export const normEmail = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

export type PresaleMember = { id: string; email: string | null; first_name: string | null; created_at: string; erased_at: string | null };
export type PresaleInputs = {
  members: PresaleMember[]; consents: EmailConsentRow[];
  suppressed: Set<string>; // e-mails normalizados ou "sha256:<hex>"
  hashOf: (email: string) => string; // "sha256:<hex>" do e-mail normalizado
  codes: Map<string, string>; exclusions: Set<string>; reserved: Set<string>;
};
export type PresaleBreakdown = {
  members: number; no_granted_consent: number; erased: number; suppressed: number; no_code: number;
  excluded: number; duplicates: number; already_reserved: number; eligible: number;
};

/** Ordem estável created_at, id. Um envio por e-mail: o 1.º membro elegível (pela ordem) fica, os restantes são duplicados. */
export function presaleEligible(i: PresaleInputs): { eligible: (PresaleMember & { code: string })[]; breakdown: PresaleBreakdown } {
  const b: PresaleBreakdown = { members: i.members.length, no_granted_consent: 0, erased: 0, suppressed: 0, no_code: 0, excluded: 0, duplicates: 0, already_reserved: 0, eligible: 0 };
  const last = latestDecisions(i.consents);
  const sorted = [...i.members].sort((a, c) => a.created_at < c.created_at ? -1 : a.created_at > c.created_at ? 1 : a.id < c.id ? -1 : a.id > c.id ? 1 : 0);
  const seen = new Set<string>();
  const out: (PresaleMember & { code: string })[] = [];
  for (const m of sorted) {
    const e = normEmail(m.email);
    if (m.erased_at) { b.erased++; continue; }
    if (last.get(m.id) !== "granted") { b.no_granted_consent++; continue; }
    if (!e || i.suppressed.has(e) || i.suppressed.has(i.hashOf(e))) { b.suppressed++; continue; }
    const code = i.codes.get(e);
    if (!code) { b.no_code++; continue; }
    if (i.exclusions.has(e)) { b.excluded++; continue; }
    if (seen.has(e)) { b.duplicates++; continue; }
    seen.add(e);
    if (i.reserved.has(m.id)) { b.already_reserved++; continue; }
    out.push({ ...m, code });
  }
  b.eligible = out.length;
  return { eligible: out, breakdown: b };
}

export function presaleLimit(v: unknown): { limit: number } | { error: "limit_too_large"; max: number } {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : PRESALE_MAX_BATCH;
  if (n > PRESALE_MAX_BATCH) return { error: "limit_too_large", max: PRESALE_MAX_BATCH };
  return { limit: Math.max(0, n) };
}

export interface PresaleDeps {
  /** true = reservado agora; false = já existia reserva (não envia). */
  reserve(memberId: string, messageId: string): Promise<boolean>;
  mark(memberId: string, status: "enqueued" | "error_pre_send" | "unknown", error?: string): Promise<void>;
  send(memberId: string, messageId: string): Promise<void>;
  log?(msg: string, memberId: string, detail?: string): void;
}

/** Percorre por ordem; reserva antes de enviar; para ao 3.º unknown seguido. */
export async function runPresaleBatch(deps: PresaleDeps, ids: string[]) {
  const out = { sent: 0, skipped: 0, error_pre_send: 0, unknown: 0, stopped: false };
  let unknownRun = 0;
  for (const id of ids) {
    const mid = presaleMessageId(id);
    let ok: boolean;
    try { ok = await deps.reserve(id, mid); } catch (e) { deps.log?.("presale_reserve_failed", id, (e as Error).message); out.skipped++; unknownRun = 0; continue; }
    if (!ok) { out.skipped++; unknownRun = 0; continue; }
    try { await deps.send(id, mid); }
    catch (e) {
      const st = e instanceof PreSendError ? "error_pre_send" : "unknown";
      out[st]++;
      deps.log?.(`presale_${st}`, id, (e as Error).message);
      try { await deps.mark(id, st, (e as Error).message); } catch (e2) { deps.log?.("presale_mark_failed", id, (e2 as Error).message); }
      unknownRun = st === "unknown" ? unknownRun + 1 : 0;
      if (unknownRun >= 3) { out.stopped = true; break; }
      continue;
    }
    unknownRun = 0;
    out.sent++;
    try { await deps.mark(id, "enqueued"); } catch (e) { deps.log?.("presale_mark_failed", id, (e as Error).message); }
  }
  return out;
}
