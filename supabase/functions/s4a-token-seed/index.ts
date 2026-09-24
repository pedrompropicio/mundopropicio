// s4a-token-seed (D-ERP135) — semente da cadeia de token S4A.
// verify_jwt=true. Dois caminhos:
//  1) { seed_code, client_id, refresh_token } — código de uso único gerado na
//     app (artist_s4a_seed_code_create); SEM sessão de utilizador. O artist_id
//     vem do código e connected_by = created_by do código. Chave de serviço
//     recusada neste caminho. Origem permitida: https://artists.spotify.com.
//  2) { artist_id, client_id, refresh_token } com sessão de admin (actual).
// Troca logo o refresh recebido (toma posse da cadeia) e grava cifrado.
// Resposta nunca contém tokens; o código nunca é registado em log.

import { adminClient, allowedReturnOrigins } from "../_shared/artist-meta.ts";
import { authorizeArtistAdmin, s4aRefresh } from "../_shared/s4a.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_RE = /^[A-Za-z0-9]{32}$/;
const SEED_RE = /^S4A-[0-9A-F]{12}$/i;
const S4A_ORIGIN = "https://artists.spotify.com";

// Limite de tentativas falhadas de código por IP (memória da instância).
const FAIL_WINDOW_MS = 10 * 60_000;
const FAIL_MAX = 5;
const failures = new Map<string, number[]>();
function recentFails(ip: string): number[] {
  const now = Date.now();
  const arr = (failures.get(ip) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  failures.set(ip, arr);
  return arr;
}
function addFail(ip: string) {
  const arr = recentFails(ip);
  arr.push(Date.now());
  failures.set(ip, arr);
  console.log(`[s4a-token-seed] tentativa de código falhada ip=${ip} n=${arr.length}`);
}
function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "desconhecido";
}

function corsFor(origin: string | null): Record<string, string> {
  const allowed = new Set([S4A_ORIGIN, ...allowedReturnOrigins()]);
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && allowed.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function isServiceRoleBearer(req: Request): boolean {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return false;
  if (bearer === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "\u0000")) return true;
  try {
    return JSON.parse(atob(bearer.split(".")[1] ?? ""))?.role === "service_role";
  } catch (_e) {
    return false;
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const cors = corsFor(origin);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const body = await req.json().catch(() => null);
  const seedCode = body?.seed_code;
  const clientId = body?.client_id;
  const refreshToken = body?.refresh_token;
  const useCode = seedCode !== undefined && seedCode !== null;

  if (typeof clientId !== "string" || !CLIENT_RE.test(clientId)) return json({ ok: false, error: "client_id inválido" }, 400);
  if (typeof refreshToken !== "string" || refreshToken.length < 20 || refreshToken.length > 4096) {
    return json({ ok: false, error: "refresh_token inválido" }, 400);
  }

  const admin = adminClient();
  let artistId: string;
  let connectedBy: string | null;

  if (useCode) {
    if (typeof seedCode !== "string" || !SEED_RE.test(seedCode.trim())) {
      return json({ ok: false, error: "seed_code inválido" }, 400);
    }
    if (isServiceRoleBearer(req)) return json({ ok: false, error: "chave de serviço não aceite com código" }, 403);
    const ip = clientIp(req);
    if (recentFails(ip).length >= FAIL_MAX) {
      console.log(`[s4a-token-seed] limite de tentativas atingido ip=${ip}`);
      return json({ ok: false, error: "demasiadas_tentativas" }, 429);
    }
    const { data: rows, error: cErr } = await admin.rpc("artist_s4a_seed_code_consume", { p_code: seedCode.trim() });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (cErr || !row?.artist_id) {
      addFail(ip);
      return json({ ok: false, error: "codigo_invalido_ou_expirado" }, 403);
    }
    artistId = row.artist_id;
    connectedBy = row.created_by ?? null;
  } else {
    const bodyArtist = body?.artist_id;
    if (typeof bodyArtist !== "string" || !UUID_RE.test(bodyArtist)) return json({ ok: false, error: "artist_id inválido" }, 400);
    const auth = await authorizeArtistAdmin(req, admin, bodyArtist, false);
    if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
    artistId = bodyArtist;
    connectedBy = auth.userId;
  }

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
    p_connected_by: connectedBy,
    p_refresh_token: r.refresh_token,
    p_refresh_expires_at: null,
  });
  if (upErr || !connectionId) {
    console.error("[s4a-token-seed] gravação falhou:", upErr?.message);
    return json({ ok: false, error: "rotação feita mas não gravada — precisa de nova semente" }, 500);
  }

  const { error: cErr2 } = await admin.from("artist_channel_connections")
    .update({ oauth_client_id: clientId, refresh_lock_until: null }).eq("id", connectionId);
  if (cErr2) return json({ ok: false, error: "client_id não gravado", connection_id: connectionId }, 500);

  return json({ ok: true, connection_id: connectionId, expires_at: expiresAt });
});
