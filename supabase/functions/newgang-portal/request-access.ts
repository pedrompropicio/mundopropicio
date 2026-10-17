// #332 Parte A — ação request_access testável (membro / não-membro / normalização).
// Expõe o núcleo da ação sem depender de supabase-js: o chamador injeta o lookup e o envio.
import { normalizeEmail } from "./pending.ts";

export type Member = { id: string; first_name: string | null; email: string } | null;
export type Lookup = (siteId: string, normalizedEmail: string) => Promise<Member>;
export type Send = (m: NonNullable<Member>) => Promise<void>;
export type Log = (reason: "sent" | "pending" | "not_member") => void;
export type Result = { status: 200 | 400; body: { ok?: true; status?: "sent" | "pending" | "not_member"; error?: string } };
export const PENDING_WINDOW_MS = 30 * 60_000;
export function isRecentPendingCapture(c: { source: string; processed: boolean; created_at: string }, now = Date.now()) {
  const created = Date.parse(c.created_at);
  return c.source === "clube_newgang" && c.processed === false && created >= now - PENDING_WINDOW_MS && created <= now;
}

export async function requestAccessAction(
  siteId: string,
  rawEmail: string | undefined,
  lookup: Lookup,
  send: Send,
  log: Log = () => {},
  pending: (siteId: string, normalizedEmail: string) => Promise<boolean> = async () => false,
): Promise<Result> {
  if (!rawEmail) return { status: 400, body: { error: "email" } };
  const email = normalizeEmail(rawEmail);
  const m = await lookup(siteId, email);
  if (!m) {
    const status = await pending(siteId, email) ? "pending" : "not_member";
    log(status);
    return { status: 200, body: { ok: true, status } };
  }
  // Erros do envio não revelam a existência do membro ao chamador.
  try { await send({ ...m, email }); } catch { /* registado pelo chamador */ }
  log("sent");
  return { status: 200, body: { ok: true, status: "sent" } };
}
