// D-ERP259 — verificação central de acesso a um artista nas edge functions.
// Chama public.artist_access_check na SESSÃO do utilizador (a regra vive só
// na base). service_role é sempre aceite (cron/chamadas internas).
//   need: 'read' (com área) | 'traffic_write' | 'admin'
import { createClient } from "npm:@supabase/supabase-js@2";
import { isServiceRoleRequest } from "./multiTenant.ts";

export type ArtistNeed = "read" | "traffic_write" | "admin";
export type ArtistAccessResult =
  | { ok: true; companyId: string | null; userId: string | null; isServiceRole: boolean }
  | { ok: false; status: number; error: string };

export async function assertArtistAccess(
  req: Request,
  artistId: string,
  need: ArtistNeed,
  area: string | null = null,
): Promise<ArtistAccessResult> {
  if (!artistId) return { ok: false, status: 400, error: "artist_id obrigatório" };
  if (await isServiceRoleRequest(req)) {
    return { ok: true, companyId: null, userId: null, isServiceRole: true };
  }
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return { ok: false, status: 401, error: "sessão em falta" };
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const user = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: u, error: uErr } = await user.auth.getUser(bearer);
  if (uErr || !u?.user) return { ok: false, status: 401, error: "sessão inválida" };
  const { data, error } = await user.rpc("artist_access_check", {
    p_artist_id: artistId, p_need: need, p_area: area,
  });
  if (error) {
    const denied = error.code === "42501" || /acesso|sessão|inexistente/i.test(error.message ?? "");
    return { ok: false, status: denied ? 403 : 500, error: denied ? "sem acesso a este artista" : error.message };
  }
  return { ok: true, companyId: (data as string) ?? null, userId: u.user.id, isServiceRole: false };
}

/** Valida só a sessão (sem exigir papel na empresa) — para quem entra por atribuição. */
export async function authenticateOnly(req: Request, admin: any): Promise<
  { allowed: true; userId?: string; isServiceRole?: boolean; roles?: string[] } | { allowed: false; reason: string }
> {
  if (await isServiceRoleRequest(req)) return { allowed: true, isServiceRole: true };
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return { allowed: false, reason: "missing token" };
  const { data, error } = await admin.auth.getUser(bearer);
  if (error || !data?.user) return { allowed: false, reason: "invalid token" };
  return { allowed: true, userId: data.user.id, roles: [] };
}
