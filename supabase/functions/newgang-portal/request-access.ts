// #332 Parte A — ação request_access testável (membro / não-membro / normalização).
// Expõe o núcleo da ação sem depender de supabase-js: o chamador injeta o lookup e o envio.
import { normalizeEmail } from "./pending.ts";

export type Member = { id: string; first_name: string | null; email: string } | null;
export type Lookup = (siteId: string, normalizedEmail: string) => Promise<Member>;
export type Send = (m: NonNullable<Member>) => Promise<void>;
export type Log = (reason: "sent" | "not_member") => void;
export type Result = { status: 200 | 400; body: { ok?: true; status?: "sent" | "not_member"; error?: string } };

export async function requestAccessAction(
  siteId: string,
  rawEmail: string | undefined,
  lookup: Lookup,
  send: Send,
  log: Log = () => {},
): Promise<Result> {
  if (!rawEmail) return { status: 400, body: { error: "email" } };
  const email = normalizeEmail(rawEmail);
  const m = await lookup(siteId, email);
  if (!m) {
    log("not_member");
    return { status: 200, body: { ok: true, status: "not_member" } };
  }
  // Erros do envio não revelam a existência do membro ao chamador.
  try { await send({ ...m, email }); } catch { /* registado pelo chamador */ }
  log("sent");
  return { status: 200, body: { ok: true, status: "sent" } };
}
