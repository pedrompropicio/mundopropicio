// cold-start trigger: 2026-06-01-v2 secret rotation
// crm-meta-strategy-deploy
// POST { strategy_id } → cria Campaigns + AdSets + AdCreatives + Ads no Meta via Marketing API.
// Tudo em status PAUSED por segurança (Pedro ativa manualmente no Ads Manager).
// Logs estruturados, persistência em crm.meta_campaign_strategy_deployments.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";
import { computePerAdsetCents } from "../_shared/budget-split.ts";

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

// Gate de qualidade de criativos: um criativo é "degradado" se o nome ainda contém
// um placeholder por resolver ({{...}}) ou se a headline está em falta — ambos
// publicariam texto inválido na conta Meta real. Devolve o motivo (para log) ou null.
// IMPORTANTE: mantém-se idêntico ao predicado do frontend em
// src/pages/crm/StrategyView.tsx (creativeDegradedReason). Runtimes diferentes
// (Deno vs Vite) impedem partilhar o mesmo módulo — alterar os dois em conjunto.
function creativeDegradedReason(c: { name?: string | null; headline?: string | null }): string | null {
  if (typeof c?.name === "string" && c.name.includes("{{")) return "placeholder no nome";
  if (!c?.headline || c.headline.trim() === "") return "headline em falta";
  return null;
}

// Erro estruturado: preserva o corpo do erro da Meta (error_user_msg,
// error_user_title, code, error_subcode, fbtrace_id, type) em vez de o reduzir
// a "Invalid parameter". Os catches e o frontend podem ler `metaError` para
// diagnóstico real.
class MetaApiError extends Error {
  httpStatus: number;
  metaError: any;
  rawBody: any;
  constructor(httpStatus: number, metaError: any, rawBody: any) {
    const userMsg =
      metaError?.error_user_msg ||
      metaError?.message ||
      (typeof rawBody === "string" ? rawBody.slice(0, 300) : JSON.stringify(rawBody)?.slice(0, 300));
    super(`Meta API ${httpStatus}: ${userMsg}`);
    this.name = "MetaApiError";
    this.httpStatus = httpStatus;
    this.metaError = metaError ?? null;
    this.rawBody = rawBody;
  }
}

// Contexto estruturado para usar em addLog/json. Para MetaApiError expõe o
// detalhe Meta; para erros genéricos cai em { error: e.message }.
function errContext(e: any): Record<string, unknown> {
  if (e?.name === "MetaApiError") {
    return {
      error: e.message,
      http_status: e.httpStatus,
      meta_error: {
        message: e.metaError?.message ?? null,
        type: e.metaError?.type ?? null,
        code: e.metaError?.code ?? null,
        error_subcode: e.metaError?.error_subcode ?? null,
        error_user_title: e.metaError?.error_user_title ?? null,
        error_user_msg: e.metaError?.error_user_msg ?? null,
        fbtrace_id: e.metaError?.fbtrace_id ?? null,
      },
    };
  }
  return { error: e?.message ?? String(e) };
}

async function metaPost(path: string, accessToken: string, params: Record<string, string>): Promise<any> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`;
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const r = await fetch(url, { method: "POST", body });
  // Ler como texto primeiro para preservar o corpo mesmo se não for JSON válido.
  const text = await r.text();
  let j: any = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
  if (!r.ok || j?.error) {
    // Log para Edge Function logs com o corpo inteiro da Meta antes do throw.
    console.error("[metaPost] Meta API error", {
      path, http_status: r.status, meta_error: j?.error ?? null, raw_body: j ?? text,
    });
    throw new MetaApiError(r.status, j?.error ?? null, j ?? text);
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

  let body: { strategy_id?: string; force_redeploy?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const { strategy_id } = body;
  if (!strategy_id) return json({ error: "missing_strategy_id" }, 400);
  const forceRedeploy = body.force_redeploy === true;

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
  addLog("info", "DEPLOY_VERSION_MARKER v=a20a742b exclusions-array-drop+video-only-awareness ativo");

  // Persiste a falha no deployment (mesmo formato do status final) antes de um
  // early-return por caso-limite. Usado pelos aborts de pixel (ver abaixo).
  const failDeployment = async (errorCode: string) => {
    if (!deploymentId) return;
    await (supabase as any).schema("crm").from("meta_campaign_strategy_deployments").update({
      status: "failed",
      log_entries: log,
      error_summary: errorCode,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    }).eq("id", deploymentId);
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

    // ── LOCK — recusar se já há deployment desta strategy a correr há <10min ──
    // Usa o status='running' da row de deployment como mutex distribuído. TTL
    // de 10min evita lock permanente em caso de crash do edge function sem
    // update final. force_redeploy NÃO bypassa este lock (não queremos 2
    // forces concorrentes a duplicar tudo).
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: runningDeps, error: runErr } = await (supabase as any)
        .schema("crm").from("meta_campaign_strategy_deployments")
        .select("id, started_at")
        .eq("strategy_id", strategy_id)
        .eq("status", "running")
        .gte("started_at", tenMinAgo)
        .limit(1);
      if (!runErr && Array.isArray(runningDeps) && runningDeps.length > 0) {
        return json({
          error: "deploy_already_running",
          detail: `Já existe um deployment em curso (id ${runningDeps[0].id}, iniciado em ${runningDeps[0].started_at}). Espera que termine ou aguarda 10min se crashou.`,
          running_deployment_id: runningDeps[0].id,
        }, 409);
      }
    } catch (e) {
      console.warn("[deploy] lock check failed (non-fatal):", String(e));
    }

    // ── GUARDRAIL: cap de budget diário por role (atómico) ─────────────────────
    // Valida TODAS as campanhas do plano. Se QUALQUER uma excede → 403, nada é
    // criado na Meta. Colocado antes de criar a deployment row para não deixar
    // rows "running" órfãs num abort.
    {
      const planForCap = strategy.generated_plan;
      const campaignsForCap = Array.isArray(planForCap.recommended_campaigns)
        ? planForCap.recommended_campaigns
        : [];
      const { data: capData, error: capErr } = await supabase.rpc(
        "get_user_max_daily_budget_eur",
        { _user_id: userId },
      );
      if (capErr) {
        console.error("[strategy-deploy] failed to read budget cap", capErr);
        return json({ error: "internal_error", message: "Failed to check budget cap." }, 500);
      }
      const capEur: number | null = capData === null ? null : Number(capData);
      console.log("[strategy-deploy] budget cap check", { userId, capEur, campaigns: campaignsForCap.length });
      if (capEur === 0) {
        return json({
          error: "no_budget_authority",
          message: "User has no role authorised to set budget.",
        }, 403);
      }
      if (capEur !== null) {
        const offending = campaignsForCap
          .map((c: any, i: number) => {
            // Mesmo fallback (10) que o código usa ao criar o adset.
            const dailyEur = Number(c?.daily_budget_eur ?? 10);
            return { campaign_index: i, campaign_name: c?.campaign_name ?? `#${i}`, daily_budget_eur: dailyEur };
          })
          .filter((c: any) => c.daily_budget_eur > capEur);
        if (offending.length > 0) {
          return json({
            error: "budget_cap_exceeded_in_plan",
            message: `Strategy contains campaigns exceeding your daily budget limit of €${capEur}/day.`,
            cap_eur: capEur,
            offending_campaigns: offending,
          }, 403);
        }
      }
    }
    // ───────────────────────────────────────────────────────────────────────────

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

    // ── IDEMPOTÊNCIA — lookup de ids JÁ deployados desta strategy ─────────────
    // Lê todos os deployments anteriores com status success/partial e agrega
    // ids gravados para que metaPosts redundantes sejam saltados.
    // Se forceRedeploy=true, ignora (cria tudo do zero) mas mantém o lock.
    // Se o SELECT falhar, segue como se não houvesse anteriores (defensivo).
    const campaignByKey = new Map<string, string>();
    const adsetByKey = new Map<string, string>();
    const adByKey = new Map<string, string>();
    if (!forceRedeploy) {
      try {
        const { data: priorDeps, error: priorErr } = await (supabase as any)
          .schema("crm").from("meta_campaign_strategy_deployments")
          .select("meta_campaign_ids, meta_adset_ids, meta_ad_ids, status, started_at")
          .eq("strategy_id", strategy_id)
          .in("status", ["success", "partial"])
          .order("started_at", { ascending: true });
        if (priorErr) {
          console.warn("[deploy] prior deployments lookup failed:", priorErr.message);
        } else {
          for (const dep of priorDeps ?? []) {
            for (const c of (dep.meta_campaign_ids as any[]) ?? []) {
              if (c?.plan_phase_id && c?.plan_campaign_name && c?.meta_campaign_id) {
                campaignByKey.set(`${c.plan_phase_id}||${c.plan_campaign_name}`, String(c.meta_campaign_id));
              }
            }
            for (const a of (dep.meta_adset_ids as any[]) ?? []) {
              if (a?.phase_id && a?.plan_adset_name && a?.meta_adset_id) {
                adsetByKey.set(`${a.phase_id}||${a.plan_adset_name}`, String(a.meta_adset_id));
              }
            }
            for (const ad of (dep.meta_ad_ids as any[]) ?? []) {
              if (!ad?.parent_meta_adset_id || !ad?.meta_ad_id) continue;
              if (ad.inherited && ad.meta_creative_id) {
                adByKey.set(`${ad.parent_meta_adset_id}||inherited||${ad.meta_creative_id}`, String(ad.meta_ad_id));
              } else if (ad.creative_id) {
                adByKey.set(`${ad.parent_meta_adset_id}||brief||${ad.creative_id}`, String(ad.meta_ad_id));
              }
            }
          }
        }
      } catch (e) {
        console.warn("[deploy] prior deployments lookup threw:", String(e));
      }
    }

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
    if (forceRedeploy) {
      addLog("warn", "force_redeploy=true — a recriar tudo, ignorando deployments anteriores");
    } else if (campaignByKey.size + adsetByKey.size + adByKey.size > 0) {
      addLog("info", `Idempotência: ${campaignByKey.size} campanhas / ${adsetByKey.size} adsets / ${adByKey.size} ads de deployments anteriores serão reutilizados`);
    }

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

    // Pre-fetch dos tipos de creatives herdados (existing_creative_id no plan)
    // para validar compatibilidade com o objetivo da campanha ANTES de criar o
    // ad (ERRO B: subcode 1885873 — Video Views exige formato vídeo único).
    const inheritedCreativeIds = new Set<string>();
    for (const c of recommendedCampaigns) {
      for (const a of (c.adsets ?? [])) {
        for (const ad of (a.ads ?? [])) {
          if (typeof ad?.existing_creative_id === "string") {
            inheritedCreativeIds.add(ad.existing_creative_id);
          }
        }
      }
    }
    const inheritedCreativeTypes = new Map<string, string>();
    if (inheritedCreativeIds.size > 0) {
      const { data: inheritedRows } = await (supabase as any)
        .schema("crm").from("meta_creatives")
        .select("meta_creative_id, type")
        .in("meta_creative_id", [...inheritedCreativeIds]);
      for (const r of (inheritedRows ?? [])) {
        if (r.meta_creative_id) inheritedCreativeTypes.set(r.meta_creative_id, r.type ?? "");
      }
    }

    // ── Pixel da campanha-fonte (redesign Meta) ──────────────────────────────
    // DEBT(multi-platform): MVP Meta — lê pixel da campanha-fonte. Quando entrar
    // Google/TikTok, mover para tabela event_trackers (event_id × platform ×
    // tracker_id). Ver .lovable/memory/features/multi-platform-tracking-roadmap.md.
    //
    // Deriva UM promoted_object consistente dos adsets da campanha-fonte
    // (crm.meta_adset_snapshot.raw->'promoted_object') e injecta-o nos adsets
    // novos. Os casos-limite abortam ANTES de criar qualquer entidade na Meta.
    const CONVERSION_GOALS = new Set(["OFFSITE_CONVERSIONS", "CONVERSIONS", "VALUE"]);
    const planUsesConversionGoal = recommendedCampaigns.some((c: any) =>
      (c.adsets ?? []).some((a: any) =>
        CONVERSION_GOALS.has(String(a?.optimization_goal ?? "").toUpperCase())
      )
    );

    let sourcePromotedObject: any = null;
    if (strategy.source_campaign_id) {
      const { data: sourceAdsets } = await (supabase as any)
        .schema("crm").from("meta_adset_snapshot")
        .select("external_adset_id, raw")
        .eq("company_id", companyId)
        .eq("external_campaign_id", strategy.source_campaign_id);

      const promotedObjects = (sourceAdsets ?? [])
        .map((r: any) => r?.raw?.promoted_object)
        .filter((po: any) => po && po.pixel_id);
      const distinctPixels = [...new Set(promotedObjects.map((po: any) => String(po.pixel_id)))];

      if (distinctPixels.length > 1) {
        // Caso-limite (b): adsets da fonte com pixels diferentes → abortar.
        addLog("error", `Pixels inconsistentes na campanha-fonte ${strategy.source_campaign_id}`, { pixel_ids: distinctPixels });
        await failDeployment("source_pixel_inconsistent");
        return json({ error: "source_pixel_inconsistent", source_campaign_id: strategy.source_campaign_id, pixel_ids: distinctPixels }, 422);
      }
      if (distinctPixels.length === 1) {
        sourcePromotedObject = promotedObjects.find((po: any) => String(po.pixel_id) === distinctPixels[0]) ?? null;
        addLog("info", `Pixel herdado da campanha-fonte: ${distinctPixels[0]}`, { promoted_object: sourcePromotedObject });
      }
    }

    if (!sourcePromotedObject && planUsesConversionGoal) {
      // Caso-limite (a): plano usa goal de conversão mas a fonte não tem pixel.
      // A chamada /adsets falharia na Meta — abortar com mensagem clara.
      addLog("error", "Campanha-fonte sem pixel (promoted_object) mas o plano usa optimization_goal de conversão", { source_campaign_id: strategy.source_campaign_id ?? null });
      await failDeployment("source_campaign_no_pixel");
      return json({
        error: "source_campaign_no_pixel",
        source_campaign_id: strategy.source_campaign_id ?? null,
        message: "A campanha-fonte não tem pixel (promoted_object) sincronizado e o plano usa goal de conversão. Re-sincroniza os adsets em modo full e tenta de novo.",
      }, 422);
    }

    const metaCampaigns: any[] = [];
    const metaAdsets: any[] = [];
    const metaAds: any[] = [];
    const imageHashCache: Record<string, string> = {};

    for (const phase of phases) {
      const phaseCreativeIds = creativeIdsByPhase[phase.id] ?? creativeIdsByPhase["_global"] ?? [];
      const phaseCreativesAll = phaseCreativeIds.map((id) => creativesById.get(id)).filter(Boolean);
      // GATE de qualidade: saltar criativos degradados ANTES do guard de fase vazia
      // (abaixo), para que uma fase sem criativos válidos seja saltada antes de criar
      // qualquer Campaign/AdSet na Meta — evitando entidades órfãs em PAUSED.
      const phaseCreatives = phaseCreativesAll.filter((c: any) => {
        const reason = creativeDegradedReason(c);
        if (reason) {
          addLog("error", `✗ Criativo saltado (degradado): ${c.name ?? c.id}`, { creative_id: c.id, reason });
          return false;
        }
        return true;
      });
      const phaseCampaigns = recommendedCampaigns.filter((c: any) => c.phase_id === phase.id);
      // Detectar herdados no plan para esta fase
      const phaseHasInherited = phaseCampaigns.some((c: any) =>
        (c.adsets ?? []).some((a: any) =>
          Array.isArray(a.ads) && a.ads.some((ad: any) => typeof ad?.existing_creative_id === "string")
        )
      );
      if (phaseCreatives.length === 0 && !phaseHasInherited) {
        addLog("warn", `Phase "${phase.name}" (${phase.id}) sem criativos (nem herdados nem novos) — skip`);
        continue;
      }
      if (phaseCampaigns.length === 0) {
        addLog("warn", `Phase "${phase.name}" sem campanhas no plano — skip`);
        continue;
      }

      for (const planCampaign of phaseCampaigns) {
        try {
          const campKey = `${phase.id}||${planCampaign.campaign_name}`;
          const existingCampaignId = campaignByKey.get(campKey);
          let metaCampaignId: string;
          // Hoisted FORA do if/else: campaignObjective é usado mais à frente
          // (gate de pixel, validação OUTCOME_AWARENESS, logs) mesmo quando a
          // campanha é REUTILIZADA — não pode ficar só no ramo de criação.
          const campaignObjective = mapObjective(planCampaign.objective);
          if (existingCampaignId) {
            metaCampaignId = existingCampaignId;
            addLog("info", `⟳ Campaign já existe (id ${metaCampaignId}) — reutilizada (key=${campKey})`);
          } else {
            addLog("info", `A criar Campaign: ${planCampaign.campaign_name}`);
            const campRes = await metaPost(`${adAccountId}/campaigns`, accessToken, {
              name: planCampaign.campaign_name,
              objective: campaignObjective,
              status: "PAUSED",
              special_ad_categories: "[]",
              buying_type: "AUCTION",
              // Orçamento é definido ao nível do AdSet (ABO). A Meta exige que este
              // campo seja declarado na Campaign — caso contrário a chamada falha
              // com code=100, error_subcode=4834011. "false" = cada AdSet usa o
              // seu daily_budget independente, sem partilha.
              is_adset_budget_sharing_enabled: "false",
            });
            metaCampaignId = campRes.id;
            addLog("info", `✓ Campaign criada: ${metaCampaignId}`);
          }
          metaCampaigns.push({
            plan_phase_id: phase.id,
            plan_campaign_name: planCampaign.campaign_name,
            meta_campaign_id: metaCampaignId,
          });

          // ── Budget split por adset (fix bug #21 #12) ───────────────────
          // Antes: dailyBudgetCents da campanha era aplicado a CADA adset →
          // campanha com N adsets gastava N× o previsto. Agora reparte por
          // PESO (budget_weight sugerido pelo LLM) com fallback determinístico
          // a divisão igual; soma exacta == total via largest-remainder; clamp
          // ao mínimo da Meta (100c). Decisão fica SEMPRE no código.
          const split = computePerAdsetCents(planCampaign);
          addLog(
            "info",
            `Budget split: campanha "${planCampaign.campaign_name}" total=${split.totalCents}c em ${planCampaign.adsets?.length ?? 0} adsets · modo=${split.mode} · soma_final=${split.sumFinal}c`,
            { per_adset_cents: split.perAdsetCents, warnings: split.warnings },
          );
          if (split.sumFinal !== split.totalCents) {
            addLog(
              "warn",
              `Budget split: soma_final (${split.sumFinal}c) ≠ total (${split.totalCents}c) — ver warnings`,
              { warnings: split.warnings },
            );
          }
          for (const [adsetIdx, planAdset] of (planCampaign.adsets ?? []).entries()) {
            try {

              // ERRO 2 fix (subcode 1870227): a Meta exige targeting_automation.
              // advantage_audience explícito (0 ou 1, integer) em todos os adsets.
              // 0 = Advantage audience desativado (público fica como definido,
              // sem expansão automática). Preserva valor pré-existente do plano.
              const baseTargeting = planAdset.targeting_json
                || { geo_locations: { countries: ["PT", "BR"] } };
              const targeting = {
                ...baseTargeting,
                targeting_automation: {
                  advantage_audience: 0,
                  ...(baseTargeting?.targeting_automation ?? {}),
                },
              };
              // ERRO A fix (subcode 1885097, "expected string, got integer 0"):
              // o gerador de planos por IA emite por vezes `targeting.exclusions`
              // como ARRAY (`[{custom_audience_id: "PURCHASERS_ALL_TIME"}]`) em
              // vez do objeto que a Meta espera (`{custom_audiences:[{id:"…"}]}`).
              // Meta não consegue parsear e devolve 1885097. Dropamos só a forma
              // estruturalmente inválida (array). Exclusions em formato objeto
              // passam intactos. Confirmado por dados: Lookalike (sem exclusions)
              // passa; 3 SALES com exclusions array falham.
              if (Array.isArray((targeting as any).exclusions)) {
                addLog("warn", `    ⚠ Targeting.exclusions removidas do adset ${planAdset.adset_name} (estrutura array inválida — Meta espera objeto)`, { original_exclusions: (targeting as any).exclusions });
                delete (targeting as any).exclusions;
              }
              // Fix 3 (guard) — custom_locations sem lat/lng → HTTP 500 da Meta.
              // Planos NOVOS já vêm resolvidos da geração (resolve-geo.ts). Aqui
              // protegemos planos ANTIGOS / editados à mão que nunca passaram por
              // essa resolução. Fallback DETERMINÍSTICO, SEM /search (o deploy não
              // depende de resolução de geo): dropar custom_locations inválidos e
              // garantir countries. NUNCA enviar address_string cru à Meta.
              const geoLoc = (targeting as any).geo_locations;
              if (geoLoc && typeof geoLoc === "object" && Array.isArray(geoLoc.custom_locations)) {
                const validCoords = geoLoc.custom_locations.filter((loc: any) =>
                  loc && typeof loc === "object" &&
                  loc.latitude != null && loc.longitude != null &&
                  Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude)));
                const invalid = geoLoc.custom_locations.filter((loc: any) =>
                  !(loc && typeof loc === "object" &&
                    loc.latitude != null && loc.longitude != null &&
                    Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))));
                if (invalid.length > 0) {
                  // Derivar país do address_string ("…, Portugal" → PT; "…, Brasil" → BR).
                  const isos = new Set<string>();
                  for (const loc of invalid) {
                    const addr = typeof loc?.address_string === "string" ? loc.address_string.toLowerCase() : "";
                    if (addr.includes("portugal")) isos.add("PT");
                    else if (addr.includes("brasil") || addr.includes("brazil")) isos.add("BR");
                  }
                  if (validCoords.length > 0) geoLoc.custom_locations = validCoords;
                  else delete geoLoc.custom_locations;
                  const existing = Array.isArray(geoLoc.countries) ? geoLoc.countries : [];
                  const merged = new Set<string>([...existing, ...(isos.size > 0 ? [...isos] : ["PT"])]);
                  if (!Array.isArray(geoLoc.cities) || geoLoc.cities.length === 0) {
                    // Só impomos countries se não há já cities a cobrir o geo.
                    geoLoc.countries = [...merged];
                  }
                  addLog("warn", `    ⚠ geo custom_locations sem coords no adset ${planAdset.adset_name} — fallback countries (plano antigo/editado; nunca passou por resolve-geo)`, {
                    dropped: invalid,
                    countries_final: geoLoc.countries ?? null,
                    cities_present: Array.isArray(geoLoc.cities) ? geoLoc.cities.length : 0,
                  });
                }
              }
              const startTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
              const dailyBudgetCents = Math.max(100, Math.round((planCampaign.daily_budget_eur ?? 10) * 100));

              const adsetParams: Record<string, string> = {
                name: planAdset.adset_name,
                campaign_id: metaCampaignId,
                daily_budget: String(dailyBudgetCents),
                billing_event: planAdset.billing_event || "IMPRESSIONS",
                optimization_goal: planAdset.optimization_goal || "LINK_CLICKS",
                bid_strategy: "LOWEST_COST_WITHOUT_CAP",
                targeting: JSON.stringify(targeting),
                status: "PAUSED",
                start_time: startTime,
              };
              // Injecta o pixel herdado da campanha-fonte (ver bloco DEBT acima).
              // SÓ quando a campanha é OUTCOME_SALES E o optimization_goal do adset
              // é de conversão (CONVERSION_GOALS). A Meta rejeita promoted_object/pixel
              // em objetivos não-conversão (OUTCOME_AWARENESS/THRUPLAY, OUTCOME_TRAFFIC)
              // com subcode 1885091 — Awareness, Tráfego e qualquer adset sem goal de
              // conversão ficam deliberadamente sem pixel.
              const adsetGoal = String(planAdset.optimization_goal ?? "").toUpperCase();
              if (
                sourcePromotedObject &&
                campaignObjective === "OUTCOME_SALES" &&
                CONVERSION_GOALS.has(adsetGoal)
              ) {
                // ERRO 3 fix (subcode 1885097, "expected string, got integer 0"):
                // sourcePromotedObject é copiado verbatim do raw da Meta e pode
                // incluir campos extra (page_id, application_id, etc.) com valor
                // integer 0 quando não estão definidos. Filtramos para os campos
                // canónicos com coerção explícita a string — elimina o leak sem
                // mudar o significado da injeção.
                const cleanPromotedObject: Record<string, string> = {
                  pixel_id: String(sourcePromotedObject.pixel_id),
                };
                if (sourcePromotedObject.custom_event_type) {
                  cleanPromotedObject.custom_event_type = String(sourcePromotedObject.custom_event_type);
                }
                adsetParams.promoted_object = JSON.stringify(cleanPromotedObject);
                // ERRO 1 visibility (subcode 1885091): regista a decisão de
                // injeção por adset com os valores exactos vistos pelo gate.
                // Em deploys futuros, este log prova inequivocamente que o
                // gate disparou (ou não) — elimina suspeitas de "deploy lag".
                addLog("info", `  ✓ Pixel injetado no adset ${planAdset.adset_name}`, {
                  campaign_objective: campaignObjective,
                  adset_goal: adsetGoal,
                  pixel_id: cleanPromotedObject.pixel_id,
                  custom_event_type: cleanPromotedObject.custom_event_type ?? null,
                });
              } else if (sourcePromotedObject) {
                addLog("info", `  ⊘ Pixel NÃO injetado no adset ${planAdset.adset_name}`, {
                  campaign_objective: campaignObjective,
                  adset_goal: adsetGoal,
                  reason: campaignObjective !== "OUTCOME_SALES"
                    ? "campaign_not_sales"
                    : "adset_goal_not_conversion",
                });
              }
              // Instrumentação 1487916 / debug de targeting:
              // Loga o objeto `targeting` FINAL (mesma referência que vai para
              // adsetParams.targeting via JSON.stringify) ANTES do POST, para
              // termos diagnóstico do payload exato em deploys partial. Entrada
              // separada do log de sucesso/erro — sobrevive a falhas do POST.
              // adsetParams NÃO contém access_token (o token é adicionado em
              // metaPost via URLSearchParams; ver L101); logar adsetParams seria
              // safe, mas restringimos aos campos relevantes para evitar bloat.
              addLog("info", `  targeting final do adset ${planAdset.adset_name} (pré-POST)`, {
                adset_name: planAdset.adset_name,
                targeting_final: targeting,
                has_custom_audiences: Array.isArray((targeting as any).custom_audiences) && (targeting as any).custom_audiences.length > 0,
                has_exclusions: !!(targeting as any).exclusions && typeof (targeting as any).exclusions === "object" && Object.keys((targeting as any).exclusions).length > 0,
                n_interests: Array.isArray((targeting as any).interests) ? (targeting as any).interests.length : 0,
                adset_params_relevant: {
                  optimization_goal: adsetParams.optimization_goal,
                  billing_event: adsetParams.billing_event,
                  bid_strategy: adsetParams.bid_strategy,
                  promoted_object: adsetParams.promoted_object ?? null,
                },
              });
              const adsetKey = `${phase.id}||${planAdset.adset_name}`;
              const existingAdsetId = adsetByKey.get(adsetKey);
              let metaAdsetId: string;
              if (existingAdsetId) {
                metaAdsetId = existingAdsetId;
                addLog("info", `  ⟳ AdSet já existe (id ${metaAdsetId}) — reutilizado (key=${adsetKey})`);
              } else {
                const adsetRes = await metaPost(`${adAccountId}/adsets`, accessToken, adsetParams);
                metaAdsetId = adsetRes.id;
                addLog("info", `  ✓ AdSet criado: ${metaAdsetId}`);
              }
              metaAdsets.push({
                plan_adset_name: planAdset.adset_name,
                meta_adset_id: metaAdsetId,
                parent_meta_campaign_id: metaCampaignId,
                phase_id: phase.id,
              });

              // 6.1) Reaproveitar criativos herdados (existing_creative_id no plan)
              const planAds: any[] = Array.isArray(planAdset.ads) ? planAdset.ads : [];
              const reuseAds = planAds.filter((a) => typeof a?.existing_creative_id === "string");
              const briefAds = planAds.filter((a) => !a?.existing_creative_id && a?.creative_brief);
              let inheritedUsed = false;
              for (const ra of reuseAds) {
                if (ra.creative_brief) {
                  addLog("error", `    ✗ Ad inválido: tem existing_creative_id E creative_brief — skip`, { existing_creative_id: ra.existing_creative_id });
                  continue;
                }
                // ERRO B fix (subcode 1885873): campanhas OUTCOME_AWARENESS
                // (Video Views/THRUPLAY) exigem creative formato vídeo. Saltar
                // creatives herdados não-vídeo com warning. Outros objetivos:
                // deixar a Meta validar (matriz completa de compatibilidade
                // fica para fase posterior). Type undefined → tratado como
                // "desconhecido" e saltado defensivamente em AWARENESS.
                if (campaignObjective === "OUTCOME_AWARENESS") {
                  const creativeType = inheritedCreativeTypes.get(ra.existing_creative_id) ?? "";
                  if (creativeType !== "video") {
                    addLog("warn", `    ⊘ Creative ${ra.existing_creative_id} saltado: campanha OUTCOME_AWARENESS exige vídeo (tipo herdado: ${creativeType || "desconhecido"})`);
                    continue;
                  }
                }
                try {
                  const adKeyInh = `${metaAdsetId}||inherited||${ra.existing_creative_id}`;
                  const existingAdInh = adByKey.get(adKeyInh);
                  let adRes: { id: string };
                  if (existingAdInh) {
                    adRes = { id: existingAdInh };
                    addLog("info", `    ⟳ Ad (reused) já existe (id ${existingAdInh}) — reutilizado (creative ${ra.existing_creative_id})`);
                  } else {
                    adRes = await metaPost(`${adAccountId}/ads`, accessToken, {
                      name: `Ad (reused): ${ra.existing_creative_id} → ${planAdset.adset_name}`.slice(0, 100),
                      adset_id: metaAdsetId,
                      creative: JSON.stringify({ creative_id: ra.existing_creative_id }),
                      status: "PAUSED",
                    });
                    addLog("info", `    ✓ Ad (reused) criado: ${adRes.id} (creative ${ra.existing_creative_id})`);
                  }
                  metaAds.push({
                    inherited: true,
                    meta_creative_id: ra.existing_creative_id,
                    meta_ad_id: adRes.id,
                    parent_meta_adset_id: metaAdsetId,
                  });
                  inheritedUsed = true;
                } catch (e: any) {
                  addLog("error", `    ✗ Falha a reaproveitar creative ${ra.existing_creative_id}`, errContext(e));
                }
              }
              if (briefAds.length > 0) {
                addLog("warn", `    ⚠ ${briefAds.length} ad(s) com creative_brief sem upload — anexa criativos via UI`);
              }

              // 6.2) Criativos novos via associação UI (legacy) — só se não usámos herdados
              const creativesToCreate = inheritedUsed ? [] : phaseCreatives;
              for (const creative of creativesToCreate) {
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

                  const adKeyBrief = `${metaAdsetId}||brief||${creative.id}`;
                  const existingAdBrief = adByKey.get(adKeyBrief);
                  let adRes: { id: string };
                  if (existingAdBrief) {
                    adRes = { id: existingAdBrief };
                    addLog("info", `    ⟳ Ad já existe (id ${existingAdBrief}) — reutilizado (creative ${creative.id})`);
                  } else {
                    adRes = await metaPost(`${adAccountId}/ads`, accessToken, {
                      name: `Ad: ${creative.name} → ${planAdset.adset_name}`,
                      adset_id: metaAdsetId,
                      creative: JSON.stringify({ creative_id: metaCreativeId }),
                      status: "PAUSED",
                    });
                    addLog("info", `    ✓ Ad criado: ${adRes.id}`);
                  }
                  metaAds.push({
                    creative_id: creative.id,
                    meta_creative_id: metaCreativeId,
                    meta_ad_id: adRes.id,
                    parent_meta_adset_id: metaAdsetId,
                  });
                } catch (e: any) {
                  addLog("error", `    ✗ Falha a criar Ad para creative ${creative.id}`, errContext(e));
                }
              }
            } catch (e: any) {
              addLog("error", `  ✗ Falha a criar AdSet ${planAdset.adset_name}`, errContext(e));
            }
          }
        } catch (e: any) {
          addLog("error", `✗ Falha a criar Campaign ${planCampaign.campaign_name}`, errContext(e));
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

      // ============================================================
      // PAUSE DA CAMPANHA ORIGINAL (redesign workflow — Sprint 3a-1)
      // ------------------------------------------------------------
      // strategy.source_campaign_id presente significa que esta strategy
      // é um redesign de uma campanha existente. pause_original_mode
      // controla quando a original é pausada:
      //   immediate  → pausa agora via Meta API
      //   delayed_7d → cron crm-cron-pause-replaced-originals pausa em D+7
      //   manual     → só marca replaced_by_strategy_id; user decide
      // Falha aqui é tolerada (deploy já teve sucesso).
      // ============================================================
      if (strategy.source_campaign_id) {
        const pauseMode: "immediate" | "delayed_7d" | "manual" = strategy.pause_original_mode ?? "immediate";
        try {
          if (pauseMode === "immediate") {
            const { data: sourceCamp } = await (supabase as any)
              .schema("crm").from("meta_campaign_snapshot")
              .select("status, effective_status")
              .eq("external_campaign_id", strategy.source_campaign_id)
              .maybeSingle();
            const alreadyPaused = sourceCamp?.status === "PAUSED" || sourceCamp?.effective_status === "PAUSED";
            if (!alreadyPaused) {
              await metaPost(strategy.source_campaign_id, accessToken, { status: "PAUSED" });
            }
            await (supabase as any)
              .schema("crm").from("meta_campaign_snapshot")
              .update({ replaced_by_strategy_id: strategy_id })
              .eq("external_campaign_id", strategy.source_campaign_id);
            await (supabase as any)
              .schema("crm").from("meta_campaign_strategies")
              .update({ pause_original_executed_at: new Date().toISOString() })
              .eq("id", strategy_id);
            addLog("info", `Immediate pause executed for source ${strategy.source_campaign_id}`);
          } else if (pauseMode === "delayed_7d") {
            const scheduledFor = new Date();
            scheduledFor.setUTCDate(scheduledFor.getUTCDate() + 7);
            await (supabase as any)
              .schema("crm").from("meta_campaign_snapshot")
              .update({ replaced_by_strategy_id: strategy_id })
              .eq("external_campaign_id", strategy.source_campaign_id);
            await (supabase as any)
              .schema("crm").from("meta_campaign_strategies")
              .update({ pause_original_scheduled_for: scheduledFor.toISOString() })
              .eq("id", strategy_id);
            addLog("info", `Delayed pause scheduled for ${scheduledFor.toISOString()}`);
          } else {
            await (supabase as any)
              .schema("crm").from("meta_campaign_snapshot")
              .update({ replaced_by_strategy_id: strategy_id })
              .eq("external_campaign_id", strategy.source_campaign_id);
            addLog("info", "Manual pause mode — only marked replaced_by_strategy_id");
          }
        } catch (pauseErr: any) {
          addLog("error", "Pause/mark step failed", errContext(pauseErr));
        }
      }
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
    const ctx = errContext(e);
    addLog("error", "Unhandled exception", { ...ctx, stack: e?.stack?.slice(0, 1000) });
    const metaUserMsg = (ctx as any).meta_error?.error_user_msg
      || (ctx as any).meta_error?.message;
    const summary = metaUserMsg || e?.message?.slice(0, 500) || "unknown";
    if (deploymentId) {
      await (supabase as any).schema("crm").from("meta_campaign_strategy_deployments").update({
        status: "failed",
        log_entries: log,
        error_summary: String(summary).slice(0, 500),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      }).eq("id", deploymentId);
    }
    return json({ error: "deployment_failed", detail: e?.message, meta_error: (ctx as any).meta_error ?? null, log }, 500);
  }
});
