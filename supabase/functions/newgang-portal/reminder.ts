// Lembrete de confirmação do Clube Newgang: um por membro, reserva atómica antes do envio (padrão welcome.ts).
// Envio só manual (ações de operador), sem cron. dry_run por defeito. Máx. 300 por chamada (#356).
import { PreSendError } from "./welcome.ts";

export const REMINDER_MAX_BATCH = 300;
export function reminderMessageId(memberId: string) { return `ng-reminder-${memberId}`; }

export interface ReminderDeps {
  /** devolve 'reserved' ou o motivo da recusa (confirmed, suppressed, too_recent, welcome_dlq, already_reserved, ...) */
  reserve(memberId: string, messageId: string, test: boolean): Promise<string>;
  mark(memberId: string, status: "enqueued" | "error_pre_send" | "unknown", error?: string): Promise<void>;
  send(memberId: string, messageId: string): Promise<void>;
  log?(msg: string, memberId: string, detail?: string): void;
}
export type ReminderResult = "sent" | "skipped" | "error_pre_send" | "unknown";

export async function sendReminderOnce(deps: ReminderDeps, memberId: string, test = false): Promise<{ result: ReminderResult; reason?: string }> {
  const messageId = reminderMessageId(memberId);
  let r: string;
  try { r = await deps.reserve(memberId, messageId, test); }
  catch (e) { deps.log?.("reminder_reserve_failed", memberId, (e as Error).message); return { result: "skipped", reason: "reserve_failed" }; }
  if (r !== "reserved") return { result: "skipped", reason: r };
  try { await deps.send(memberId, messageId); }
  catch (e) {
    const st = e instanceof PreSendError ? "error_pre_send" : "unknown";
    deps.log?.(`reminder_${st}`, memberId, (e as Error).message);
    try { await deps.mark(memberId, st, (e as Error).message); } catch (e2) { deps.log?.("reminder_mark_failed", memberId, (e2 as Error).message); }
    return { result: st };
  }
  try { await deps.mark(memberId, "enqueued"); } catch (e) { deps.log?.("reminder_mark_failed", memberId, (e as Error).message); }
  return { result: "sent" };
}

export function clampLimit(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 0;
  return Math.max(0, Math.min(REMINDER_MAX_BATCH, n));
}

/** #356: limit numérico acima do máximo é rejeitado (400) antes de qualquer efeito. Omitido/inválido/≤ máximo → null (comportamento atual). */
export function reminderLimitError(v: unknown): { error: "limit_too_large"; max: number } | null {
  return typeof v === "number" && Number.isFinite(v) && Math.floor(v) > REMINDER_MAX_BATCH
    ? { error: "limit_too_large", max: REMINDER_MAX_BATCH } : null;
}

/** Lote: percorre os candidatos por ordem; para ao 3.º resultado unknown seguido (resultado incerto na fila). */
export async function runReminderBatch(deps: ReminderDeps, ids: string[]) {
  const out = { sent: 0, skipped: 0, error_pre_send: 0, unknown: 0, reasons: {} as Record<string, number>, stopped: false };
  let unknownRun = 0;
  for (const id of ids) {
    const r = await sendReminderOnce(deps, id, false);
    out[r.result]++;
    if (r.reason) out.reasons[r.reason] = (out.reasons[r.reason] ?? 0) + 1;
    unknownRun = r.result === "unknown" ? unknownRun + 1 : 0;
    if (unknownRun >= 3) { out.stopped = true; break; }
  }
  return out;
}
