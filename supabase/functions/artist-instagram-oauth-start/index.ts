// artist-instagram-oauth-start — inicia a ligação DIRECTA do Instagram do
// artista (Instagram API with Instagram Login). Só backend: devolve o URL de
// autorização.
//
// Credenciais próprias da carreira artística: INSTAGRAM_APP_ID /
// INSTAGRAM_APP_SECRET. NUNCA usa META_APP_* nem ad_platform_connections
// (D-ERP39: captação de dados dos artistas ≠ gestão de tráfego).
//
// JWT obrigatório (verify_jwt = true). Papéis: admin, platform_admin, manager,
// editor. service_role também é aceite (uso interno).

import {
  adminClient,
  auditLog,
  authorize,
  callerCompanyIds,
  corsHeaders,
  IG_OAUTH_AUTHORIZE,
  igRedirectUri,
  isAllowedReturnUrl,
  json,
} from "../_shared/artist-meta.ts";

/** Scopes SÓ DE LEITURA. Nunca publicar, nunca mensagens, nunca anúncios. */
const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_insights",
];

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
  if (channel.platform !== "instagram") {
    return json({ error: "o canal não é de Instagram" }, 400);
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

  // Segredo verificado depois das validações de entrada, para que um
  // return_url não permitido continue a devolver 400 mesmo sem app configurada.
  const appId = Deno.env.get("INSTAGRAM_APP_ID");
  if (!appId) return json({ error: "INSTAGRAM_APP_ID não configurado" }, 500);

  const { data: state, error: stErr } = await admin
    .from("artist_oauth_states")
    .insert({
      company_id: channel.company_id,
      user_id: caller.userId ?? "00000000-0000-0000-0000-000000000000",
      artist_channel_id: channel.id,
      provider: "instagram",
      return_url: returnUrl,
    })
    .select("id, expires_at")
    .single();

  if (stErr) return json({ error: stErr.message }, 500);

  const authorizeUrl = new URL(IG_OAUTH_AUTHORIZE);
  authorizeUrl.searchParams.set("client_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", igRedirectUri());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", SCOPES.join(","));
  authorizeUrl.searchParams.set("state", state.id);

  await auditLog(admin, {
    entity_type: "artist_channel",
    entity_id: channel.id,
    action: "instagram_direct_oauth_start",
    changed_by: caller.userId ?? "service_role",
    company_id: channel.company_id,
    metadata: { handle: channel.handle, scopes: SCOPES, provider: "instagram" },
  });

  return json({
    ok: true,
    authorize_url: authorizeUrl.toString(),
    state: state.id,
    expires_at: state.expires_at,
    redirect_uri: igRedirectUri(),
  });
});
