// artist-meta-oauth-start — inicia a ligação oficial do Instagram de um artista
// (Instagram API with Facebook Login). Só backend: devolve o URL de autorização.
//
// JWT obrigatório (verify_jwt = true). Papéis aceites: admin, platform_admin,
// manager, editor. service_role também é aceite (uso interno).
// Não altera nada do CRM.

import {
  adminClient,
  auditLog,
  authorize,
  callerCompanyIds,
  corsHeaders,
  isAllowedReturnUrl,
  json,
  redirectUri,
} from "../_shared/artist-meta.ts";

const SCOPES = [
  "instagram_basic",
  "instagram_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
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

  const appId = Deno.env.get("META_APP_ID");
  if (!appId) return json({ error: "META_APP_ID não configurado" }, 500);

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

  const { data: state, error: stErr } = await admin
    .from("artist_oauth_states")
    .insert({
      company_id: channel.company_id,
      user_id: caller.userId ?? "00000000-0000-0000-0000-000000000000",
      artist_channel_id: channel.id,
      provider: "meta",
      return_url: returnUrl,
    })
    .select("id, expires_at")
    .single();

  if (stErr) return json({ error: stErr.message }, 500);

  const authorizeUrl = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  authorizeUrl.searchParams.set("client_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri());
  authorizeUrl.searchParams.set("state", state.id);
  authorizeUrl.searchParams.set("scope", SCOPES.join(","));
  authorizeUrl.searchParams.set("response_type", "code");

  await auditLog(admin, {
    entity_type: "artist_channel",
    entity_id: channel.id,
    action: "instagram_oauth_start",
    changed_by: caller.userId ?? "service_role",
    company_id: channel.company_id,
    metadata: { handle: channel.handle, scopes: SCOPES },
  });

  return json({
    ok: true,
    authorize_url: authorizeUrl.toString(),
    state: state.id,
    expires_at: state.expires_at,
    redirect_uri: redirectUri(),
  });
});
