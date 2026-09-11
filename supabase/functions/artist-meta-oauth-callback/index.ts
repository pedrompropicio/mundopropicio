// artist-meta-oauth-callback — recebe o retorno do Facebook Login, escolhe a
// Página cuja conta de Instagram corresponde ao handle do canal, cifra o token
// da Página e marca o canal como autorizado.
//
// Sem JWT (verify_jwt = false): a autorização é o state de uso único.
// Nunca devolve nem registra tokens.

import {
  adminClient,
  auditLog,
  corsHeaders,
  GRAPH,
  graphGet,
  isAllowedReturnUrl,
  json,
  redirectUri,
} from "../_shared/artist-meta.ts";

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

  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!appId || !appSecret || !masterKey) return fail("segredos não configurados");

  const { data: channel } = await admin
    .from("artist_channels")
    .select("id, company_id, artist_id, platform, handle")
    .eq("id", st.artist_channel_id)
    .maybeSingle();
  if (!channel || channel.platform !== "instagram") return fail("canal inválido");
  if (!channel.handle) return fail("canal sem handle");

  // 1) code → token de curta duração
  const shortRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri(),
        code,
      }),
    { signal: AbortSignal.timeout(20_000) },
  );
  const shortBody = await shortRes.json().catch(() => null);
  if (!shortRes.ok || !shortBody?.access_token) {
    return fail(shortBody?.error?.message ?? "troca de code falhou");
  }

  // 2) token de curta duração → token de utilizador de longa duração
  const longRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortBody.access_token,
      }),
    { signal: AbortSignal.timeout(20_000) },
  );
  const longBody = await longRes.json().catch(() => null);
  const userToken: string = longBody?.access_token ?? shortBody.access_token;
  const expiresIn = Number(longBody?.expires_in);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  // 3) Páginas do utilizador + conta de Instagram ligada
  const accounts = await graphGet(
    "me/accounts",
    {
      fields: "id,name,access_token,instagram_business_account{id,username}",
      limit: "100",
    },
    userToken,
  );
  if (!accounts.ok) {
    return fail(accounts.body?.error?.message ?? "leitura de páginas falhou");
  }

  const wanted = channel.handle.replace(/^@/, "").trim().toLowerCase();
  const pages = (accounts.body?.data ?? []) as Array<{
    id: string;
    name?: string;
    access_token?: string;
    instagram_business_account?: { id: string; username?: string };
  }>;

  const match = pages.find(
    (p) =>
      (p.instagram_business_account?.username ?? "").trim().toLowerCase() === wanted,
  );
  if (!match || !match.access_token || !match.instagram_business_account) {
    return fail(`nenhuma Página ligada à conta @${wanted}`);
  }

  // 4) Guardar ligação com o token da Página cifrado
  const { data: connectionId, error: upErr } = await admin.rpc(
    "artist_upsert_channel_connection",
    {
      p_artist_channel_id: channel.id,
      p_company_id: channel.company_id,
      p_artist_id: channel.artist_id,
      p_provider: "meta",
      p_access_token: match.access_token,
      p_master_key: masterKey,
      p_external_account_id: match.instagram_business_account.id,
      p_external_account_username: match.instagram_business_account.username ?? null,
      p_external_page_id: match.id,
      p_external_page_name: match.name ?? null,
      p_token_type: "page",
      p_scopes: [
        "instagram_basic",
        "instagram_manage_insights",
        "pages_show_list",
        "pages_read_engagement",
      ],
      p_expires_at: expiresAt,
      p_connected_by: st.user_id,
    },
  );
  if (upErr) return fail(upErr.message);

  await admin
    .from("artist_channels")
    .update({
      auth_status: "authorized",
      external_id: match.instagram_business_account.id,
      account_type: "business",
    })
    .eq("id", channel.id);

  await auditLog(admin, {
    entity_type: "artist_channel",
    entity_id: channel.id,
    action: "instagram_oauth_connected",
    changed_by: st.user_id,
    company_id: channel.company_id,
    metadata: {
      connection_id: connectionId,
      instagram_user_id: match.instagram_business_account.id,
      instagram_username: match.instagram_business_account.username ?? null,
      page_id: match.id,
      page_name: match.name ?? null,
      pages_found: pages.length,
    },
  });

  return returnUrl
    ? back(returnUrl, { connection: "ok", channel: channel.id })
    : json({ ok: true, channel_id: channel.id });
});
