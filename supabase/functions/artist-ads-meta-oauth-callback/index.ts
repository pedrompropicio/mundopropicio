// artist-ads-meta-oauth-callback — retorno do Facebook Login da ligação à conta
// de ANÚNCIOS do próprio artista (D-ERP57).
//
// Fluxo: consome o state (crm.consume_oauth_state) → troca code por token de
// longa duração (igual ao CRM) → lista as contas de anúncios acessíveis →
// grava crm.ad_platform_connections com connection_scope='artist' e token
// cifrado pelo mesmo mecanismo do CRM → audit log → redirect ao return_url.
//
// Endpoint público (redirect do browser): verify_jwt = false.

import { adminClient, auditLog } from "../_shared/artist-meta.ts";
import { META_GRAPH_VERSION, adsCallbackUri } from "../_shared/artist-ads.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const FALLBACK_RETURN = "https://gestao-artistica.lovable.app";

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function back(returnUrl: string | null, params: Record<string, string>): Response {
  let url: URL;
  try {
    url = new URL(returnUrl || FALLBACK_RETURN);
  } catch (_e) {
    url = new URL(FALLBACK_RETURN);
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return redirect(url.toString());
}

function fail(returnUrl: string | null, reason: string): Response {
  return back(returnUrl, {
    connection: "error",
    scope: "ads",
    platform: "meta",
    reason,
  });
}

interface AdAccount {
  id?: string;
  name?: string;
  currency?: string;
  account_status?: number;
  business?: { id?: string; name?: string };
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return fail(null, "auth_denied");
  if (!code || !state || !UUID_RE.test(state)) return fail(null, "invalid_state");

  const admin = adminClient();

  const { data: stateRows, error: stateErr } = await admin.rpc(
    "crm_consume_oauth_state",
    { p_state_id: state },
  );
  const st = Array.isArray(stateRows) ? stateRows[0] : null;
  if (stateErr || !st?.valid) return fail(null, "invalid_or_expired_state");
  if (st.platform !== "meta") return fail(st.return_url, "platform_mismatch");
  if (!st.artist_id) return fail(st.return_url, "state_without_artist");

  const returnUrl: string | null = st.return_url ?? null;

  const appId = Deno.env.get("META_APP_ID");
  const appSecret = Deno.env.get("META_APP_SECRET");
  const masterKey = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!appId || !appSecret || !masterKey) return fail(returnUrl, "app_not_configured");

  // 1) code → token curto
  let shortToken: string;
  try {
    const u = new URL(`${GRAPH}/oauth/access_token`);
    u.searchParams.set("client_id", appId);
    u.searchParams.set("redirect_uri", adsCallbackUri());
    u.searchParams.set("client_secret", appSecret);
    u.searchParams.set("code", code);
    const res = await fetch(u);
    const j = await res.json();
    if (!res.ok || !j?.access_token) {
      console.error("[artist-ads-meta-callback] short exchange:", res.status, j);
      return fail(returnUrl, "token_exchange_failed");
    }
    shortToken = j.access_token as string;
  } catch (e) {
    console.error("[artist-ads-meta-callback] short exchange threw:", e);
    return fail(returnUrl, "token_exchange_failed");
  }

  // 2) token curto → token longo (~60 dias)
  let longToken: string;
  let expiresInSec: number;
  try {
    const u = new URL(`${GRAPH}/oauth/access_token`);
    u.searchParams.set("grant_type", "fb_exchange_token");
    u.searchParams.set("client_id", appId);
    u.searchParams.set("client_secret", appSecret);
    u.searchParams.set("fb_exchange_token", shortToken);
    const res = await fetch(u);
    const j = await res.json();
    if (!res.ok || !j?.access_token) {
      console.error("[artist-ads-meta-callback] long exchange:", res.status, j);
      return fail(returnUrl, "token_exchange_failed");
    }
    longToken = j.access_token as string;
    expiresInSec = Number(j.expires_in) || 60 * 60 * 24 * 60;
  } catch (e) {
    console.error("[artist-ads-meta-callback] long exchange threw:", e);
    return fail(returnUrl, "token_exchange_failed");
  }

  // 3) contas de anúncios acessíveis
  let accounts: AdAccount[];
  try {
    const u = new URL(`${GRAPH}/me/adaccounts`);
    u.searchParams.set("fields", "id,name,currency,account_status,business");
    u.searchParams.set("limit", "200");
    u.searchParams.set("access_token", longToken);
    const res = await fetch(u);
    const j = await res.json();
    if (!res.ok || j?.error) {
      console.error("[artist-ads-meta-callback] /me/adaccounts:", res.status, j);
      return fail(returnUrl, "ad_accounts_fetch_failed");
    }
    accounts = (j.data ?? []) as AdAccount[];
  } catch (e) {
    console.error("[artist-ads-meta-callback] /me/adaccounts threw:", e);
    return fail(returnUrl, "ad_accounts_fetch_failed");
  }

  if (accounts.length === 0) return fail(returnUrl, "no_ad_account");

  const single = accounts.length === 1 ? accounts[0] : null;
  const business = accounts.find((a) => a.business?.id)?.business ?? null;

  // 4) grava a ligação (token cifrado no servidor)
  const { data: connectionId, error: upErr } = await admin.rpc(
    "crm_upsert_artist_meta_connection",
    {
      p_company_id: st.company_id,
      p_artist_id: st.artist_id,
      p_user_id: st.user_id ?? null,
      p_external_business_id: business?.id ?? single?.id ?? "unknown",
      p_external_business_name: business?.name ?? single?.name ?? null,
      p_access_token: longToken,
      p_token_type: "long_lived_user",
      p_expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      p_master_key: masterKey,
      p_available_ad_accounts: accounts,
      p_status: single ? "active" : "pending_selection",
      p_selected_ad_account_id: single?.id ?? null,
      p_selected_ad_account_name: single?.name ?? null,
      p_selected_ad_account_currency: single?.currency ?? null,
    },
  );

  if (upErr) {
    console.error("[artist-ads-meta-callback] upsert failed:", upErr.message);
    return fail(returnUrl, "save_failed");
  }

  // 5) Instagram da Página (D-ERP133): se a ligação já tem selected_page_id,
  // grava selected_instagram_id. Falha aqui NÃO falha o OAuth.
  let igResult: Record<string, unknown> = { skipped: "sem selected_page_id" };
  try {
    const { data: conn } = await (admin as any)
      .schema("crm")
      .from("ad_platform_connections")
      .select("id, selected_page_id")
      .eq("id", connectionId)
      .maybeSingle();
    const pageId = conn?.selected_page_id as string | null | undefined;
    if (pageId) {
      const u = new URL(`${GRAPH}/${encodeURIComponent(pageId)}`);
      u.searchParams.set("fields", "instagram_business_account{id,username}");
      u.searchParams.set("access_token", longToken);
      const res = await fetch(u, { signal: AbortSignal.timeout(20_000) });
      const j = await res.json().catch(() => null);
      const igId = j?.instagram_business_account?.id as string | undefined;
      if (!res.ok || j?.error) {
        igResult = {
          page_id: pageId,
          error: `graph ${res.status} ${j?.error?.code ?? ""} ${j?.error?.message ?? ""}`.trim(),
        };
      } else if (!igId) {
        igResult = { page_id: pageId, error: "Página sem conta de Instagram ligada" };
      } else {
        const { error: igErr } = await (admin as any)
          .schema("crm")
          .from("ad_platform_connections")
          .update({ selected_instagram_id: igId })
          .eq("id", connectionId);
        igResult = igErr
          ? { page_id: pageId, error: `gravação falhou: ${igErr.message}` }
          : {
            page_id: pageId,
            instagram_id: igId,
            instagram_username: j?.instagram_business_account?.username ?? null,
          };
      }
    }
  } catch (e) {
    igResult = { error: `exceção: ${(e as Error)?.message ?? String(e)}` };
  }

  await auditLog(admin, {
    entity_type: "artist",
    entity_id: st.artist_id,
    action: "artist_ads_meta_connected",
    changed_by: st.user_id ?? "service_role",
    company_id: st.company_id,
    metadata: {
      platform: "meta",
      connection_id: connectionId,
      ad_accounts: accounts.length,
      status: single ? "active" : "pending_selection",
      instagram: igResult,
    },
  });

  return back(returnUrl, {
    connection: "ok",
    scope: "ads",
    platform: "meta",
    status: single ? "active" : "pending_selection",
  });
});
