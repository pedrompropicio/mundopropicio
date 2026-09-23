// s4a-token-seed (D-ERP135) — semente da cadeia de token S4A.
// verify_jwt=true; exige utilizador admin/platform_admin da empresa do artista.
// Troca logo o refresh recebido (toma posse da cadeia) e grava cifrado.
// Resposta nunca contém tokens.

import { adminClient, corsHeaders, json } from "../_shared/artist-meta.ts";
import { authorizeArtistAdmin, s4aRefresh } from "../_shared/s4a.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_RE = /^[A-Za-z0-9]{32}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const body = await req.json().catch(() => null);
  const artistId = body?.artist_id;
  const clientId = body?.client_id;
  const refreshToken = body?.refresh_token;
  if (typeof artistId !== "string" || !UUID_RE.test(artistId)) return json({ ok: false, error: "artist_id inválido" }, 400);
  if (typeof clientId !== "string" || !CLIENT_RE.test(clientId)) return json({ ok: false, error: "client_id inválido" }, 400);
  if (typeof refreshToken !== "string" || refreshToken.length < 20 || refreshToken.length > 4096) {
    return json({ ok: false, error: "refresh_token inválido" }, 400);
  }

  const admin = adminClient();
  const auth = await authorizeArtistAdmin(req, admin, artistId, false);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKey) return json({ ok: false, error: "ENCRYPTION_MASTER_KEY não configurada" }, 500);

  const { data: channel } = await admin
    .from("artist_channels").select("id, company_id, artist_id, external_id")
    .eq("artist_id", artistId).eq("platform", "spotify").limit(1).maybeSingle();
  if (!channel) return json({ ok: false, error: "artista sem canal spotify" }, 400);

  const r = await s4aRefresh(clientId, refreshToken);
  if (!r.ok) return json({ ok: false, error: "troca falhou", status_http: r.status, code: r.error }, 502);

  const expiresAt = new Date(Date.now() + r.expires_in * 1000).toISOString();
  const { data: connectionId, error: upErr } = await admin.rpc("artist_upsert_channel_connection", {
    p_artist_channel_id: channel.id,
    p_company_id: channel.company_id,
    p_artist_id: channel.artist_id,
    p_provider: "spotify",
    p_access_token: r.access_token,
    p_master_key: masterKey,
    p_external_account_id: channel.external_id,
    p_external_account_username: null,
    p_external_page_id: null,
    p_external_page_name: null,
    p_token_type: "Bearer",
    p_scopes: [],
    p_expires_at: expiresAt,
    p_connected_by: auth.userId,
    p_refresh_token: r.refresh_token,
    p_refresh_expires_at: null,
  });
  if (upErr || !connectionId) {
    console.error("[s4a-token-seed] gravação falhou:", upErr?.message);
    return json({ ok: false, error: "rotação feita mas não gravada — precisa de nova semente" }, 500);
  }

  const { error: cErr } = await admin.from("artist_channel_connections")
    .update({ oauth_client_id: clientId, refresh_lock_until: null }).eq("id", connectionId);
  if (cErr) return json({ ok: false, error: "client_id não gravado", connection_id: connectionId }, 500);

  return json({ ok: true, connection_id: connectionId, expires_at: expiresAt });
});
