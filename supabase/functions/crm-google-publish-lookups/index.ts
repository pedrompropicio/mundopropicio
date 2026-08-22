// crm-google-publish-lookups — leituras de apoio ao publicador Google Ads.
//
// BUILD_VERSION=google-publish-lookups-v1
// READ-ONLY. Não cria nem altera nada no Google Ads.
//
// acao:
//  - "conversion_actions": lê as metas de conversão da conta (GAQL) e espelha em
//    crm.google_conversion_action; devolve a lista para o dropdown do painel.
//  - "geo_suggest": resolve a cidade/país do evento em geoTargetConstants.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { getGoogleAdsAccessToken, googleAdsPost, googleAdsSearch, mensagemErroGoogle, type GoogleAdsCtx } from "../_shared/google-ads.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") ?? "";
const LOGIN_CID_FALLBACK = Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  console.log("[google-publish-lookups] BUILD_VERSION=google-publish-lookups-v1");

  let body: {
    company_id?: string;
    acao?: "conversion_actions" | "geo_suggest";
    cidade?: string;
    pais?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error_user_msg: "Pedido inválido." });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ ok: false, error_user_msg: "Sessão inválida." }, 401);

  // A connection google é lida pela RLS do utilizador → isolamento por empresa.
  const { data: conn, error: connErr } = await (userClient as any)
    .schema("crm")
    .from("ad_platform_connections")
    .select("id, company_id, selected_ad_account_id, login_customer_id")
    .eq("platform", "google")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (connErr) return json({ ok: false, error_user_msg: "Não foi possível ler a ligação Google.", error: connErr.message });
  if (!conn) return json({ ok: false, error_user_msg: "Não há ligação Google Ads ativa nesta empresa." });

  let accessToken: string;
  try {
    accessToken = await getGoogleAdsAccessToken();
  } catch (e) {
    return json({ ok: false, error_user_msg: "Não foi possível autenticar no Google Ads.", error: (e as Error).message });
  }
  const ctx: GoogleAdsCtx = {
    accessToken,
    developerToken: DEVELOPER_TOKEN,
    loginCustomerId: String(conn.login_customer_id || LOGIN_CID_FALLBACK || "").replace(/-/g, ""),
    customerId: String(conn.selected_ad_account_id || "").replace(/-/g, ""),
  };

  try {
    if (body.acao === "geo_suggest") {
      const resp = await googleAdsPost<any>(ctx, `/geoTargetConstants:suggest`, {
        locale: "pt",
        countryCode: (body.pais || "PT").toUpperCase(),
        locationNames: { names: [body.cidade || ""].filter(Boolean) },
      });
      const sugestoes = (resp?.geoTargetConstantSuggestions ?? []).map((s: any) => ({
        id: String(s.geoTargetConstant?.id ?? ""),
        nome: s.geoTargetConstant?.name ?? "",
        tipo: s.geoTargetConstant?.targetType ?? "",
        pais: s.geoTargetConstant?.countryCode ?? "",
        alcance: s.reach ?? null,
      })).filter((s: any) => s.id);
      return json({ ok: true, sugestoes });
    }

    // conversion_actions (default)
    const rows = await googleAdsSearch(
      ctx,
      `SELECT conversion_action.id, conversion_action.name, conversion_action.type,
              conversion_action.status, conversion_action.category,
              conversion_action.primary_for_goal
       FROM conversion_action
       WHERE conversion_action.status != 'REMOVED'`,
    );
    const acoes = rows.map((r) => {
      const ca = r.conversionAction ?? {};
      return {
        resource_name: ca.resourceName ?? `customers/${ctx.customerId}/conversionActions/${ca.id}`,
        external_id: String(ca.id ?? ""),
        name: ca.name ?? "",
        type: ca.type ?? "",
        status: ca.status ?? "",
        category: ca.category ?? "",
        primary_for_goal: ca.primaryForGoal ?? null,
      };
    });

    if (acoes.length > 0) {
      await (admin as any)
        .schema("crm")
        .from("google_conversion_action")
        .upsert(
          acoes.map((a) => ({
            company_id: conn.company_id,
            connection_id: conn.id,
            customer_id: ctx.customerId,
            resource_name: a.resource_name,
            external_id: a.external_id,
            name: a.name,
            type: a.type,
            status: a.status,
            category: a.category,
            primary_for_goal: a.primary_for_goal,
            raw: a,
            last_synced_at: new Date().toISOString(),
          })),
          { onConflict: "company_id,customer_id,resource_name" },
        );
    }

    return json({ ok: true, conta: ctx.customerId, acoes });
  } catch (e) {
    const raw = (e as any)?.raw ?? String((e as Error)?.message ?? e);
    return json({ ok: false, error_user_msg: mensagemErroGoogle(raw), error: raw });
  }
});
