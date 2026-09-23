// artist-youtube-oauth-start — inicia a ligação OAuth Google ao canal de
// YouTube do artista (D-ERP134). Só a ligação; sem sync.
//
// Mesmo padrão de artist-ads-meta-oauth-start: state em crm.oauth_states
// (platform 'google', TTL 24h) com artist_id + return_url.
//
// JWT obrigatório (verify_jwt = true). Papéis: admin, platform_admin, manager,
// marketing_manager. service_role aceite.

import {
  adminClient,
  auditLog,
  authorize,
  corsHeaders,
  isAllowedReturnUrl,
  json,
} from "../_shared/artist-meta.ts";
import { ADS_ROLES, artistInCallerScope } from "../_shared/artist-ads.ts";

export const YT_SCOPES =
  "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly";

function ytRedirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/artist-youtube-oauth-callback`;
}

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

  const { data: channel } = await admin
    .from("artist_channels")
    .select("id, external_id")
    .eq("artist_id", artist.id)
    .eq("platform", "youtube")
    .limit(1)
    .maybeSingle();
  if (!channel) return json({ error: "artista sem canal youtube" }, 400);

  const clientId = Deno.env.get("GOOGLE_YT_OAUTH_CLIENT_ID");
  if (!clientId) return json({ error: "GOOGLE_YT_OAUTH_CLIENT_ID não configurado" }, 500);
  if (!Deno.env.get("GOOGLE_YT_OAUTH_CLIENT_SECRET")) {
    return json({ error: "GOOGLE_YT_OAUTH_CLIENT_SECRET não configurado" }, 500);
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: state, error: stErr } = await (admin as any)
    .schema("crm")
    .from("oauth_states")
    .insert({
      company_id: artist.company_id,
      user_id: caller.userId ?? null,
      platform: "google",
      artist_id: artist.id,
      return_url: returnUrl,
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();
  if (stErr) return json({ error: stErr.message }, 500);

  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", ytRedirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", YT_SCOPES);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state.id);

  await auditLog(admin, {
    entity_type: "artist",
    entity_id: artist.id,
    action: "artist_youtube_oauth_start",
    changed_by: caller.userId ?? "service_role",
    company_id: artist.company_id,
    metadata: { platform: "google", channel_id: channel.id, return_url: returnUrl },
  });

  return json({
    ok: true,
    authorize_url: u.toString(),
    state: state.id,
    expires_at: state.expires_at,
    redirect_uri: ytRedirectUri(),
  });
});
