// crm-google-publish-activate — tira a campanha Google do PAUSE (e volta a pôr).
//
// BUILD_VERSION=google-publish-activate-v1
//
// Espelho do crm-meta-publish-activate:
//  - ativar: bottom-up (anúncios → grupos → campanha)
//  - pausar: top-down  (campanha → grupos → anúncios)
//  - idempotente: grava google_status por objeto; re-corrida salta o que já está
//  - rejeição do Google devolve SEMPRE 200 + ok:false + error_user_msg

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { getGoogleAdsAccessToken, googleAdsPost, mensagemErroGoogle, type GoogleAdsCtx } from "../_shared/google-ads.ts";

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
  console.log("[google-publish-activate] BUILD_VERSION=google-publish-activate-v1");

  let body: { plan_id?: string; company_id?: string; acao?: "ativar" | "pausar" } = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error_user_msg: "Pedido inválido." });
  }
  const acao = body.acao === "pausar" ? "pausar" : "ativar";
  if (!body.plan_id) return json({ ok: false, error_user_msg: "Falta o plano." });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: user } = await userClient.auth.getUser();

  const { data: plan, error: planErr } = await (userClient as any)
    .schema("crm")
    .from("google_publish_plan")
    .select("*")
    .eq("id", body.plan_id)
    .maybeSingle();
  if (planErr) return json({ ok: false, error_user_msg: "Não foi possível ler o plano.", error: planErr.message });
  if (!plan) return json({ ok: false, error_user_msg: "Plano não encontrado nesta empresa." });
  if (body.company_id && plan.company_id !== body.company_id) {
    return json({ ok: false, error_user_msg: "O plano não pertence a esta empresa." });
  }

  if (acao === "ativar" && !["publicado", "pausado"].includes(plan.estado)) {
    return json({ ok: false, error_user_msg: `Estado "${plan.estado}" não permite ativar.` });
  }
  if (acao === "pausar" && plan.estado !== "ativo") {
    return json({ ok: false, error_user_msg: "A campanha não está ativa." });
  }
  if (!plan.google_campaign_resource) {
    return json({ ok: false, error_user_msg: "A campanha ainda não existe no Google." });
  }

  const adGroups: any[] = JSON.parse(JSON.stringify(plan.ad_groups ?? []));
  if (acao === "ativar") {
    const faltam =
      adGroups.some((g) => !g.google_ad_group_resource) ||
      adGroups.some((g) => (g.ads ?? []).some((a: any) => !a.google_ad_resource));
    if (faltam) {
      return json({ ok: false, error_user_msg: "Há grupos ou anúncios sem criar no Google — republica antes de ativar." });
    }
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleAdsAccessToken();
  } catch (e) {
    return json({ ok: false, error_user_msg: "Não foi possível autenticar no Google Ads.", error: (e as Error).message });
  }
  const ctx: GoogleAdsCtx = {
    accessToken,
    developerToken: DEVELOPER_TOKEN,
    loginCustomerId: String(plan.login_customer_id || LOGIN_CID_FALLBACK || "").replace(/-/g, ""),
    customerId: String(plan.customer_id || "").replace(/-/g, ""),
  };
  const cid = ctx.customerId;
  const target = acao === "ativar" ? "ENABLED" : "PAUSED";
  const resultado: Array<Record<string, unknown>> = [];

  const persist = async (extra: Record<string, unknown> = {}) => {
    await (admin as any)
      .schema("crm")
      .from("google_publish_plan")
      .update({ ad_groups: adGroups, ...extra })
      .eq("id", plan.id);
  };

  const flipAd = async (a: any, grupo: string) => {
    if (a.google_status === target) return;
    await googleAdsPost(ctx, `/customers/${cid}/adGroupAds:mutate`, {
      operations: [{ update: { resourceName: a.google_ad_resource, status: target }, updateMask: "status" }],
    });
    a.google_status = target;
    resultado.push({ nivel: "anuncio", grupo, id: a.google_ad_resource, status: target });
    await persist();
  };

  const flipGroup = async (g: any) => {
    if (g.google_status === target) return;
    await googleAdsPost(ctx, `/customers/${cid}/adGroups:mutate`, {
      operations: [{ update: { resourceName: g.google_ad_group_resource, status: target }, updateMask: "status" }],
    });
    g.google_status = target;
    resultado.push({ nivel: "grupo", nome: g.nome, id: g.google_ad_group_resource, status: target });
    await persist();
  };

  const flipCampaign = async () => {
    await googleAdsPost(ctx, `/customers/${cid}/campaigns:mutate`, {
      operations: [{ update: { resourceName: plan.google_campaign_resource, status: target }, updateMask: "status" }],
    });
    resultado.push({ nivel: "campanha", id: plan.google_campaign_resource, status: target });
  };

  try {
    if (acao === "ativar") {
      for (const g of adGroups) for (const a of g.ads ?? []) await flipAd(a, g.nome);
      for (const g of adGroups) await flipGroup(g);
      await flipCampaign();
      await persist({
        estado: "ativo",
        activated_at: new Date().toISOString(),
        activated_by: user?.user?.id ?? null,
        activation_error: null,
      });
      return json({ ok: true, estado: "ativo", resultado });
    }
    await flipCampaign();
    for (const g of adGroups) await flipGroup(g);
    for (const g of adGroups) for (const a of g.ads ?? []) await flipAd(a, g.nome);
    await persist({ estado: "pausado", activation_error: null });
    return json({ ok: true, estado: "pausado", resultado });
  } catch (e) {
    const raw = (e as any)?.raw ?? String((e as Error)?.message ?? e);
    await persist({ activation_error: { acao, raw, at: new Date().toISOString() } });
    return json({ ok: false, error_user_msg: mensagemErroGoogle(raw), error: raw, resultado });
  }
});
