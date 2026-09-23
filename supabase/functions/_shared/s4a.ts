// Spotify for Artists — cadeia de token no servidor (D-ERP135).
// Módulo interno: NUNCA expor o Bearer por HTTP. Nunca registar tokens,
// client_id completo ou cookies. Só refresh_token (nunca login/authorize).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const S4A_TOKEN_URL = "https://accounts.spotify.com/api/token";

export class S4aError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export type S4aToken = { accessToken: string; expiresAt: string; rotated: boolean; connectionId: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type S4aRefreshResult =
  | { ok: true; access_token: string; refresh_token: string; expires_in: number }
  | { ok: false; status: number; error: string | null };

/** Troca de refresh (cliente PKCE público, sem segredo). */
export async function s4aRefresh(clientId: string, refreshToken: string): Promise<S4aRefreshResult> {
  let res: Response;
  try {
    res = await fetch(S4A_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: refreshToken }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (_e) {
    return { ok: false, status: 0, error: "network" };
  }
  const j = await res.json().catch(() => ({} as any));
  if (res.ok && j?.access_token && j?.refresh_token) {
    return { ok: true, access_token: j.access_token, refresh_token: j.refresh_token, expires_in: Number(j.expires_in) || 3600 };
  }
  return { ok: false, status: res.status, error: typeof j?.error === "string" ? j.error : null };
}

function masterKey(): string {
  const k = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!k) throw new S4aError("s4a_sem_chave", "ENCRYPTION_MASTER_KEY não configurada");
  return k;
}

async function findConnection(admin: SupabaseClient, artistId: string) {
  const { data: ch } = await admin
    .from("artist_channels").select("id").eq("artist_id", artistId).eq("platform", "spotify")
    .limit(1).maybeSingle();
  if (!ch) throw new S4aError("s4a_sem_ligacao");
  const { data: conn } = await admin
    .from("artist_channel_connections")
    .select("id, status, oauth_client_id, expires_at, consecutive_failures")
    .eq("artist_channel_id", ch.id).eq("provider", "spotify")
    .limit(1).maybeSingle();
  if (!conn) throw new S4aError("s4a_sem_ligacao");
  return conn as { id: string; status: string; oauth_client_id: string | null; expires_at: string | null; consecutive_failures: number | null };
}

async function readTokens(admin: SupabaseClient, id: string, key: string) {
  const { data, error } = await admin.rpc("artist_get_connection_token", { p_connection_id: id, p_master_key: key });
  if (error) throw new S4aError("s4a_leitura_falhou");
  const t = Array.isArray(data) ? data[0] : data;
  if (!t?.access_token) throw new S4aError("s4a_leitura_falhou");
  return t as { access_token: string; refresh_token: string | null; expires_at: string | null };
}

const fresh = (exp: string | null) => !!exp && new Date(exp).getTime() > Date.now() + 5 * 60_000;

export async function getS4aAccessToken(admin: SupabaseClient, artistId: string): Promise<S4aToken> {
  const key = masterKey();
  const conn = await findConnection(admin, artistId);
  if (conn.status !== "active") throw new S4aError("s4a_precisa_semente");

  const cached = await readTokens(admin, conn.id, key);
  if (fresh(cached.expires_at)) {
    return { accessToken: cached.access_token, expiresAt: cached.expires_at!, rotated: false, connectionId: conn.id };
  }

  const { data: gotLease } = await admin.rpc("artist_channel_refresh_lease", { p_connection_id: conn.id, p_seconds: 60 });
  if (!gotLease) {
    for (let i = 0; i < 3; i++) {
      await sleep(2000);
      const t = await readTokens(admin, conn.id, key);
      if (fresh(t.expires_at)) {
        return { accessToken: t.access_token, expiresAt: t.expires_at!, rotated: false, connectionId: conn.id };
      }
    }
    throw new S4aError("s4a_rotacao_ocupada");
  }

  const failures = (conn.consecutive_failures ?? 0) + 1;
  if (!conn.oauth_client_id || !cached.refresh_token) {
    await admin.from("artist_channel_connections").update({
      status: "expired", refresh_lock_until: null, consecutive_failures: failures,
      last_error: "S4A: ligação sem client_id/refresh_token — precisa de nova semente",
    }).eq("id", conn.id);
    throw new S4aError("s4a_precisa_semente");
  }

  const r = await s4aRefresh(conn.oauth_client_id, cached.refresh_token);
  if (r.ok) {
    const expiresAt = new Date(Date.now() + r.expires_in * 1000).toISOString();
    const { error: stErr } = await admin.rpc("artist_channel_store_rotated_tokens", {
      p_connection_id: conn.id, p_master_key: key,
      p_access_token: r.access_token, p_refresh_token: r.refresh_token, p_expires_at: expiresAt,
    });
    if (stErr) {
      await admin.from("artist_channel_connections").update({
        status: "expired", refresh_lock_until: null, consecutive_failures: failures,
        last_error: "S4A: rotação feita mas não gravada — precisa de nova semente",
      }).eq("id", conn.id);
      throw new S4aError("s4a_rotacao_nao_gravada");
    }
    return { accessToken: r.access_token, expiresAt, rotated: true, connectionId: conn.id };
  }

  if (r.status === 400 && r.error === "invalid_grant") {
    await admin.from("artist_channel_connections").update({
      status: "expired", refresh_lock_until: null, consecutive_failures: failures,
      last_error: "S4A: refresh_token inválido — precisa de nova semente",
    }).eq("id", conn.id);
    throw new S4aError("s4a_precisa_semente");
  }

  await admin.from("artist_channel_connections").update({
    refresh_lock_until: null, consecutive_failures: failures,
    last_error: `S4A: refresh falhou (HTTP ${r.status}${r.error ? " " + r.error : ""})`,
  }).eq("id", conn.id);
  throw new S4aError("s4a_refresh_falhou", `HTTP ${r.status}`);
}

/**
 * Autorização D-ERP128: JWT explícito + papel admin/platform_admin em
 * user_roles contra artists.company_id. service_role opcional.
 */
export async function authorizeArtistAdmin(
  req: Request, admin: SupabaseClient, artistId: string, allowServiceRole: boolean,
): Promise<{ ok: true; userId: string | null; companyId: string } | { ok: false; status: number; error: string }> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return { ok: false, status: 401, error: "sem sessão" };

  const { data: artist } = await admin.from("artists").select("id, company_id").eq("id", artistId).maybeSingle();
  if (!artist?.company_id) return { ok: false, status: 404, error: "artista não encontrado" };

  let isSr = false;
  try {
    isSr = JSON.parse(atob(bearer.split(".")[1] ?? ""))?.role === "service_role";
  } catch (_e) { /* não-JWT */ }
  if (!isSr && bearer === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "\u0000")) isSr = true;
  if (isSr) {
    return allowServiceRole
      ? { ok: true, userId: null, companyId: artist.company_id }
      : { ok: false, status: 403, error: "exige sessão de utilizador" };
  }

  const { data: u, error } = await admin.auth.getUser(bearer);
  if (error || !u?.user) return { ok: false, status: 401, error: "sessão inválida" };
  const { data: roles } = await admin.from("user_roles").select("role, company_id").eq("user_id", u.user.id);
  const ok = (roles ?? []).some((r: any) =>
    r.role === "platform_admin" || (r.role === "admin" && r.company_id === artist.company_id)
  );
  if (!ok) return { ok: false, status: 403, error: "papel insuficiente" };
  return { ok: true, userId: u.user.id, companyId: artist.company_id };
}
