// artist-meta-oauth-callback — D-ERP187. Retorno do Facebook Login (app
// "MP Carreira Artistas", CARREIRA_META_APP_*). Escolhe a Página cujo
// instagram_business_account é o IG da ligação instagram do artista e grava a
// ligação provider 'meta' no canal FACEBOOK. A ligação instagram não é tocada.
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

  const appId = (Deno.env.get("CARREIRA_META_APP_ID") ?? "").trim();
  const appSecret = (Deno.env.get("CARREIRA_META_APP_SECRET") ?? "").trim();
  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!appId || !appSecret) return fail("faltam CARREIRA_META_APP_ID/CARREIRA_META_APP_SECRET");
  if (!masterKey) return fail("ENCRYPTION_MASTER_KEY não configurada");

  const { data: channel } = await admin
    .from("artist_channels")
    .select("id, company_id, artist_id, platform, handle")
    .eq("id", st.artist_channel_id)
    .maybeSingle();
  if (!channel || channel.platform !== "facebook") return fail("canal inválido (tem de ser o canal facebook)");

  // IG do artista = external_account_id da ligação instagram dele.
  const { data: igConn } = await admin
    .from("artist_channel_connections")
    .select("external_account_id")
    .eq("artist_id", channel.artist_id)
    .eq("provider", "instagram")
    .not("external_account_id", "is", null)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const wantedIg = igConn?.external_account_id ? String(igConn.external_account_id) : null;
  if (!wantedIg) return fail("artista sem ligação instagram (IG desconhecido)");

  // 1) code → token curto
  const shortRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri(), code }),
    { signal: AbortSignal.timeout(20_000) },
  );
  const shortBody = await shortRes.json().catch(() => null);
  if (!shortRes.ok || !shortBody?.access_token) {
    return fail(shortBody?.error?.message ?? "troca de code falhou");
  }

  // 2) token curto → token de utilizador de longa duração
  const longRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret,
        fb_exchange_token: shortBody.access_token,
      }),
    { signal: AbortSignal.timeout(20_000) },
  );
  const longBody = await longRes.json().catch(() => null);
  const userToken: string = longBody?.access_token ?? shortBody.access_token;
  const expiresIn = Number(longBody?.expires_in);
  const userExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;

  // 3) Páginas + IG ligado
  const accounts = await graphGet(
    "me/accounts",
    { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" },
    userToken,
  );
  if (!accounts.ok) return fail(accounts.body?.error?.message ?? "leitura de páginas falhou");
  const pages = (accounts.body?.data ?? []) as Array<{
    id: string; name?: string; access_token?: string;
    instagram_business_account?: { id: string; username?: string };
  }>;
  const match = pages.find((p) => String(p.instagram_business_account?.id ?? "") === wantedIg);

  const scopes = ["instagram_basic", "instagram_manage_insights", "pages_read_engagement", "pages_show_list"];

  if (!match || !match.access_token) {
    // Sem correspondência: grava a ligação com status 'error' e o motivo.
    const motivo = `nenhuma Página com instagram_business_account = ${wantedIg} (${pages.length} páginas)`;
    const { data: cid, error: e1 } = await admin.rpc("artist_upsert_channel_connection", {
      p_artist_channel_id: channel.id, p_company_id: channel.company_id, p_artist_id: channel.artist_id,
      p_provider: "meta", p_access_token: userToken, p_master_key: masterKey,
      p_external_account_id: wantedIg, p_token_type: "user", p_scopes: scopes,
      p_expires_at: userExpiresAt, p_connected_by: st.user_id,
    });
    if (!e1 && cid) {
      await admin.from("artist_channel_connections")
        .update({ status: "error", last_error: motivo }).eq("id", cid);
    }
    await auditLog(admin, {
      entity_type: "artist_channel", entity_id: channel.id, action: "meta_channel_oauth_error",
      changed_by: st.user_id, company_id: channel.company_id,
      metadata: { connection_id: cid ?? null, motivo, pages_found: pages.length },
    });
    return fail(motivo);
  }

  // 4) Guardar ligação 'meta' (token da Página cifrado; não expira)
  const { data: connectionId, error: upErr } = await admin.rpc("artist_upsert_channel_connection", {
    p_artist_channel_id: channel.id, p_company_id: channel.company_id, p_artist_id: channel.artist_id,
    p_provider: "meta", p_access_token: match.access_token, p_master_key: masterKey,
    p_external_account_id: wantedIg,
    p_external_account_username: match.instagram_business_account?.username ?? null,
    p_external_page_id: match.id, p_external_page_name: match.name ?? null,
    p_token_type: "page", p_scopes: scopes, p_expires_at: null, p_connected_by: st.user_id,
  });
  if (upErr) return fail(upErr.message);

  await admin.from("artist_channels")
    .update({ auth_status: "authorized", external_id: match.id })
    .eq("id", channel.id);

  await auditLog(admin, {
    entity_type: "artist_channel", entity_id: channel.id, action: "meta_channel_oauth_connected",
    changed_by: st.user_id, company_id: channel.company_id,
    metadata: {
      connection_id: connectionId, instagram_user_id: wantedIg,
      page_id: match.id, page_name: match.name ?? null, pages_found: pages.length,
    },
  });

  return returnUrl
    ? back(returnUrl, { connection: "ok", channel: channel.id })
    : json({ ok: true, channel_id: channel.id });
});
