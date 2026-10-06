// crm-tiktok-oauth-start — D-ERP177. Inicia o OAuth de produção da TikTok
// Marketing API para UMA ligação existente de crm.ad_platform_connections
// (empresa ou artista). Um só redirect; o state diz qual ligação.
//
// verify_jwt = true. Papéis: ADS_ROLES (os mesmos da ligação de tráfego Meta).
// Nunca devolve nem regista segredos.

import { adminClient, authorize, callerCompanyIds, corsHeaders, json } from "../_shared/artist-meta.ts";
import { ADS_ROLES } from "../_shared/artist-ads.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "sessão em falta" }, 401);

  const admin = adminClient();
  const caller = await authorize(req, admin, ADS_ROLES);
  if (!caller.allowed) return json({ error: caller.reason ?? "not authorized" }, 403);

  const appId = (Deno.env.get("TIKTOK_BUSINESS_APP_ID") ?? "").trim();
  if (!appId) return json({ error: "secret TIKTOK_BUSINESS_APP_ID em falta" }, 500);

  let body: { connection_id?: string };
  try { body = await req.json(); } catch { return json({ error: "body inválido" }, 400); }
  const connectionId = String(body?.connection_id ?? "").trim();
  if (!UUID_RE.test(connectionId)) return json({ error: "connection_id inválido" }, 400);

  const { data: conn, error } = await (admin as any).schema("crm").from("ad_platform_connections")
    .select("id, company_id, platform").eq("id", connectionId).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!conn) return json({ error: "ligação não encontrada" }, 404);
  if (conn.platform !== "tiktok") return json({ error: "a ligação não é TikTok" }, 400);

  if (!caller.isServiceRole) {
    const companies = await callerCompanyIds(admin, caller.userId!);
    if (companies !== "all" && !companies.includes(conn.company_id)) {
      return json({ error: "ligação fora da empresa do utilizador" }, 403);
    }
  }

  const { data: st, error: stErr } = await (admin as any).schema("crm").from("oauth_states").insert({
    company_id: conn.company_id,
    user_id: caller.userId ?? null,
    platform: "tiktok",
    connection_id: conn.id,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }).select("id, expires_at").single();
  if (stErr) return json({ error: stErr.message }, 500);

  const callback = `${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-tiktok-oauth-callback`;
  const authorize_url =
    `https://business-api.tiktok.com/portal/auth?app_id=${encodeURIComponent(appId)}&state=${st.id}&redirect_uri=${encodeURIComponent(callback)}`;
  return json({ ok: true, authorize_url, expires_at: st.expires_at });
});
