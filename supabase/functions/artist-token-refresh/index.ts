// artist-token-refresh — renova os tokens das ligações directas do módulo
// Carreira Artística:
//   provider = 'instagram' → token de longa duração (~60 dias): renova quando
//     faltam menos de 15 dias e o token já tem mais de 24 h (regra da Meta);
//   provider = 'tiktok'    → access token de 24 h com refresh token de 365 dias:
//     renova quando faltam menos de 6 h para expirar.
//
// JWT obrigatório: service_role ou admin/platform_admin.

import {
  adminClient,
  auditLog,
  authorize,
  corsHeaders,
  IG_GRAPH_ROOT,
  json,
} from "../_shared/artist-meta.ts";
import { tiktokCreds, ttRefresh } from "../_shared/artist-tiktok.ts";

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** TikTok: renova com menos de 6 h de vida. */
const TIKTOK_MARGIN_MS = 6 * HOUR;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();
  const caller = await authorize(req, admin, ["admin", "platform_admin"]);
  if (!caller.allowed) return json({ error: caller.reason ?? "not authorized" }, 403);

  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKey) return json({ error: "ENCRYPTION_MASTER_KEY não configurada" }, 500);

  let body: {
    connection_id?: string;
    artist_id?: string;
    provider?: string;
    dry_run?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch (_e) { /* body opcional */ }
  const dryRun = body.dry_run !== false;

  let q = admin
    .from("artist_channel_connections")
    .select("id, artist_id, artist_channel_id, company_id, provider, expires_at, connected_at, token_type, external_account_id, external_account_username")
    .in("provider", ["instagram", "tiktok"])
    .eq("status", "active");
  if (body.provider) q = q.eq("provider", body.provider);
  if (body.connection_id) q = q.eq("id", body.connection_id);
  if (body.artist_id) q = q.eq("artist_id", body.artist_id);

  const { data: connections, error: cErr } = await q;
  if (cErr) return json({ error: cErr.message }, 500);

  const now = Date.now();
  const results: Array<Record<string, unknown>> = [];
  let refreshed = 0;
  const errors: Array<{ connection_id: string; error: string }> = [];

  const expire = async (
    conn: { id: string; artist_channel_id: string },
    msg: string,
  ) => {
    await admin.rpc("artist_mark_connection_status", {
      p_connection_id: conn.id,
      p_status: "expired",
      p_error: msg,
    });
    await admin
      .from("artist_channels")
      .update({ auth_status: "expired" })
      .eq("id", conn.artist_channel_id);
  };

  for (const conn of connections ?? []) {
    const exp = conn.expires_at ? Date.parse(conn.expires_at) : null;
    const connectedAt = conn.connected_at ? Date.parse(conn.connected_at) : null;
    const isTikTok = conn.provider === "tiktok";

    if (exp === null) {
      results.push({
        connection_id: conn.id,
        provider: conn.provider,
        action: "ignorada",
        reason: "sem expires_at",
      });
      continue;
    }

    if (isTikTok) {
      if (exp - now >= TIKTOK_MARGIN_MS) {
        results.push({
          connection_id: conn.id,
          provider: "tiktok",
          action: "ignorada",
          hours_left: Math.round((exp - now) / HOUR),
        });
        continue;
      }
    } else {
      const daysLeft = (exp - now) / DAY;
      if (daysLeft >= 15) {
        results.push({
          connection_id: conn.id,
          provider: conn.provider,
          action: "ignorada",
          days_left: Math.round(daysLeft),
        });
        continue;
      }
      if (connectedAt !== null && now - connectedAt < DAY) {
        results.push({
          connection_id: conn.id,
          provider: conn.provider,
          action: "ignorada",
          reason: "token com menos de 24 h",
        });
        continue;
      }
    }

    try {
      const { data: tok, error: tErr } = await admin.rpc("artist_get_connection_token", {
        p_connection_id: conn.id,
        p_master_key: masterKey,
      });
      if (tErr) throw new Error(tErr.message);
      const t = Array.isArray(tok) ? tok[0] : tok;
      if (!t?.access_token) throw new Error("token não disponível");

      // ------------------------------------------------------------ TikTok
      if (isTikTok) {
        if (!t.refresh_token) {
          results.push({
            connection_id: conn.id,
            provider: "tiktok",
            action: "ignorada",
            reason: "sem refresh token — é preciso religar",
          });
          continue;
        }
        if (dryRun) {
          results.push({
            connection_id: conn.id,
            provider: "tiktok",
            action: "renovaria",
            hours_left: Math.round((exp - now) / HOUR),
          });
          continue;
        }

        const { creds, error: credErr } = tiktokCreds();
        if (credErr) throw new Error(credErr);

        const r = await ttRefresh(creds!, t.refresh_token);
        if (!r.ok) {
          if (r.invalid) {
            await expire(conn, r.error);
            results.push({
              connection_id: conn.id,
              provider: "tiktok",
              action: "expirada",
              error: r.error,
            });
            continue;
          }
          throw new Error(r.error);
        }

        const { error: upErr } = await admin.rpc("artist_upsert_channel_connection", {
          p_artist_channel_id: conn.artist_channel_id,
          p_company_id: conn.company_id,
          p_artist_id: conn.artist_id,
          p_provider: "tiktok",
          p_access_token: r.tokens.access_token,
          p_master_key: masterKey,
          p_external_account_id: conn.external_account_id ?? r.tokens.open_id ?? null,
          p_external_account_username: conn.external_account_username ?? null,
          p_external_page_id: null,
          p_external_page_name: null,
          p_token_type: conn.token_type ?? "tiktok_user",
          p_scopes: null,
          p_expires_at: r.tokens.expires_at,
          p_connected_by: null,
          p_refresh_token: r.tokens.refresh_token,
          p_refresh_expires_at: r.tokens.refresh_expires_at,
        });
        if (upErr) throw new Error(upErr.message);

        refreshed++;
        results.push({
          connection_id: conn.id,
          provider: "tiktok",
          action: "renovada",
          expires_at: r.tokens.expires_at,
          refresh_expires_at: r.tokens.refresh_expires_at,
        });
        continue;
      }

      // --------------------------------------------------------- Instagram
      if (dryRun) {
        results.push({
          connection_id: conn.id,
          provider: conn.provider,
          action: "renovaria",
          days_left: Math.round((exp - now) / DAY),
        });
        continue;
      }

      const res = await fetch(
        `${IG_GRAPH_ROOT}/refresh_access_token?` +
          new URLSearchParams({
            grant_type: "ig_refresh_token",
            access_token: t.access_token,
          }),
        { signal: AbortSignal.timeout(20_000) },
      );
      const rb = await res.json().catch(() => null);

      if (!res.ok || !rb?.access_token) {
        const code = rb?.error?.code;
        const msg = rb?.error?.message ?? `HTTP ${res.status}`;
        if (code === 190 || res.status === 400 || res.status === 401) {
          await expire(conn, msg);
          results.push({
            connection_id: conn.id,
            provider: conn.provider,
            action: "expirada",
            error: msg,
          });
          continue;
        }
        throw new Error(msg);
      }

      const expiresIn = Number(rb?.expires_in);
      const newExpires = Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(now + expiresIn * 1000).toISOString()
        : null;

      const { error: upErr } = await admin.rpc("artist_upsert_channel_connection", {
        p_artist_channel_id: conn.artist_channel_id,
        p_company_id: conn.company_id,
        p_artist_id: conn.artist_id,
        p_provider: "instagram",
        p_access_token: rb.access_token,
        p_master_key: masterKey,
        p_external_account_id: t.external_account_id ?? null,
        p_external_account_username: null,
        p_external_page_id: null,
        p_external_page_name: null,
        p_token_type: conn.token_type ?? "instagram_user",
        p_scopes: null,
        p_expires_at: newExpires,
        p_connected_by: null,
      });
      if (upErr) throw new Error(upErr.message);

      refreshed++;
      results.push({
        connection_id: conn.id,
        provider: conn.provider,
        action: "renovada",
        expires_at: newExpires,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ connection_id: conn.id, error: msg });
      results.push({ connection_id: conn.id, provider: conn.provider, action: "erro", error: msg });
    }
  }

  if (!dryRun && refreshed > 0) {
    await auditLog(admin, {
      entity_type: "artist_channel_connections",
      entity_id: body.connection_id ?? body.artist_id ?? "all",
      action: "artist_token_refresh",
      changed_by: caller.userId ?? "service_role",
      metadata: { refreshed, errors: errors.length },
    });
  }

  return json({
    ok: errors.length === 0,
    dry_run: dryRun,
    connections: connections?.length ?? 0,
    refreshed: dryRun ? 0 : refreshed,
    errors,
    results,
  });
});
