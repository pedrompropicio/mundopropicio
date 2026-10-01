// artist-youtube-oauth-callback — retorno do OAuth Google do canal de YouTube
// do artista (D-ERP134). Valida state (crm.consume_oauth_state apaga-o),
// troca o code, exige refresh_token, valida a posse do canal (Analytics ids=channel==<external_id> tem de dar 200; D-ERP134 01/10, sem youtube.readonly)
// e grava tokens cifrados.
//
// Endpoint público (redirect do browser): verify_jwt = false.
// Nunca põe tokens em URL, logs ou auditLog.

import { adminClient, auditLog, isAllowedReturnUrl } from "../_shared/artist-meta.ts";
import { ytRedirectUri } from "../_shared/artist-youtube.ts";
import { invokeInternal } from "../_shared/internal-call.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALLBACK_RETURN = "https://gestao-artistica.lovable.app";

function back(returnUrl: string | null, params: Record<string, string>): Response {
  let url: URL;
  try {
    url = new URL(returnUrl && isAllowedReturnUrl(returnUrl) ? returnUrl : FALLBACK_RETURN);
  } catch (_e) {
    url = new URL(FALLBACK_RETURN);
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

const fail = (returnUrl: string | null, motivo: string) =>
  back(returnUrl, { youtube: "erro", motivo });

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!state || !UUID_RE.test(state)) return fail(null, "state inválido");

  const admin = adminClient();
  const { data: rows, error: stErr } = await admin.rpc("crm_consume_oauth_state", {
    p_state_id: state,
  });
  const st = Array.isArray(rows) ? rows[0] : null;
  if (stErr || !st?.valid) return fail(null, "state inválido ou expirado");
  const returnUrl: string | null = st.return_url ?? null;
  if (st.platform !== "google") return fail(returnUrl, "plataforma do state não é google");
  if (!st.artist_id) return fail(returnUrl, "state sem artista");

  if (url.searchParams.get("error")) return fail(returnUrl, "autorização recusada");
  if (!code) return fail(returnUrl, "code ausente");

  const clientId = Deno.env.get("GOOGLE_YT_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_YT_OAUTH_CLIENT_SECRET");
  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!clientId || !clientSecret) return fail(returnUrl, "cliente OAuth Google não configurado");
  if (!masterKey) return fail(returnUrl, "ENCRYPTION_MASTER_KEY não configurada");

  const { data: channel } = await admin
    .from("artist_channels")
    .select("id, company_id, artist_id, external_id")
    .eq("artist_id", st.artist_id)
    .eq("platform", "youtube")
    .limit(1)
    .maybeSingle();
  if (!channel) return fail(returnUrl, "artista sem canal youtube");
  if (!channel.external_id) return fail(returnUrl, "canal youtube sem external_id");

  // 1) code → tokens
  let tok: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: ytRedirectUri(),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    tok = await res.json().catch(() => ({}));
    if (!res.ok || !tok.access_token) {
      console.error("[artist-youtube-callback] token exchange HTTP", res.status);
      return fail(returnUrl, `troca do code falhou (HTTP ${res.status})`);
    }
  } catch (_e) {
    return fail(returnUrl, "troca do code falhou");
  }
  if (!tok.refresh_token) {
    return fail(returnUrl, "o Google não devolveu refresh_token; repetir com consentimento");
  }

  // 2) posse do canal — D-ERP134 (01/10): sem youtube.readonly. O Analytics só
  // responde 200 a ids=channel==<external_id> se a conta autorizada for dona.
  let ownerStatus = 0;
  try {
    const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const q = new URLSearchParams({
      ids: `channel==${channel.external_id}`, startDate: day, endDate: day, metrics: "views",
    });
    const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${q}`, {
      headers: { Authorization: `Bearer ${tok.access_token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    ownerStatus = res.status;
    await res.text();
  } catch (_e) {
    return fail(returnUrl, "verificação de posse do canal falhou");
  }
  if (ownerStatus !== 200) {
    await auditLog(admin, {
      entity_type: "artist_channel",
      entity_id: channel.id,
      action: "youtube_oauth_not_owner",
      changed_by: st.user_id ?? "service_role",
      company_id: channel.company_id,
      metadata: { expected: channel.external_id, analytics_status: ownerStatus },
    });
    return fail(returnUrl, ownerStatus === 401 || ownerStatus === 403
      ? "esta conta Google não é dona do canal"
      : `verificação de posse falhou (HTTP ${ownerStatus})`);
  }
  // título do canal pela chave de API pública (best-effort)
  let title: string | null = null;
  const pubKey = Deno.env.get("YOUTUBE_PUBLIC_API_KEY");
  if (pubKey) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?${new URLSearchParams({ id: channel.external_id, part: "snippet", key: pubKey })}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) },
      );
      const j = await res.json().catch(() => null);
      title = j?.items?.[0]?.snippet?.title ?? null;
    } catch (_e) { /* título é opcional */ }
  }
  const match = { id: String(channel.external_id), title };

  // 3) gravar (tokens cifrados com a mesma chave mestra)
  const expiresAt = new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString();
  const scopes = (tok.scope ?? "").split(" ").map((s) => s.trim()).filter(Boolean);
  const { data: connectionId, error: upErr } = await admin.rpc(
    "artist_upsert_channel_connection",
    {
      p_artist_channel_id: channel.id,
      p_company_id: channel.company_id,
      p_artist_id: channel.artist_id,
      p_provider: "google",
      p_access_token: tok.access_token,
      p_master_key: masterKey,
      p_external_account_id: match.id,
      p_external_account_username: match.title,
      p_external_page_id: null,
      p_external_page_name: null,
      p_token_type: "Bearer",
      p_scopes: scopes,
      p_expires_at: expiresAt,
      p_connected_by: st.user_id ?? null,
      p_refresh_token: tok.refresh_token,
      p_refresh_expires_at: null,
    },
  );
  if (upErr) {
    console.error("[artist-youtube-callback] upsert falhou:", upErr.message);
    return fail(returnUrl, "gravação falhou");
  }

  await admin.from("artist_channels").update({ auth_status: "authorized" }).eq("id", channel.id);

  await auditLog(admin, {
    entity_type: "artist_channel",
    entity_id: channel.id,
    action: "youtube_oauth_connected",
    changed_by: st.user_id ?? "service_role",
    company_id: channel.company_id,
    metadata: {
      connection_id: connectionId,
      provider: "google",
      youtube_channel_id: match.id,
      scopes,
      expires_at: expiresAt,
    },
  });

  // Primeira recolha logo após ligar (best-effort, não bloqueia o redirect).
  const firstSync = invokeInternal("artist-youtube-sync", { artist_id: channel.artist_id, dry_run: false })
    .then((r) => { if (!r.ok) console.error("[artist-youtube-callback] sync inicial falhou:", r.status); })
    .catch((e) => console.error("[artist-youtube-callback] sync inicial falhou:", (e as Error)?.message));
  // @ts-ignore EdgeRuntime
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(firstSync);

  return back(returnUrl, { youtube: "ok" });
});
