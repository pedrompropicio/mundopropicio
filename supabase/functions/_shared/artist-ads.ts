// Utilitários das CONTAS DE TRÁFEGO DO PRÓPRIO ARTISTA (D-ERP57).
//
// Domínio distinto da captação de dados (artist_channel_connections, só
// leitura): aqui gerem-se contas de anúncios do artista, guardadas em
// crm.ad_platform_connections com connection_scope = 'artist'.
//
// Usa o MESMO app Meta e os MESMOS scopes que a ligação Meta do CRM.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { callerCompanyIds } from "./artist-meta.ts";

/** Papéis autorizados a ligar/escolher/desligar contas de tráfego. */
export const ADS_ROLES = [
  "admin",
  "platform_admin",
  "manager",
  "marketing_manager",
];

/**
 * Scopes do OAuth de anúncios de ARTISTA (só artist-ads-meta-oauth-start).
 * Base = scopes da ligação Meta do CRM + instagram_basic (D-ERP133), para
 * anunciar posts do Instagram do artista. O CRM tem a sua própria lista em
 * src/pages/crm/Connections.tsx — não partilha esta constante.
 */
export const META_ADS_SCOPES =
  "public_profile,ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,instagram_basic";

export const META_DIALOG_VERSION = "v18.0";
export const META_GRAPH_VERSION = "v18.0";

export function adsCallbackUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/artist-ads-meta-oauth-callback`;
}

/** Devolve o artista + empresa, validando que o caller tem acesso à empresa. */
export async function artistInCallerScope(
  admin: SupabaseClient,
  artistId: string,
  caller: { userId?: string; isServiceRole?: boolean },
): Promise<
  | { ok: true; artist: { id: string; company_id: string; name: string } }
  | { ok: false; status: number; error: string }
> {
  const { data: artist, error } = await admin
    .from("artists")
    .select("id, company_id, name")
    .eq("id", artistId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!artist) return { ok: false, status: 404, error: "artista não encontrado" };

  if (!caller.isServiceRole) {
    const companies = await callerCompanyIds(admin, caller.userId!);
    if (companies !== "all" && !companies.includes(artist.company_id)) {
      return { ok: false, status: 403, error: "artista fora da empresa do utilizador" };
    }
  }
  return { ok: true, artist: artist as { id: string; company_id: string; name: string } };
}

/** Ligação de tráfego (linha de crm.ad_platform_connections) por id. */
export async function loadAdsConnection(admin: SupabaseClient, id: string) {
  return await (admin as any)
    .schema("crm")
    .from("ad_platform_connections")
    .select(
      "id, company_id, artist_id, connection_scope, platform, status, available_ad_accounts",
    )
    .eq("id", id)
    .maybeSingle();
}

/**
 * Ligação Meta de ARTISTA + token decifrado, com verificação de papel na
 * empresa do artista por user_roles (D-ERP128). Nunca devolve o token ao cliente.
 */
export async function artistMetaConnWithToken(
  admin: SupabaseClient,
  req: Request,
  connectionId: string,
  roles: string[],
): Promise<
  | { ok: true; conn: any; token: string; userId: string | null }
  | { ok: false; status: number; error: string }
> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return { ok: false, status: 401, error: "missing token" };
  let isServiceRole = false;
  try { isServiceRole = JSON.parse(atob(bearer.split(".")[1] ?? ""))?.role === "service_role"; } catch (_e) { /* segue */ }
  let userId: string | null = null;
  if (!isServiceRole) {
    const { data, error } = await admin.auth.getUser(bearer);
    if (error || !data?.user) return { ok: false, status: 401, error: "invalid token" };
    userId = data.user.id;
  }
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return { ok: false, status: 400, error: "connection_id inválido" };
  const { data: conn, error: cErr } = await (admin as any).schema("crm").from("ad_platform_connections")
    .select("id, company_id, artist_id, platform, connection_scope, status, selected_ad_account_id, selected_instagram_id")
    .eq("id", connectionId).maybeSingle();
  if (cErr) return { ok: false, status: 500, error: cErr.message };
  if (!conn || conn.platform !== "meta" || conn.connection_scope !== "artist" || !conn.artist_id) {
    return { ok: false, status: 404, error: "ligação Meta de artista não encontrada" };
  }
  if (conn.status !== "active") return { ok: false, status: 400, error: `ligação não está activa (${conn.status})` };
  if (!isServiceRole) {
    const { data: rr } = await admin.from("user_roles").select("role, company_id").eq("user_id", userId!);
    const ok = (rr ?? []).some((r: { role: string; company_id: string | null }) =>
      r.role === "platform_admin" || (roles.includes(r.role) && r.company_id === conn.company_id));
    if (!ok) return { ok: false, status: 403, error: "sem permissão na empresa do artista" };
  }
  const mk = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!mk) return { ok: false, status: 500, error: "ENCRYPTION_MASTER_KEY não configurado" };
  const { data: t, error: tErr } = await admin.rpc("crm_get_meta_decrypted_token", { p_connection_id: connectionId, p_master_key: mk });
  const token = (Array.isArray(t) ? t[0] : t)?.access_token as string | undefined;
  if (tErr || !token) return { ok: false, status: 500, error: "não foi possível ler o token da ligação" };
  return { ok: true, conn, token, userId };
}
