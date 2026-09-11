// artist-instagram-oauth-callback — retorno da ligação DIRECTA pelo Instagram
// (Instagram API with Instagram Login). Troca o code por token de utilizador de
// longa duração (~60 dias), confirma que a conta autorizada é a do canal e
// guarda o token cifrado.
//
// Sem JWT (verify_jwt = false): a autorização é o state de uso único.
// Nunca devolve, registra ou coloca tokens em URLs.
// Credenciais: INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET (nunca META_APP_*).

import {
  adminClient,
  auditLog,
  corsHeaders,
  graphGet,
  IG_GRAPH,
  IG_GRAPH_ROOT,
  IG_OAUTH_TOKEN,
  igRedirectUri,
  isAllowedReturnUrl,
  json,
} from "../_shared/artist-meta.ts";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
];

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

  const appId = Deno.env.get("INSTAGRAM_APP_ID");
  const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET");
  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!appId) return fail("INSTAGRAM_APP_ID não configurado");
  if (!appSecret) return fail("INSTAGRAM_APP_SECRET não configurado");
  if (!masterKey) return fail("ENCRYPTION_MASTER_KEY não configurada");

  const { data: channel } = await admin
    .from("artist_channels")
    .select("id, company_id, artist_id, platform, handle")
    .eq("id", st.artist_channel_id)
    .maybeSingle();
  if (!channel || channel.platform !== "instagram") return fail("canal inválido");
  if (!channel.handle) return fail("canal sem handle");

  // 1) code → token de curta duração (form-encoded)
  const shortRes = await fetch(IG_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: igRedirectUri(),
      code,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const shortBody = await shortRes.json().catch(() => null);
  if (!shortRes.ok || !shortBody?.access_token) {
    return fail(shortBody?.error_message ?? shortBody?.error?.message ?? "troca de code falhou");
  }

  // 2) curta → longa duração (~60 dias)
  const longRes = await fetch(
    `${IG_GRAPH_ROOT}/access_token?` +
      new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: appSecret,
        access_token: shortBody.access_token,
      }),
    { signal: AbortSignal.timeout(20_000) },
  );
  const longBody = await longRes.json().catch(() => null);
  if (!longRes.ok || !longBody?.access_token) {
    return fail(longBody?.error?.message ?? "troca por token de longa duração falhou");
  }
  const token: string = longBody.access_token;
  const expiresIn = Number(longBody?.expires_in);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  // 3) confirmar a conta autorizada
  const me = await graphGet("me", { fields: "user_id,username,account_type" }, token, IG_GRAPH);
  if (!me.ok) return fail(me.body?.error?.message ?? "leitura da conta falhou");

  const wanted = channel.handle.replace(/^@/, "").trim().toLowerCase();
  const got = String(me.body?.username ?? "").replace(/^@/, "").trim().toLowerCase();
  if (!got || got !== wanted) return fail("conta_diferente");

  const igUserId = String(me.body?.user_id ?? "");
  if (!igUserId) return fail("conta sem user_id");

  const rawType = String(me.body?.account_type ?? "").toLowerCase();
  const accountType = rawType === "business" || rawType === "creator" ? rawType : null;

  // 4) guardar ligação com token cifrado
  const { data: connectionId, error: upErr } = await admin.rpc(
    "artist_upsert_channel_connection",
    {
      p_artist_channel_id: channel.id,
      p_company_id: channel.company_id,
      p_artist_id: channel.artist_id,
      p_provider: "instagram",
      p_access_token: token,
      p_master_key: masterKey,
      p_external_account_id: igUserId,
      p_external_account_username: got,
      p_external_page_id: null,
      p_external_page_name: null,
      p_token_type: "instagram_user",
      p_scopes: SCOPES,
      p_expires_at: expiresAt,
      p_connected_by: st.user_id,
    },
  );
  if (upErr) return fail(upErr.message);

  await admin
    .from("artist_channels")
    .update({
      auth_status: "authorized",
      external_id: igUserId,
      ...(accountType ? { account_type: accountType } : {}),
    })
    .eq("id", channel.id);

  await auditLog(admin, {
    entity_type: "artist_channel",
    entity_id: channel.id,
    action: "instagram_direct_oauth_connected",
    changed_by: st.user_id,
    company_id: channel.company_id,
    metadata: {
      connection_id: connectionId,
      provider: "instagram",
      instagram_user_id: igUserId,
      instagram_username: got,
      account_type: accountType,
      expires_at: expiresAt,
    },
  });

  return returnUrl
    ? back(returnUrl, { connection: "ok", channel: channel.id })
    : json({ ok: true, channel_id: channel.id });
});
