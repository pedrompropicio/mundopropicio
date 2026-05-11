// crm-meta-campaign-analyze (Fase 2 — diagnóstico enriquecido)
// POST { campaign_id, days_back?, from?, to? }
// Cruza campaign + adsets + ads + creative analysis e devolve diagnóstico estruturado.
// Persiste histórico em crm.meta_campaign_diagnoses.

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_MODEL = "google/gemini-2.5-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripJsonFences(t: string): string {
  let s = t.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return s.trim();
}

type InsightAgg = {
  impressions: number;
  reach: number;
  clicks: number;
  spendCents: number;
  purchases: number;
  purchasesValueCents: number;
  frequencySum: number;
  frequencyN: number;
};

function emptyAgg(): InsightAgg {
  return { impressions: 0, reach: 0, clicks: 0, spendCents: 0, purchases: 0, purchasesValueCents: 0, frequencySum: 0, frequencyN: 0 };
}

function aggregate(rows: any[]): InsightAgg {
  const a = emptyAgg();
  for (const r of rows) {
    a.impressions += r.impressions ?? 0;
    a.reach = Math.max(a.reach, r.reach ?? 0);
    a.clicks += r.clicks ?? 0;
    a.spendCents += r.spend_cents ?? 0;
    a.purchases += r.purchases_count ?? 0;
    a.purchasesValueCents += r.purchases_value_cents ?? 0;
    if (r.frequency != null) { a.frequencySum += r.frequency; a.frequencyN++; }
  }
  return a;
}

function metricsOf(a: InsightAgg) {
  const ctr = a.impressions > 0 ? a.clicks / a.impressions : 0;
  const cpcEur = a.clicks > 0 ? (a.spendCents / a.clicks) / 100 : 0;
  const cpaEur = a.purchases > 0 ? (a.spendCents / a.purchases) / 100 : null;
  const roas = a.spendCents > 0 ? a.purchasesValueCents / a.spendCents : null;
  const freq = a.frequencyN > 0 ? a.frequencySum / a.frequencyN : 0;
  return {
    spend_eur: a.spendCents / 100,
    revenue_eur: a.purchasesValueCents / 100,
    impressions: a.impressions,
    reach: a.reach,
    clicks: a.clicks,
    purchases: a.purchases,
    ctr,
    cpc_eur: cpcEur,
    cpa_eur: cpaEur,
    roas,
    frequency: freq,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { campaign_id?: string; days_back?: number; from?: string; to?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const campaignId = body.campaign_id;
  if (!campaignId) return json({ error: "missing_campaign_id" }, 400);

  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  let fromDate: string, toDate: string, daysBack: number;
  if (body.from && body.to && isoRe.test(body.from) && isoRe.test(body.to) && body.from <= body.to) {
    fromDate = body.from; toDate = body.to;
    const f = new Date(fromDate + "T00:00:00Z").getTime();
    const t = new Date(toDate + "T00:00:00Z").getTime();
    daysBack = Math.min(Math.max(Math.round((t - f) / 86400000) + 1, 1), 365);
  } else {
    daysBack = Math.min(Math.max(body.days_back ?? 30, 7), 90);
    const today = new Date();
    toDate = today.toISOString().slice(0, 10);
    const since = new Date(today); since.setUTCDate(since.getUTCDate() - (daysBack - 1));
    fromDate = since.toISOString().slice(0, 10);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Auth user (para created_by) ──
  let createdBy: string | null = null;
  try {
    const { data: u } = await supabase.auth.getUser();
    createdBy = u?.user?.id ?? null;
  } catch { /* noop */ }

  // ── 1) Campanha ──
  const { data: campaign, error: campErr } = await (supabase as any)
    .schema("crm")
    .from("meta_campaign_snapshot")
    .select("company_id, connection_id, ad_account_id, external_campaign_id, name, status, effective_status, objective, currency, linked_event_id, daily_budget_cents, lifetime_budget_cents")
    .eq("external_campaign_id", campaignId)
    .maybeSingle();
  if (campErr || !campaign) return json({ error: "campaign_not_found", detail: campErr?.message }, 404);

  // ── 2) Insights da campanha ──
  const { data: campInsights, error: ciErr } = await (supabase as any)
    .schema("crm")
    .from("meta_campaign_insights_daily")
    .select("date_start, impressions, reach, frequency, clicks, spend_cents, purchases_count, purchases_value_cents")
    .eq("external_campaign_id", campaignId)
    .gte("date_start", fromDate)
    .lte("date_start", toDate)
    .order("date_start", { ascending: true });
  if (ciErr) return json({ error: "campaign_insights_failed", detail: ciErr.message }, 500);
  if (!campInsights || campInsights.length === 0) {
    return json({ error: "no_data", message: "Sem dados de insights suficientes para esta campanha. Sincronize primeiro." }, 422);
  }
  const campAgg = aggregate(campInsights);
  const campMetrics = metricsOf(campAgg);

  // ── 3) Adsets da campanha ──
  const { data: adsets } = await (supabase as any)
    .schema("crm")
    .from("meta_adset_snapshot")
    .select("external_adset_id, name, status, effective_status, optimization_goal, billing_event")
    .eq("external_campaign_id", campaignId);
  const adsetIds: string[] = (adsets ?? []).map((a: any) => a.external_adset_id);

  let adsetInsights: any[] = [];
  if (adsetIds.length > 0) {
    const { data } = await (supabase as any)
      .schema("crm")
      .from("meta_adset_insights_daily")
      .select("external_adset_id, impressions, reach, frequency, clicks, spend_cents, purchases_count, purchases_value_cents")
      .in("external_adset_id", adsetIds)
      .gte("date_start", fromDate)
      .lte("date_start", toDate);
    adsetInsights = data ?? [];
  }

  const adsetMap = new Map<string, any>();
  for (const a of adsets ?? []) adsetMap.set(a.external_adset_id, { ...a, _agg: emptyAgg() });
  for (const r of adsetInsights) {
    const m = adsetMap.get(r.external_adset_id);
    if (!m) continue;
    m._agg.impressions += r.impressions ?? 0;
    m._agg.reach = Math.max(m._agg.reach, r.reach ?? 0);
    m._agg.clicks += r.clicks ?? 0;
    m._agg.spendCents += r.spend_cents ?? 0;
    m._agg.purchases += r.purchases_count ?? 0;
    m._agg.purchasesValueCents += r.purchases_value_cents ?? 0;
    if (r.frequency != null) { m._agg.frequencySum += r.frequency; m._agg.frequencyN++; }
  }

  const adsetSummaries = Array.from(adsetMap.values())
    .map((a: any) => ({ ...a, _metrics: metricsOf(a._agg) }))
    .sort((a, b) => b._metrics.spend_eur - a._metrics.spend_eur)
    .slice(0, 20);

  // ── 4) Ads da campanha ──
  let ads: any[] = [];
  if (adsetIds.length > 0) {
    const { data } = await (supabase as any)
      .schema("crm")
      .from("meta_ad_snapshot")
      .select("external_ad_id, external_adset_id, name, status, effective_status, meta_creative_id, recommendations, issues_info")
      .in("external_adset_id", adsetIds);
    ads = data ?? [];
  }
  const adIds: string[] = ads.map((a) => a.external_ad_id);

  let adInsights: any[] = [];
  if (adIds.length > 0) {
    const { data } = await (supabase as any)
      .schema("crm")
      .from("meta_ad_insights_daily")
      .select("external_ad_id, impressions, reach, frequency, clicks, spend_cents, purchases_count, purchases_value_cents")
      .in("external_ad_id", adIds)
      .gte("date_start", fromDate)
      .lte("date_start", toDate);
    adInsights = data ?? [];
  }

  const adMap = new Map<string, any>();
  for (const a of ads) adMap.set(a.external_ad_id, { ...a, _agg: emptyAgg() });
  for (const r of adInsights) {
    const m = adMap.get(r.external_ad_id);
    if (!m) continue;
    m._agg.impressions += r.impressions ?? 0;
    m._agg.reach = Math.max(m._agg.reach, r.reach ?? 0);
    m._agg.clicks += r.clicks ?? 0;
    m._agg.spendCents += r.spend_cents ?? 0;
    m._agg.purchases += r.purchases_count ?? 0;
    m._agg.purchasesValueCents += r.purchases_value_cents ?? 0;
    if (r.frequency != null) { m._agg.frequencySum += r.frequency; m._agg.frequencyN++; }
  }

  // ── 5) Creatives analisadas ──
  const creativeIds = Array.from(new Set(ads.map((a) => a.meta_creative_id).filter(Boolean)));
  const creativeMap = new Map<string, any>();
  if (creativeIds.length > 0) {
    const { data: crs } = await (supabase as any)
      .schema("crm")
      .from("meta_creatives")
      .select("meta_creative_id, name, type, analysis_jsonb, analyzed_at")
      .in("meta_creative_id", creativeIds);
    for (const c of crs ?? []) creativeMap.set(c.meta_creative_id, c);
  }
  let creativesAnalyzedCount = 0;
  for (const c of creativeMap.values()) if (c.analysis_jsonb) creativesAnalyzedCount++;

  const adSummaries = Array.from(adMap.values())
    .map((a: any) => {
      const cr = a.meta_creative_id ? creativeMap.get(a.meta_creative_id) : null;
      const an = cr?.analysis_jsonb;
      const scoresObj = an?.scores ?? null;
      return {
        ...a,
        _metrics: metricsOf(a._agg),
        _creative: cr ? {
          name: cr.name,
          type: cr.type,
          analyzed: !!an,
          scores: scoresObj,
          verdict: an?.verdict ?? null,
        } : null,
      };
    })
    .sort((a, b) => b._metrics.spend_eur - a._metrics.spend_eur)
    .slice(0, 30);

  // ── 6) Prompt ──
  const adsetBlock = adsetSummaries.map((a: any) => {
    const m = a._metrics;
    return `  - id=${a.external_adset_id} | "${a.name}" | status=${a.effective_status ?? a.status} | goal=${a.optimization_goal ?? "?"} | spend=€${m.spend_eur.toFixed(2)} | rev=€${m.revenue_eur.toFixed(2)} | ROAS=${m.roas != null ? m.roas.toFixed(2) + "x" : "n/a"} | CPA=${m.cpa_eur != null ? "€" + m.cpa_eur.toFixed(2) : "n/a"} | CTR=${(m.ctr * 100).toFixed(2)}% | freq=${m.frequency.toFixed(2)} | imp=${m.impressions} | purch=${m.purchases}`;
  }).join("\n") || "  (sem adsets)";

  const adBlock = adSummaries.map((a: any) => {
    const m = a._metrics;
    const cr = a._creative;
    const crStr = cr
      ? (cr.analyzed
        ? `creative="${cr.name}" type=${cr.type} analyzed=YES overall=${cr.scores?.overall ?? "?"} hook=${cr.scores?.hook ?? "?"} cta=${cr.scores?.cta_clarity ?? cr.scores?.cta_presence ?? "?"} verdict=${cr.verdict ?? "?"}`
        : `creative="${cr.name}" type=${cr.type} analyzed=NO`)
      : "creative=none";
    const recs = a.recommendations ? ` | meta_recs=${JSON.stringify(a.recommendations).slice(0, 200)}` : "";
    const issues = a.issues_info ? ` | meta_issues=${JSON.stringify(a.issues_info).slice(0, 200)}` : "";
    return `  - id=${a.external_ad_id} adset=${a.external_adset_id} | "${a.name}" | status=${a.effective_status ?? a.status} | spend=€${m.spend_eur.toFixed(2)} | rev=€${m.revenue_eur.toFixed(2)} | ROAS=${m.roas != null ? m.roas.toFixed(2) + "x" : "n/a"} | CTR=${(m.ctr * 100).toFixed(2)}% | freq=${m.frequency.toFixed(2)} | ${crStr}${recs}${issues}`;
  }).join("\n") || "  (sem ads)";

  const prompt = `⚠️ IDIOMA OBRIGATÓRIO: TODOS OS CAMPOS TEXTUAIS DA RESPOSTA JSON DEVEM SER ESCRITOS EM PORTUGUÊS (PT-BR preferencial — público maioritário é Brasil).
Mantém em inglês APENAS: nomes próprios, marcas, IDs, e termos técnicos (hook, CTA, ROAS, CTR, CPA, scroll, pacing).
ENUMS INTERNOS — ficam em INGLÊS (são chaves técnicas):
- severity: "critical" | "warning" | "healthy"
- verdict (adset/ad): "pause" | "scale" | "optimize" | "keep"
- priority: "high" | "medium" | "low"
- target_type: "campaign" | "adset" | "ad"

És um especialista sênior em Meta Ads para eventos ao vivo (concertos, festivais) na Mundo Propício, atuando em Portugal e Brasil. Análise GRANULAR e CRÍTICA: olha campanha → adsets → ads → criativos. Cruza dados quantitativos (gasto, ROAS, CTR, CPA, frequência) com qualitativos (scores dos creatives quando disponíveis).

CAMPANHA
- ID: ${campaign.external_campaign_id}
- Nome: ${campaign.name}
- Objetivo: ${campaign.objective ?? "N/A"}
- Status efetivo: ${campaign.effective_status ?? campaign.status}
- Moeda: ${campaign.currency ?? "EUR"}
- Período analisado: ${fromDate} → ${toDate} (${campInsights.length} dias com dados)

MÉTRICAS AGREGADAS DA CAMPANHA
- Gasto: €${campMetrics.spend_eur.toFixed(2)} | Receita: €${campMetrics.revenue_eur.toFixed(2)}
- ROAS: ${campMetrics.roas != null ? campMetrics.roas.toFixed(2) + "x" : "n/a"} | CPA: ${campMetrics.cpa_eur != null ? "€" + campMetrics.cpa_eur.toFixed(2) : "n/a"}
- Impressões: ${campMetrics.impressions} | Alcance: ${campMetrics.reach} | Cliques: ${campMetrics.clicks}
- CTR: ${(campMetrics.ctr * 100).toFixed(2)}% | CPC: €${campMetrics.cpc_eur.toFixed(2)} | Frequência média: ${campMetrics.frequency.toFixed(2)}
- Compras: ${campMetrics.purchases}

ADSETS (${adsets?.length ?? 0} total, top ${adsetSummaries.length} por gasto)
${adsetBlock}

ADS (${ads.length} total, top ${adSummaries.length} por gasto)
${adBlock}

CRIATIVOS ANALISADOS PELA IA: ${creativesAnalyzedCount} de ${creativeIds.length}.
Quando o ad tem creative analysis (scores hook/pacing/CTA/audio/compliance/alignment), USA esses scores em "creative_insights" para correlacionar com performance real (ex: hook 40 + CTR 0.5% = correlação confirmada; agir).

BENCHMARKS CALIBRADOS MUNDO PROPÍCIO (eventos PT/BR):
- ROAS mediana interna 4.5x. Excelente >=8x. Bom 5–8x. Regular 3–5x. Fraco 2–3x. Mau <2x.
- CTR setor A&E ~1.16%. Top 25% >3%. Regular 1.2–2%. Fraco <0.9%.
- CPC A&E ~€0.45. Bom <€0.40. Caro 0.6–1. Muito caro >€1.
- Frequência: <1.5 ótimo, 1.5–2.5 bom, 2.5–3.5 ok, 3.5–5 atenção, >5 saturado.
- Funil bilheteira: ATC/VC ~20%, IC/ATC ~50%, Purchase/IC ~30%.

REGRAS:
- Sê crítico, direto, NÃO diplomata. NÃO chames "excelente" a uma campanha em linha com a mediana (4.5x).
- Não inventes IDs nem nomes. Usa exatamente os IDs e nomes fornecidos acima.
- adset_breakdown: máximo 10 adsets (mais relevantes / mais críticos).
- ad_breakdown: máximo 15 ads (mais relevantes / mais críticos).
- top_3_actions: exatamente 3, ordenadas por impacto (a mais urgente primeiro). target_external_id deve ser o ID exato (campaign/adset/ad).
- creative_insights: 2–5 frases cruzando scores creativos com métricas reais. Se nenhum creative foi analisado, escreve "Nenhum creative ainda analisado pela IA — recomendamos correr análise de criativos para diagnóstico mais preciso."
- overall_score: 0–100. severity derivada: <40 critical | 40–70 warning | >70 healthy.

Responde APENAS com JSON puro (SEM markdown fences, SEM texto antes/depois) com este schema EXATO:

{
  "overall_score": <number 0-100>,
  "severity": "critical" | "warning" | "healthy",
  "summary_pt": "2-3 frases em PT a resumir o estado da campanha",
  "campaign_diagnosis": {
    "strengths": ["...", "..."],
    "weaknesses": ["...", "..."],
    "key_metrics_analysis": "1-2 parágrafos analisando ROAS, CTR, CPA, frequência face aos benchmarks"
  },
  "adset_breakdown": [
    {
      "external_adset_id": "<id exato>",
      "name": "<nome exato>",
      "verdict": "pause|scale|optimize|keep",
      "reason": "1-2 frases",
      "priority": "high|medium|low",
      "suggested_actions": ["ação 1", "ação 2"]
    }
  ],
  "ad_breakdown": [
    {
      "external_ad_id": "<id exato>",
      "name": "<nome exato>",
      "creative_score": <number 0-100 ou null>,
      "verdict": "pause|scale|optimize|keep",
      "reason": "1-2 frases",
      "priority": "high|medium|low",
      "suggested_actions": ["ação 1"]
    }
  ],
  "top_3_actions": [
    {
      "action": "ação curta e específica",
      "target_type": "campaign|adset|ad",
      "target_external_id": "<id exato>",
      "rationale": "porquê esta acção, em 1 frase",
      "expected_impact": "impacto esperado em 1 frase"
    }
  ],
  "creative_insights": "texto livre cruzando scores criativos com performance"
}`;

  // ── 7) Chamada Lovable AI ──
  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: "És um especialista sênior em Meta Ads para eventos ao vivo. Respondes SEMPRE com JSON puro (sem fences) e em PT-BR." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!aiResp.ok) {
    const t = await aiResp.text();
    console.error("[analyze] AI error", aiResp.status, t.slice(0, 300));
    if (aiResp.status === 429) return json({ error: "rate_limit", message: "Limite de pedidos IA atingido. Tenta em 1 min." }, 429);
    if (aiResp.status === 402) return json({ error: "credits_exhausted", message: "Créditos Lovable AI esgotados." }, 402);
    return json({ error: "ai_failed", detail: t.slice(0, 200) }, 502);
  }
  const aiJson = await aiResp.json();
  const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
  if (!content) return json({ error: "ai_empty_response" }, 502);

  let diagnosis: any;
  try { diagnosis = JSON.parse(stripJsonFences(content)); }
  catch (e) {
    console.error("[analyze] parse error:", e, content.slice(0, 500));
    return json({ error: "ai_invalid_json", detail: content.slice(0, 200) }, 502);
  }

  // Normaliza severity face ao score caso a IA discorde
  const score = Number(diagnosis.overall_score) || 0;
  let severity: string = String(diagnosis.severity ?? "warning");
  if (!["critical", "warning", "healthy"].includes(severity)) {
    severity = score < 40 ? "critical" : score <= 70 ? "warning" : "healthy";
  }

  const summaryText: string = String(diagnosis.summary_pt ?? "").slice(0, 1000);

  // ── 8) Persistir histórico ──
  let diagnosisId: string | null = null;
  try {
    const { data: ins, error: insErr } = await (supabase as any)
      .schema("crm")
      .from("meta_campaign_diagnoses")
      .insert({
        company_id: campaign.company_id,
        connection_id: campaign.connection_id,
        ad_account_id: campaign.ad_account_id,
        external_campaign_id: campaign.external_campaign_id,
        campaign_name: campaign.name,
        period_from: fromDate,
        period_to: toDate,
        diagnosis_jsonb: diagnosis,
        summary_text: summaryText,
        overall_score: score,
        severity,
        creatives_analyzed_count: creativesAnalyzedCount,
        adsets_count: adsets?.length ?? 0,
        ads_count: ads.length,
        ai_model: AI_MODEL,
        created_by: createdBy,
      })
      .select("id")
      .maybeSingle();
    if (insErr) console.error("[analyze] persist error:", insErr);
    diagnosisId = ins?.id ?? null;
  } catch (e) {
    console.error("[analyze] persist exception:", e);
  }

  return json({
    diagnosis_id: diagnosisId,
    campaign: {
      external_campaign_id: campaign.external_campaign_id,
      name: campaign.name,
      status: campaign.status,
      effective_status: campaign.effective_status,
      objective: campaign.objective,
      currency: campaign.currency ?? "EUR",
    },
    period: { from: fromDate, to: toDate, days_back: daysBack, days_with_data: campInsights.length },
    counts: {
      adsets: adsets?.length ?? 0,
      ads: ads.length,
      creatives_total: creativeIds.length,
      creatives_analyzed: creativesAnalyzedCount,
    },
    metrics: campMetrics,
    diagnosis,
    severity,
    overall_score: score,
    ai_model: AI_MODEL,
    generated_at: new Date().toISOString(),
  });
});
