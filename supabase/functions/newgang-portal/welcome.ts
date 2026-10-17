// #321 — envio do welcome do Clube com reserva atómica ANTES de qualquer envio.
// Só a execução que adquire a reserva (club_welcome_reserve) chama o envio; a reserva nunca é
// libertada para resultados incertos. Falha comprovada antes de enfileirar -> error_pre_send (retry SQL limitado);
// falha/timeout no enfileiramento -> unknown (resultado desconhecido, NÃO repetir).

export class PreSendError extends Error {}

export interface WelcomeDeps {
  reserve(memberId: string, messageId: string): Promise<boolean>;
  mark(memberId: string, status: "enqueued" | "error_pre_send" | "unknown", error?: string): Promise<void>;
  /** prepara (pré-envio; lança PreSendError) e enfileira; lança outro erro se o enfileiramento falhar/for incerto */
  send(memberId: string, messageId: string): Promise<void>;
  log?(msg: string, memberId: string, detail?: string): void;
}

export type WelcomeResult = "sent" | "skipped" | "error_pre_send" | "unknown";

export function welcomeMessageId(memberId: string) { return `ng-welcome-${memberId}`; }

export async function sendWelcomeOnce(deps: WelcomeDeps, memberId: string): Promise<WelcomeResult> {
  const messageId = welcomeMessageId(memberId);
  let acquired = false;
  try { acquired = await deps.reserve(memberId, messageId); }
  catch (e) { deps.log?.("welcome_reserve_failed", memberId, (e as Error).message); return "skipped"; }
  if (!acquired) return "skipped";
  try {
    await deps.send(memberId, messageId);
  } catch (e) {
    const st = e instanceof PreSendError ? "error_pre_send" : "unknown";
    deps.log?.(`welcome_${st}`, memberId, (e as Error).message);
    try { await deps.mark(memberId, st, (e as Error).message); }
    catch (e2) { deps.log?.("welcome_mark_failed", memberId, (e2 as Error).message); }
    return st;
  }
  try { await deps.mark(memberId, "enqueued"); }
  catch (e) { deps.log?.("welcome_mark_failed", memberId, (e as Error).message); }
  return "sent";
}
