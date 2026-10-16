// #328 — Pendência de Crew (convite que não entrou) + lookup exato por email.
// Puro/injetável: testável sem base nem rede. O member_id vem SEMPRE da sessão do servidor, nunca do payload.
// Nenhuma resposta inclui emails, tokens ou ids de membros.

export const PENDING_OPS = ["status", "retry", "dismiss"] as const;
export type PendingOp = typeof PENDING_OPS[number];
export const PENDING_STATUSES = ["crew_full", "crew_not_found", "already_in_crew", "error"] as const;
export type PendingStatus = typeof PENDING_STATUSES[number];
export type PendingView = { status: PendingStatus; code: string; crew_name: string | null } | null;
export type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
export type Result = { status: number; body: Record<string, unknown> };

/** Normalização canónica do email (igual a lower(trim(email)) na base). */
export function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

/** Só devolve status/code/crew_name validados; tudo o resto é descartado. */
export function pendingFrom(raw: unknown): PendingView {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status = PENDING_STATUSES.includes(r.status as PendingStatus) ? (r.status as PendingStatus) : null;
  const code = typeof r.code === "string" && /^[A-Z0-9]{1,12}$/.test(r.code) ? r.code : null;
  if (!status || !code) return null;
  const crew_name = typeof r.crew_name === "string" && r.crew_name.length <= 60 ? r.crew_name : null;
  return { status, code, crew_name };
}

/** HTTP para erros da RPC club_crew_pending. */
export function pendingErrorStatus(err: string): number {
  return err === "no_session" ? 401 : 400;
}

/**
 * Ação crew_pending. `member` = membro resolvido pelo token da sessão (ou null).
 * `body` pode trazer qualquer campo (ex.: member_id de outro membro): só `op` é lido.
 */
export async function crewPendingAction(rpc: RpcFn, member: { id: string; confirmed_at: string | null } | null,
  body: Record<string, unknown>, log: (m: string) => void = console.error): Promise<Result> {
  if (!member?.confirmed_at) return { status: 401, body: { error: "no_session" } };
  const op = body.op;
  if (typeof op !== "string" || !PENDING_OPS.includes(op as PendingOp)) return { status: 400, body: { error: "action" } };
  let r: { data: any; error: any };
  try { r = await rpc("club_crew_pending", { p_member: member.id, p_action: op }); }
  catch (e) { log(`newgang-portal crew_pending rpc: ${(e as Error).message}`); return { status: 500, body: { error: "crew_pending" } }; }
  if (r.error) { log(`newgang-portal crew_pending: ${r.error.message ?? "erro"}`); return { status: 500, body: { error: "crew_pending" } }; }
  const out = r.data ?? {};
  if (typeof out.error === "string") return { status: pendingErrorStatus(out.error), body: { error: out.error } };
  if (!("pending" in out)) { log("newgang-portal crew_pending: resposta sem 'pending'"); return { status: 500, body: { error: "crew_pending" } }; }
  const pending = pendingFrom(out.pending);
  if (out.pending !== null && pending === null) { log("newgang-portal crew_pending: pendência malformada"); return { status: 500, body: { error: "crew_pending" } }; }
  return { status: 200, body: { pending, joined: op === "retry" && out.pending === null && !!out.crew_id } };
}

/**
 * Campo me.pending_crew. Usa op 'status' (pode LIMPAR pendência obsoleta: é escrita autenticada).
 * Falha da RPC não é silenciosa: regista e devolve pending_crew_error='unavailable'.
 */
export async function mePendingCrew(rpc: RpcFn, memberId: string, log: (m: string) => void = console.error):
  Promise<{ pending_crew: PendingView; pending_crew_error?: "unavailable" }> {
  try {
    const r = await rpc("club_crew_pending", { p_member: memberId, p_action: "status" });
    if (r.error || !r.data || typeof r.data.error === "string" || !("pending" in r.data)) {
      log(`newgang-portal me.pending_crew: ${r.error?.message ?? r.data?.error ?? "resposta inválida"}`);
      return { pending_crew: null, pending_crew_error: "unavailable" };
    }
    const pv = pendingFrom(r.data.pending);
    if (r.data.pending !== null && pv === null) {
      log("newgang-portal me.pending_crew: pendência malformada");
      return { pending_crew: null, pending_crew_error: "unavailable" };
    }
    return { pending_crew: pv };
  } catch (e) {
    log(`newgang-portal me.pending_crew: ${(e as Error).message}`);
    return { pending_crew: null, pending_crew_error: "unavailable" };
  }
}

/** Builder mínimo (subconjunto do supabase-js) para o lookup exato. */
export type EqQuery = { eq(col: string, v: string): EqQuery; maybeSingle(): Promise<{ data: any; error: any }> };

/** request_access: comparação EXATA com email normalizado (sem ilike: '_' e '%' não são coringas). */
export async function memberByEmail(from: () => EqQuery, siteId: string, email: string) {
  return await from().eq("site_id", siteId).eq("email", normalizeEmail(email)).maybeSingle();
}
