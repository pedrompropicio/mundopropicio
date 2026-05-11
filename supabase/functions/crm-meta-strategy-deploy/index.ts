// crm-meta-strategy-deploy
// POST { strategy_id } → cria Campaigns + AdSets + AdCreatives + Ads no Meta via Marketing API.
// Tudo em status PAUSED por segurança (Pedro ativa manualmente no Ads Manager).
// Logs estruturados, persistência em crm.meta_campaign_strategy_deployments.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v18.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENCRYPTION_MASTER_KEY = Deno.env.get("ENCRYPTION_MASTER_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Map old IA-generated objectives → new Meta API v18+ values
function mapObjective(objective: string | undefined): string {
  const m: Record<string, string> = {
    REACH: "OUTCOME_AWARENESS",
    BRAND_AWARENESS: "OUTCOME_AWARENESS",
    VIDEO_VIEWS: "OUTCOME_AWARENESS",
    TRAFFIC: "OUTCOME_TRAFFIC",
    LINK_CLICKS: "OUTCOME_TRAFFIC",
    POST_ENGAGEMENT: "OUTCOME_ENGAGEMENT",
    PAGE_LIKES: "OUTCOME_ENGAGEMENT",
    LEAD_GENERATION: "OUTCOME_LEADS",
    APP_INSTALLS: "OUTCOME_APP_PROMOTION",
    OFFSITE_CONVERSIONS: "OUTCOME_SALES",
    CONVERSIONS: "OUTCOME_SALES",
    CATALOG_SALES: "OUTCOME_SALES",
  };
  if (!objective) return "OUTCOME_TRAFFIC";
  if (objective.startsWith("OUTCOME_")) return objective;
  return m[objective] ?? "OUTCOME_TRAFFIC";
}

async function metaPost(path: string, accessToken: string, params: Record<string, string>): Promise<any> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`;
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const r = await fetch(url, { method: "POST", body });
  const j = await r.json();
  if (!r.ok || j.error) {
    const err = j.error?.message || JSON.stringify(j);
    throw new Error(`Meta API ${r.status}: ${err}`);
  }
  return j;
}

type LogLevel = "info" | "warn" | "error";
interface LogEntry { ts: string; level: LogLevel; message: string; context?: any; }

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { strategy_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { strategy_id } = body;
  if (!strategy_id) return json({ error: "missing_strategy_id" }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: "unauthorized", detail: userErr?.message }, 401);
  const userId = userData.user.id;

  const log: LogEntry[] = [];
  const addLog = (level: LogLevel, message: string, context?: any) => {
    log.push({ ts: new Date().toISOString(), level, message, context });
    console.log(`[${level}] ${message}`, context ? JSON.stringify(context) : "");
  };

  let deploymentId: string | null = null;
  const startedAt = Date.now();

  try {
    // 1) Buscar strategy
    const { data: strategy, error: stratErr } = await (supabase as any)
      .schema("crm").from("meta_campaign_strategies")
      .select("*").eq("id", strategy_id).maybeSingle();
    if (stratErr || !strategy) return json({ error: "strategy_not_found", detail: stratErr?.message }, 404);
    if (!strategy.generated_plan) return json({ error: "plan_not_generated" }, 400);
    if (!strategy.connection_id) return json({ error: "connection_missing" }, 400);

    // 2) Buscar token + company
    const { data: tokenRows, error: tokenErr } = await supabase.rpc("crm_get_meta_decrypted_token", {
      p_connection_id: strategy.connection_id,
      p_master_key: ENCRYPTION_MASTER_KEY,
    });
    if (tokenErr || !Array.isArray(tokenRows) || tokenRows.length === 0) {
      return json({ error: "connection_token_failed", detail: tokenErr?.message }, 403);
    }
    const { access_token: accessToken, company_id: companyId } = tokenRows[0] as { access_token: string; company_id: string };

    // 3) Buscar Page + IG da connection
    const { data: conn } = await (supabase as any)
      .schema("crm").from("ad_platform_connections")
      .select("selected_page_id, selected_instagram_id")
      .eq("id", strategy.connection_id).maybeSingle();
    if (!conn?.selected_page_id) {
      return json({
        error: "page_not_selected",
        message: "Tens de selecionar uma Page do Facebook em /audience/connections antes de deployar.",
      }, 400);
    }
    const pageId = conn.selected_page_id;
    const instagramActorId = conn.selected_instagram_id;
    const adAccountId = strategy.ad_account_id.startsWith("act_")
      ? strategy.ad_account_id
      : `act_${strategy.ad_account_id}`;

    // 4) Criar deployment row
    const { data: depRow, error: depErr } = await (supabase as any)
      .schema("crm").from("meta_campaign_strategy_deployments")
      .insert({
        company_id: companyId,
        strategy_id,
        connection_id: strategy.connection_id,
        ad_account_id: adAccountId,
        status: "running",
        started_at: new Date().toISOString(),
        created_by: userId,
      })
      .select("id").single();
    if (depErr || !depRow) return json({ error: "deployment_create_failed", detail: depErr?.message }, 500);
    deploymentId = depRow.id;
    addLog("info", "Deployment iniciado", { deployment_id: deploymentId, ad_account_id: adAccountId, page_id: pageId, instagram: !!instagramActorId });

    // 5) Buscar associações criativo → phase
    const { data: associations } = await (supabase as any)
      .schema("crm").from("meta_strategy_creatives")
      .select("phase_id, creative_id")
      .eq("strategy_id", strategy_id);

    const creativeIdsByPhase: Record<string, string[]> = {};
    for (const a of associations ?? []) {
      const key = a.phase_id ?? "_global";
      (creativeIdsByPhase[key] = creativeIdsByPhase[key] ?? []).push(a.creative_id);
    }

    // Carregar criativos referenciados
    const allCreativeIds = [...new Set(Object.values(creativeIdsByPhase).flat())];
    const { data: creatives } = allCreativeIds.length > 0
      ? await (supabase as any)
          .schema("crm").from("meta_creatives")
          .select("id, name, file_url, file_mime_type, headline, body, cta_type, link_url, meta_image_hash")
          .in("id", allCreativeIds)
      : { data: [] };
    const creativesById = new Map<string, any>();
    for (const c of creatives ?? []) creativesById.set(c.id, c);

    // 6) Iterate plan
    const plan = strategy.generated_plan;
    const phases = Array.isArray(plan.phases) ? plan.phases : [];
    const recommendedCampaigns = Array.isArray(plan.recommended_campaigns) ? plan.recommended_campaigns : [];

    const metaCampaigns: any[] = [];
    const metaAdsets: any[] = [];
    const metaAds: any[] = [];
    const imageHashCache: Record<string, string> = {};

    for (const phase of phases) {
      const phaseCreativeIds = creativeIdsByPhase[phase.id] ?? creativeIdsByPhase["_global"] ?? [];
      if (phaseCreativeIds.length === 0) {
        addLog("warn", `Phase "${phase.name}" (${phase.id}) sem criativos — skip`);
        continue;
      }
      const phaseCreatives = phaseCreativeIds.map((id) => creativesById.get(id)).filter(Boolean);
      const phaseCampaigns = recommendedCampaigns.filter((c: any) => c.phase_id === phase.id);
      if (phaseCampaigns.length === 0) {
        addLog("warn", `Phase "${phase.name}" sem campanhas no plano — skip`);
        continue;
      }

      for (const planCampaign of phaseCampaigns) {
        try {
          addLog("info", `A criar Campaign: ${planCampaign.campaign_name}`);
          const campRes = await metaPost(`${adAccountId}/campaigns`, accessToken, {
            name: planCampaign.campaign_name,
            objective: mapObjective(planCampaign.objective),
            status: "PAUSED",
            special_ad_categories: "[]",
            buying_type: "AUCTION",
          });
          const metaCampaignId = campRes.id;
          metaCampaigns.push({
            plan_phase_id: phase.id,
            plan_campaign_name: planCampaign.campaign_name,
            meta_campaign_id: metaCampaignId,
          });
          addLog("info", `✓ Campaign criada: ${metaCampaignId}`);

          for (const planAdset of planCampaign.adsets ?? []) {
            try {
              const targeting = planAdset.targeting_json || { geo_locations: { countries: ["PT", "BR"] } };
              const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
              const dailyBudgetCents = Math.max(100, Math.round((planCampaign.daily_budget_eur ?? 10) * 100));

              const adsetRes = await metaPost(`${adAccountId}/adsets`, accessToken, {
                name: planAdset.adset_name,
                campaign_id: metaCampaignId,
                daily_budget: String(dailyBudgetCents),
                billing_event: planAdset.billing_event || "IMPRESSIONS",
                optimization_goal: planAdset.optimization_goal || "LINK_CLICKS",
                bid_strategy: "LOWEST_COST_WITHOUT_CAP",
                targeting: JSON.stringify(targeting),
                status: "PAUSED",
                start_time: startTime,
              });
              const metaAdsetId = adsetRes.id;
              metaAdsets.push({
                plan_adset_name: planAdset.adset_name,
                meta_adset_id: metaAdsetId,
                parent_meta_campaign_id: metaCampaignId,
                phase_id: phase.id,
              });
              addLog("info", `  ✓ AdSet criado: ${metaAdsetId}`);

              for (const creative of phaseCreatives) {
                try {
                  let imageHash = imageHashCache[creative.id] || creative.meta_image_hash;
                  if (!imageHash) {
                    addLog("info", `    A enviar imagem ${creative.id} → Meta`);
                    const imgRes = await metaPost(`${adAccountId}/adimages`, accessToken, {
                      url: creative.file_url,
                    });
                    const imagesObj = imgRes.images || {};
                    imageHash = (Object.values(imagesObj)[0] as any)?.hash;
                    if (!imageHash) throw new Error("Meta did not return image hash");
                    imageHashCache[creative.id] = imageHash;
                    await (supabase as any).schema("crm").from("meta_creatives")
                      .update({ meta_image_hash: imageHash }).eq("id", creative.id);
                  }

                  const linkUrl = creative.link_url || "https://mundopropicio.com";
                  const linkData: any = {
                    link: linkUrl,
                    message: creative.body || creative.name,
                    name: creative.headline || creative.name,
                    image_hash: imageHash,
                    call_to_action: {
                      type: creative.cta_type || "LEARN_MORE",
                      value: { link: linkUrl },
                    },
                  };

                  const objectStorySpec: any = { page_id: pageId, link_data: linkData };
                  if (instagramActorId) objectStorySpec.instagram_actor_id = instagramActorId;

                  const credRes = await metaPost(`${adAccountId}/adcreatives`, accessToken, {
                    name: `AC: ${creative.name}`,
                    object_story_spec: JSON.stringify(objectStorySpec),
                  });
                  const metaCreativeId = credRes.id;
                  await (supabase as any).schema("crm").from("meta_creatives")
                    .update({ meta_creative_id: metaCreativeId }).eq("id", creative.id);

                  const adRes = await metaPost(`${adAccountId}/ads`, accessToken, {
                    name: `Ad: ${creative.name} → ${planAdset.adset_name}`,
                    adset_id: metaAdsetId,
                    creative: JSON.stringify({ creative_id: metaCreativeId }),
                    status: "PAUSED",
                  });
                  metaAds.push({
                    creative_id: creative.id,
                    meta_creative_id: metaCreativeId,
                    meta_ad_id: adRes.id,
                    parent_meta_adset_id: metaAdsetId,
                  });
                  addLog("info", `    ✓ Ad criado: ${adRes.id}`);
                } catch (e: any) {
                  addLog("error", `    ✗ Falha a criar Ad para creative ${creative.id}`, { error: e.message });
                }
              }
            } catch (e: any) {
              addLog("error", `  ✗ Falha a criar AdSet ${planAdset.adset_name}`, { error: e.message });
            }
          }
        } catch (e: any) {
          addLog("error", `✗ Falha a criar Campaign ${planCampaign.campaign_name}`, { error: e.message });
        }
      }
    }

    // 7) Status final
    const hasCampaigns = metaCampaigns.length > 0;
    const hasErrors = log.some((l) => l.level === "error");
    const finalStatus = !hasCampaigns ? "failed" : (hasErrors ? "partial" : "success");
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;

    const errorSummary = hasErrors
      ? log.filter((l) => l.level === "error").map((l) => l.message).slice(0, 3).join(" | ")
      : null;

    await (supabase as any).schema("crm").from("meta_campaign_strategy_deployments").update({
      status: finalStatus,
      meta_campaign_ids: metaCampaigns,
      meta_adset_ids: metaAdsets,
      meta_ad_ids: metaAds,
      log_entries: log,
      error_summary: errorSummary,
      completed_at: completedAt,
      duration_ms: durationMs,
    }).eq("id", deploymentId);

    if (finalStatus === "success" || finalStatus === "partial") {
      await (supabase as any).schema("crm").from("meta_campaign_strategies").update({
        status: "in_progress",
      }).eq("id", strategy_id);
    }

    return json({
      deployment_id: deploymentId,
      status: finalStatus,
      summary: {
        campaigns_created: metaCampaigns.length,
        adsets_created: metaAdsets.length,
        ads_created: metaAds.length,
        errors: log.filter((l) => l.level === "error").length,
      },
      ad_account_id: adAccountId,
      log,
    });
  } catch (e: any) {
    addLog("error", "Unhandled exception", { error: e.message, stack: e.stack?.slice(0, 1000) });
    if (deploymentId) {
      await (supabase as any).schema("crm").from("meta_campaign_strategy_deployments").update({
        status: "failed",
        log_entries: log,
        error_summary: e.message?.slice(0, 500),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      }).eq("id", deploymentId);
    }
    return json({ error: "deployment_failed", detail: e.message, log }, 500);
  }
});
