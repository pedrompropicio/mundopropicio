// artist-tiktok-oauth-callback — retorno da ligação OFICIAL do TikTok
// (Display API + Login Kit). Troca o code por access_token (24 h) +
// refresh_token (365 d), confirma que a conta autorizada é a do canal e guarda
// os tokens cifrados.
//
// Sem JWT (verify_jwt = false): a autorização é o state de uso único.
// Nunca devolve, registra ou coloca tokens em URLs.

import {
  adminClient,
  auditLog,
  corsHeaders,
  isAllowedReturnUrl,
  json,
  toCount,
} from "../_shared/artist-meta.ts";
import {
  normalizeHandle,
  TT_SCOPES,
  tiktokCreds,
  ttExchangeCode,
  ttUserInfo,
  ttErrorText,
} from "../_shared/artist-tiktok.ts";

const PLATFORM = "tiktok";
const SOURCE = "platform_api";

function back(returnUrl: string, params: Record<string, string>) {
  const u = new URL(returnUrl);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateId = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") ??
    url.searchParams.get("error");

  if (!stateId) return json({ error: "state ausente" }, 400);

  const admin = adminClient();

  const { data: consumed, error: consErr } = await admin.rpc(
    "artist_consume_oauth_state",
    { p_state_id: stateId },
  );
  if (consErr) return json({ error: consErr.message }, 500);

  const st = Array.isArray(consumed) ? consumed[0] : consumed;
  if (!st?.valid) return json({ error: "state inválido ou expirado" }, 400);

  const returnUrl = isAllowedReturnUrl(st.return_url) ? st.return_url : null;
  const fail = (reason: string) =>
    returnUrl
      ? back(returnUrl, { connection: "error", reason })
      : json({ error: reason }, 400);

  if (oauthError || !code) return fail(oauthError ?? "code ausente");

  const { creds, error: credErr } = tiktokCreds();
  if (credErr) return fail(credErr);
  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKey) return fail("ENCRYPTION_MASTER_KEY não configurada");

  const { data: channel } = await admin
    .from("artist_channels")
    .select("id, company_id, artist_id, platform, handle")
    .eq("id", st.artist_channel_id)
    .maybeSingle();
  if (!channel || channel.platform !== PLATFORM) return fail("canal inválido");
  if (!channel.handle) return fail("canal sem handle");

  // 1) code → tokens
  const ex = await ttExchangeCode(creds!, code);
  if (!ex.ok) return fail(ex.error);
  const tokens = ex.tokens;

  // 2) confirmar a conta autorizada
  const me = await ttUserInfo(tokens.access_token);
  if (!me.ok) return fail(ttErrorText(me.body, me.status));

  const wanted = normalizeHandle(channel.handle);
  const got = normalizeHandle(me.user?.username);
  if (!got || got !== wanted) return fail("conta_diferente");

  const openId = String(me.user?.open_id ?? tokens.open_id ?? "");
  if (!openId) return fail("conta sem open_id");

  // 3) guardar ligação com tokens cifrados
  const { data: connectionId, error: upErr } = await admin.rpc(
    "artist_upsert_channel_connection",
    {
      p_artist_channel_id: channel.id,
      p_company_id: channel.company_id,
      p_artist_id: channel.artist_id,
      p_provider: PLATFORM,
      p_access_token: tokens.access_token,
      p_master_key: masterKey,
      p_external_account_id: openId,
      p_external_account_username: got,
      p_external_page_id: null,
      p_external_page_name: null,
      p_token_type: "tiktok_user",
      p_scopes: tokens.scope ? tokens.scope.split(",").map((s) => s.trim()) : TT_SCOPES,
      p_expires_at: tokens.expires_at,
      p_connected_by: st.user_id,
      p_refresh_token: tokens.refresh_token,
      p_refresh_expires_at: tokens.refresh_expires_at,
    },
  );
  if (upErr) return fail(upErr.message);

  await admin
    .from("artist_channels")
    .update({ auth_status: "authorized", external_id: openId })
    .eq("id", channel.id);

  // 4) métricas do dia (nunca inventa: métrica ausente não é gravada)
  const today = new Date().toISOString().slice(0, 10);
  const metricRows: Array<Record<string, unknown>> = [];
  for (const [field, metric] of [
    ["follower_count", "followers"],
    ["following_count", "following"],
    ["likes_count", "likes"],
    ["video_count", "video_count"],
  ] as const) {
    const v = toCount(me.user?.[field]);
    if (v === null) continue;
    metricRows.push({
      company_id: channel.company_id,
      artist_id: channel.artist_id,
      channel_id: channel.id,
      platform: PLATFORM,
      metric,
      metric_date: today,
      value: v,
      source: SOURCE,
      source_ref: openId,
    });
  }
  let metricsWritten = 0;
  if (metricRows.length) {
    const { error: mErr } = await admin
      .from("artist_metrics_daily")
      .upsert(metricRows, { onConflict: "artist_id,platform,metric,metric_date,source" });
    if (mErr) console.error("artist_metrics_daily:", mErr.message);
    else metricsWritten = metricRows.length;
  }

  await auditLog(admin, {
    entity_type: "artist_channel",
    entity_id: channel.id,
    action: "tiktok_oauth_connected",
    changed_by: st.user_id,
    company_id: channel.company_id,
    metadata: {
      connection_id: connectionId,
      provider: PLATFORM,
      tiktok_open_id: openId,
      tiktok_username: got,
      expires_at: tokens.expires_at,
      refresh_expires_at: tokens.refresh_expires_at,
      metrics_written: metricsWritten,
    },
  });

  return returnUrl
    ? back(returnUrl, { connection: "ok", channel: channel.id })
    : json({ ok: true, channel_id: channel.id });
});
