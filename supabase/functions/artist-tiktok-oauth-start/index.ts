// artist-tiktok-oauth-start — inicia a ligação OFICIAL do TikTok do artista
// (Display API + Login Kit). Só backend: devolve o URL de autorização.
//
// Credenciais próprias da carreira artística: TIKTOK_CLIENT_KEY /
// TIKTOK_CLIENT_SECRET. NUNCA toca em ad_platform_connections (D-ERP39).
//
// JWT obrigatório (verify_jwt = true). Papéis: admin, platform_admin, manager,
// editor. service_role também é aceite (uso interno).

import {
  adminClient,
  auditLog,
  authorize,
  callerCompanyIds,
  corsHeaders,
  isAllowedReturnUrl,
  json,
} from "../_shared/artist-meta.ts";
import {
  TT_AUTHORIZE,
  TT_SCOPES,
  tiktokCreds,
  tiktokRedirectUri,
} from "../_shared/artist-tiktok.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();
  const caller = await authorize(req, admin, [
    "admin",
    "platform_admin",
    "manager",
    "editor",
  ]);
  if (!caller.allowed) return json({ error: caller.reason ?? "not authorized" }, 403);

  let body: { artist_channel_id?: string; return_url?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "body inválido" }, 400);
  }

  const channelId = (body.artist_channel_id ?? "").trim();
  const returnUrl = (body.return_url ?? "").trim();
  if (!channelId) return json({ error: "artist_channel_id obrigatório" }, 400);
  if (!returnUrl || !isAllowedReturnUrl(returnUrl)) {
    return json({ error: "return_url não permitido" }, 400);
  }

  const { data: channel, error: chErr } = await admin
    .from("artist_channels")
    .select("id, company_id, artist_id, platform, handle")
    .eq("id", channelId)
    .maybeSingle();

  if (chErr) return json({ error: chErr.message }, 500);
  if (!channel) return json({ error: "canal não encontrado" }, 404);
  if (channel.platform !== "tiktok") {
    return json({ error: "o canal não é de TikTok" }, 400);
  }
  if (!channel.handle) {
    return json({ error: "o canal não tem handle definido" }, 400);
  }

  // Isolamento multi-empresa: o utilizador tem de pertencer à empresa do canal.
  if (!caller.isServiceRole) {
    const companies = await callerCompanyIds(admin, caller.userId!);
    if (companies !== "all" && !companies.includes(channel.company_id)) {
      return json({ error: "canal fora da empresa do utilizador" }, 403);
    }
  }

  // Credenciais verificadas depois das validações de entrada, para que um
  // return_url não permitido continue a devolver 400 mesmo sem app configurada.
  const { creds, error: credErr } = tiktokCreds();
  if (credErr) return json({ error: credErr }, 500);

  const { data: state, error: stErr } = await admin
    .from("artist_oauth_states")
    .insert({
      company_id: channel.company_id,
      user_id: caller.userId ?? "00000000-0000-0000-0000-000000000000",
      artist_channel_id: channel.id,
      provider: "tiktok",
      return_url: returnUrl,
    })
    .select("id, expires_at")
    .single();

  if (stErr) return json({ error: stErr.message }, 500);

  const authorizeUrl = new URL(TT_AUTHORIZE);
  authorizeUrl.searchParams.set("client_key", creds!.clientKey);
  authorizeUrl.searchParams.set("scope", TT_SCOPES.join(","));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("redirect_uri", tiktokRedirectUri());
  authorizeUrl.searchParams.set("state", state.id);

  await auditLog(admin, {
    entity_type: "artist_channel",
    entity_id: channel.id,
    action: "tiktok_oauth_start",
    changed_by: caller.userId ?? "service_role",
    company_id: channel.company_id,
    metadata: { handle: channel.handle, scopes: TT_SCOPES, provider: "tiktok" },
  });

  return json({
    ok: true,
    authorize_url: authorizeUrl.toString(),
    state: state.id,
    expires_at: state.expires_at,
    redirect_uri: tiktokRedirectUri(),
  });
});
