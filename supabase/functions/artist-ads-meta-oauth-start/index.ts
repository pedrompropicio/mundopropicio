// artist-ads-meta-oauth-start — inicia a ligação à conta de ANÚNCIOS do próprio
// artista (Meta Ads do Business Manager do artista). D-ERP57.
//
// Mesmo padrão do Instagram directo: o backend devolve o authorize_url, que é
// aberto pelo próprio artista. Usa o MESMO app Meta e os MESMOS scopes da
// ligação Meta do CRM. O state fica em crm.oauth_states (TTL 24h) com
// artist_id + return_url.
//
// JWT obrigatório (verify_jwt = true). Papéis: admin, platform_admin, manager,
// marketing_manager. service_role aceite (uso interno).

import {
  adminClient,
  auditLog,
  authorize,
  corsHeaders,
  isAllowedReturnUrl,
  json,
} from "../_shared/artist-meta.ts";
import {
  ADS_ROLES,
  adsCallbackUri,
  artistInCallerScope,
  META_ADS_SCOPES,
  META_DIALOG_VERSION,
} from "../_shared/artist-ads.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = adminClient();
  const caller = await authorize(req, admin, ADS_ROLES);
  if (!caller.allowed) return json({ error: caller.reason ?? "not authorized" }, 403);

  let body: { artist_id?: string; return_url?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "body inválido" }, 400);
  }

  const artistId = (body.artist_id ?? "").trim();
  const returnUrl = (body.return_url ?? "").trim();
  if (!artistId) return json({ error: "artist_id obrigatório" }, 400);
  if (!returnUrl || !isAllowedReturnUrl(returnUrl)) {
    return json({ error: "return_url não permitido" }, 400);
  }

  const scope = await artistInCallerScope(admin, artistId, caller);
  if (!scope.ok) return json({ error: scope.error }, scope.status);
  const artist = scope.artist;

  const appId = Deno.env.get("META_APP_ID");
  if (!appId) return json({ error: "META_APP_ID não configurado" }, 500);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: state, error: stErr } = await (admin as any)
    .schema("crm")
    .from("oauth_states")
    .insert({
      company_id: artist.company_id,
      user_id: caller.userId ?? null,
      platform: "meta",
      artist_id: artist.id,
      return_url: returnUrl,
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();

  if (stErr) return json({ error: stErr.message }, 500);

  const authorizeUrl = new URL(
    `https://www.facebook.com/${META_DIALOG_VERSION}/dialog/oauth`,
  );
  authorizeUrl.searchParams.set("client_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", adsCallbackUri());
  authorizeUrl.searchParams.set("state", state.id);
  authorizeUrl.searchParams.set("scope", META_ADS_SCOPES);
  authorizeUrl.searchParams.set("auth_type", "rerequest");
  authorizeUrl.searchParams.set("response_type", "code");

  await auditLog(admin, {
    entity_type: "artist",
    entity_id: artist.id,
    action: "artist_ads_meta_oauth_start",
    changed_by: caller.userId ?? "service_role",
    company_id: artist.company_id,
    metadata: { platform: "meta", scopes: META_ADS_SCOPES, return_url: returnUrl },
  });

  return json({
    ok: true,
    authorize_url: authorizeUrl.toString(),
    state: state.id,
    expires_at: state.expires_at,
    redirect_uri: adsCallbackUri(),
  });
});
