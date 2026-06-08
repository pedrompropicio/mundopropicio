// crm-meta-redesign-inventory (Sprint 3a-1)
// POST { campaign_id, period_days? }
//
// Devolve inventário detalhado da campanha actual para alimentar o wizard
// de redesign (Sprint 3b):
// - Classifica criativos (winning/neutral/losing) com base em score IA +
//   performance Meta
// - Classifica adsets (winning/neutral/losing/saturated) com benchmarks
//   por optimization_goal + decay 7d
// - Inventário de audiences derivadas dos adsets winning
// - Cross-event context: outras campanhas do mesmo evento, com comparação
// - Gaps detectados: missing_phase, creative_fatigue, audience_saturation,
//   audience_gap
//
// Auth: user JWT (verify_jwt=true).
// Deploy trigger: Sprint 3a-1 fix (column rename)

import { createClient } from "npm:@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

// ─── Constantes de classificação ──────────────────────────────────────────
/**
 * Scale factor proporcional ao tamanho da campanha (Sprint 3c-1).
 * Thresholds absolutos (5000 imp, €50 spend) são certos para campanhas
 * €500+ mas catastrophicamente errados para campanhas de €95 spend total.
 * Sem isto: 13/13 criativos da Anitta v1 caíram em NEUTRAL.
 *
 * scaleFactor = clamp(campaign_spend_eur / 200, 0.15, 2.0)
 *   €30 spend  → scale 0.15 (15% dos thresholds default)
 *   €100 spend → scale 0.5
 *   €200 spend → scale 1.0 (default)
 *   €500 spend → scale 2.0 (cap)
 *   €1500+ spend → scale 2.0 (cap)
 */
function computeScaleFactor(totalSpendEur: number): number {
  if (!Number.isFinite(totalSpendEur) || totalSpendEur <= 0) return 1.0;
  const raw = totalSpendEur / 200;
  return Math.max(0.15, Math.min(2.0, raw));
}

const CREATIVE_THRESHOLDS = {
  WINNING_SCORE_MIN: 70,
  WINNING_ALT_SCORE_MIN: 60,
  WINNING_ALT_ROAS_MIN: 5,
  WINNING_ALT_IMPRESSIONS_MIN: 5000,
  LOSING_SCORE_MAX: 50,
  LOSING_ROAS_MAX: 1,
  LOSING_SPEND_MIN_EUR: 50,
};

const ADSET_THRESHOLDS = {
  CONVERSION_ROAS_WINNING: 5,
  AWARENESS_ROAS_WINNING: 2,
  RETARGETING_ROAS_WINNING: 10,
  WINNING_SPEND_MIN_EUR: 100,
  WINNING_FREQ_MAX: 3,
  LOSING_ROAS_MAX: 2,
  LOSING_SPEND_MIN_EUR: 200,
  SATURATED_FREQ_MIN: 5,
  SATURATED_ROAS_DECAY_PCT_MIN: 0.30,
};

const GAP_THRESHOLDS = {
  CREATIVE_FATIGUE_MIN_CREATIVES_SAME_ANGLE: 3,
  CREATIVE_FATIGUE_DOMINANT_RATIO: 0.6,
};

const CONVERSION_GOALS = /^(OFFSITE_CONVERSIONS|PURCHASES|OFFSITE_PURCHASES|CONVERSIONS|VALUE)$/i;
const AWARENESS_GOALS = /^(REACH|IMPRESSIONS|VIDEO_VIEWS|BRAND_AWARENESS|THRUPLAY)$/i;
const RETARGETING_RE = /retarget|rtg|remarketing/i;

// ─── Helpers ──────────────────────────────────────────────────────────────
type Agg = { spend_cents: number; impressions: number; clicks: number; purchases: number; value_cents: number; frequency_sum: number; frequency_n: number };
function emptyAgg(): Agg { return { spend_cents: 0, impressions: 0, clicks: 0, purchases: 0, value_cents: 0, frequency_sum: 0, frequency_n: 0 }; }
function addRow(a: Agg, r: any) {
  a.spend_cents += r.spend_cents ?? 0;
  a.impressions += r.impressions ?? 0;
  a.clicks += r.clicks ?? 0;
  a.purchases += r.purchases_count ?? 0;
  a.value_cents += r.purchases_value_cents ?? 0;
  if (r.frequency != null) { a.frequency_sum += r.frequency; a.frequency_n += 1; }
}
function roasOf(a: Agg): number | null { return a.spend_cents > 0 ? a.value_cents / a.spend_cents : null; }
function ctrOf(a: Agg): number | null { return a.impressions > 0 ? a.clicks / a.impressions : null; }
function cpaEurOf(a: Agg): number | null { return a.purchases > 0 ? (a.spend_cents / a.purchases) / 100 : null; }
function freqOf(a: Agg): number | null { return a.frequency_n > 0 ? a.frequency_sum / a.frequency_n : null; }

function targetingSummary(targeting: any): string {
  if (!targeting || typeof targeting !== "object") return "(targeting vazio)";
  const parts: string[] = [];
  const countries = targeting.geo_locations?.countries ?? [];
  if (countries.length > 0) parts.push(`geo: ${countries.slice(0, 3).join("/")}`);
  const ageMin = targeting.age_min, ageMax = targeting.age_max;
  if (ageMin != null || ageMax != null) parts.push(`age ${ageMin ?? "?"}-${ageMax ?? "?"}`);
  const interests = targeting.flexible_spec?.[0]?.interests ?? targeting.interests ?? [];
  if (interests.length > 0) parts.push(`interests: ${interests.slice(0, 2).map((i: any) => i.name).filter(Boolean).join(", ")}`);
  const customs = targeting.custom_audiences ?? [];
  if (customs.length > 0) parts.push(`${customs.length} custom audience(s)`);
  return parts.join(" · ") || "(broad)";
}

function detectAudienceType(targeting: any, adsetName: string): { type: 'broad' | 'interest' | 'lookalike' | 'custom' | 'retargeting'; description: string } {
  const name = (adsetName ?? "").toLowerCase();
  const t = targeting ?? {};
  const hasExcludedCustom = (t.excluded_custom_audiences ?? []).length > 0;
  if (RETARGETING_RE.test(name) || hasExcludedCustom) {
    return { type: "retargeting", description: `Retargeting/warm audiences (${adsetName})` };
  }
  const customs = t.custom_audiences ?? [];
  if (customs.length > 0) {
    const lookalikeMention = /\blal\b|lookalike/i;
    const isLalByName = lookalikeMention.test(name);
    const isLalByAudience = customs.some((a: any) => typeof a?.name === "string" && lookalikeMention.test(a.name));
    if (isLalByName || isLalByAudience || t.lookalike_spec) {
      return { type: "lookalike", description: `Lookalike (${adsetName})` };
    }
    return { type: "custom", description: `Custom audience x${customs.length} (${adsetName})` };
  }
  const interests = t.flexible_spec?.[0]?.interests ?? t.interests ?? [];
  if (interests.length > 0) {
    const top = interests.slice(0, 3).map((i: any) => i.name).filter(Boolean).join(", ");
    return { type: "interest", description: `Interesses: ${top}` };
  }
  return { type: "broad", description: `Broad ${t.age_min ?? "?"}-${t.age_max ?? "?"}` };
}

function detectAngle(headline: string | null, body: string | null): string {
  const text = `${headline ?? ""} ${body ?? ""}`.toLowerCase();
  if (!text.trim()) return "unknown";
  const patterns: Array<[string, RegExp]> = [
    ["urgency", /último|termina|esgotar|agora|rápido|última chance/],
    ["social_proof", /aclamado|fans|milhares|lotado|esgotou/],
    ["benefit", /incrível|experiência|imperdível|único/],
    ["scarcity", /limitado|restam|poucos|apenas \d/],
    ["fomo", /não percas|vais lamentar|última vez/],
    ["testimonial", /["「『'][^"」』']{8,}["」』']/],
  ];
  for (const [name, regex] of patterns) if (regex.test(text)) return name;
  return "other";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  let body: { campaign_id?: string; period_days?: number };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const campaignId = body.campaign_id;
  if (!campaignId) return json({ error: "missing_campaign_id" }, 400);
  const periodDays = Math.min(Math.max(body.period_days ?? 30, 7), 90);
  console.log(`[inventory] start campaign=${campaignId} period=${periodDays}d`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Período de análise
  const today = new Date();
  const toIso = today.toISOString().slice(0, 10);
  const fromIso = new Date(today.getTime() - (periodDays - 1) * 86400000).toISOString().slice(0, 10);
  const sevenDaysAgoIso = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const fourteenDaysAgoIso = new Date(today.getTime() - 14 * 86400000).toISOString().slice(0, 10);

  // ── 1) Campaign snapshot ─────────────────────────────────────────────
  const { data: campaign, error: campErr } = await (supabase as any)
    .schema("crm").from("meta_campaign_snapshot")
    .select("external_campaign_id, name, status, effective_status, objective, currency, linked_event_id, ad_account_id, start_time")
    .eq("external_campaign_id", campaignId)
    .maybeSingle();
  if (campErr || !campaign) return json({ error: "campaign_not_found", detail: campErr?.message }, 404);

  // ── 2) Campaign-level insights ───────────────────────────────────────
  const { data: campInsights, error: ciErr } = await (supabase as any)
    .schema("crm").from("meta_campaign_insights_daily")
    .select("date_start, spend_cents, impressions, reach, clicks, purchases_count, purchases_value_cents, frequency")
    .eq("external_campaign_id", campaignId)
    .gte("date_start", fromIso)
    .lte("date_start", toIso);
  if (ciErr) return json({ error: "campaign_insights_failed", detail: ciErr.message }, 500);

  const campAgg = emptyAgg();
  for (const r of campInsights ?? []) addRow(campAgg, r);

  // Sprint 3c-1: thresholds escalados pelo tamanho da campanha.
  // ROAS escala sqrt (mais devagar que volume); imp + spend escalam linear.
  // Floors absolutos garantem que campanhas mini ainda têm bar mínima.
  const totalSpendEur = campAgg.spend_cents / 100;
  const scale = computeScaleFactor(totalSpendEur);
  const scaledCreativeT = {
    WINNING_SCORE_MIN: CREATIVE_THRESHOLDS.WINNING_SCORE_MIN, // qualitativo
    WINNING_ALT_SCORE_MIN: CREATIVE_THRESHOLDS.WINNING_ALT_SCORE_MIN,
    WINNING_ALT_ROAS_MIN: Math.max(2, CREATIVE_THRESHOLDS.WINNING_ALT_ROAS_MIN * Math.sqrt(scale)),
    WINNING_ALT_IMPRESSIONS_MIN: Math.round(CREATIVE_THRESHOLDS.WINNING_ALT_IMPRESSIONS_MIN * scale),
    LOSING_SCORE_MAX: CREATIVE_THRESHOLDS.LOSING_SCORE_MAX,
    LOSING_ROAS_MAX: CREATIVE_THRESHOLDS.LOSING_ROAS_MAX,
    LOSING_SPEND_MIN_EUR: Math.max(10, CREATIVE_THRESHOLDS.LOSING_SPEND_MIN_EUR * scale),
  };
  const scaledAdsetT = {
    CONVERSION_ROAS_WINNING: Math.max(1.5, ADSET_THRESHOLDS.CONVERSION_ROAS_WINNING * Math.sqrt(scale)),
    AWARENESS_ROAS_WINNING: Math.max(0.5, ADSET_THRESHOLDS.AWARENESS_ROAS_WINNING * Math.sqrt(scale)),
    RETARGETING_ROAS_WINNING: Math.max(3, ADSET_THRESHOLDS.RETARGETING_ROAS_WINNING * Math.sqrt(scale)),
    WINNING_SPEND_MIN_EUR: Math.max(20, ADSET_THRESHOLDS.WINNING_SPEND_MIN_EUR * scale),
    WINNING_FREQ_MAX: ADSET_THRESHOLDS.WINNING_FREQ_MAX, // freq não escala
    LOSING_ROAS_MAX: ADSET_THRESHOLDS.LOSING_ROAS_MAX,
    LOSING_SPEND_MIN_EUR: Math.max(30, ADSET_THRESHOLDS.LOSING_SPEND_MIN_EUR * scale),
    SATURATED_FREQ_MIN: ADSET_THRESHOLDS.SATURATED_FREQ_MIN,
    SATURATED_ROAS_DECAY_PCT_MIN: ADSET_THRESHOLDS.SATURATED_ROAS_DECAY_PCT_MIN,
  };
  console.log(`[inventory] scale=${scale.toFixed(2)} (spend_eur=${totalSpendEur.toFixed(2)}) — creative_imp_min=${scaledCreativeT.WINNING_ALT_IMPRESSIONS_MIN}, losing_spend_min=€${scaledCreativeT.LOSING_SPEND_MIN_EUR.toFixed(0)}`);

  const daysRunning = campaign.start_time
    ? Math.max(1, Math.round((Date.now() - new Date(campaign.start_time).getTime()) / 86400000))
    : periodDays;

  const campaign_summary = {
    external_campaign_id: campaign.external_campaign_id,
    name: campaign.name,
    status: campaign.status,
    effective_status: campaign.effective_status,
    objective: campaign.objective,
    currency: campaign.currency ?? "EUR",
    roas: roasOf(campAgg),
    spend_eur: campAgg.spend_cents / 100,
    revenue_eur: campAgg.value_cents / 100,
    purchases: campAgg.purchases,
    days_running: daysRunning,
    linked_event_id: campaign.linked_event_id ?? null,
  };

  // ── 3) Adsets + insights ─────────────────────────────────────────────
  const { data: adsetsRaw, error: asErr } = await (supabase as any)
    .schema("crm").from("meta_adset_snapshot")
    .select("external_adset_id, name, optimization_goal, billing_event, targeting, start_time")
    .eq("external_campaign_id", campaignId);
  if (asErr) return json({ error: "adsets_failed", detail: asErr.message }, 500);
  const adsets = adsetsRaw ?? [];
  const adsetIds: string[] = adsets.map((a: any) => a.external_adset_id);

  let adsetInsightsRaw: any[] = [];
  if (adsetIds.length > 0) {
    const { data, error } = await (supabase as any)
      .schema("crm").from("meta_adset_insights_daily")
      .select("external_adset_id, date_start, spend_cents, impressions, clicks, purchases_count, purchases_value_cents, frequency")
      .in("external_adset_id", adsetIds)
      .gte("date_start", fromIso)
      .lte("date_start", toIso);
    if (error) return json({ error: "adset_insights_failed", detail: error.message }, 500);
    adsetInsightsRaw = data ?? [];
  }

  // Agregar por adset + janelas 7d/prev-7d
  type AdsetWindows = { full: Agg; last7: Agg; prev7: Agg };
  const adsetWindows = new Map<string, AdsetWindows>();
  for (const id of adsetIds) adsetWindows.set(id, { full: emptyAgg(), last7: emptyAgg(), prev7: emptyAgg() });
  for (const r of adsetInsightsRaw) {
    const w = adsetWindows.get(r.external_adset_id);
    if (!w) continue;
    addRow(w.full, r);
    if (r.date_start > sevenDaysAgoIso) addRow(w.last7, r);
    else if (r.date_start > fourteenDaysAgoIso) addRow(w.prev7, r);
  }

  const adsets_inventory = adsets.map((a: any) => {
    const w = adsetWindows.get(a.external_adset_id)!;
    const roas = roasOf(w.full);
    const spendEur = w.full.spend_cents / 100;
    const freq = freqOf(w.full);
    const purchases = w.full.purchases;
    const cpaEur = cpaEurOf(w.full);
    const roasLast7 = roasOf(w.last7);
    const roasPrev7 = roasOf(w.prev7);
    const roasDecayPct = (roasLast7 != null && roasPrev7 != null && roasPrev7 > 0)
      ? (roasLast7 - roasPrev7) / roasPrev7
      : null;

    const isRetargeting = RETARGETING_RE.test(a.name ?? "");
    const benchmark = isRetargeting
      ? scaledAdsetT.RETARGETING_ROAS_WINNING
      : CONVERSION_GOALS.test(a.optimization_goal ?? "") ? scaledAdsetT.CONVERSION_ROAS_WINNING
      : AWARENESS_GOALS.test(a.optimization_goal ?? "") ? scaledAdsetT.AWARENESS_ROAS_WINNING
      : 3;

    let verdict: "winning" | "neutral" | "losing" | "saturated";
    let reason: string;
    if (roas != null && roas > benchmark && spendEur >= scaledAdsetT.WINNING_SPEND_MIN_EUR && (freq ?? 0) < scaledAdsetT.WINNING_FREQ_MAX) {
      verdict = "winning";
      reason = `ROAS ${roas.toFixed(2)}x > benchmark ${benchmark.toFixed(1)}x, spend €${spendEur.toFixed(0)} >= €${scaledAdsetT.WINNING_SPEND_MIN_EUR.toFixed(0)}, freq ${(freq ?? 0).toFixed(2)} < ${scaledAdsetT.WINNING_FREQ_MAX}.`;
    } else if ((freq ?? 0) > scaledAdsetT.SATURATED_FREQ_MIN && roasDecayPct != null && roasDecayPct < -scaledAdsetT.SATURATED_ROAS_DECAY_PCT_MIN) {
      verdict = "saturated";
      reason = `Frequency ${(freq ?? 0).toFixed(2)} > ${scaledAdsetT.SATURATED_FREQ_MIN} e ROAS caiu ${(roasDecayPct * 100).toFixed(0)}% nos últimos 7d.`;
    } else if (roas != null && roas < scaledAdsetT.LOSING_ROAS_MAX && spendEur >= scaledAdsetT.LOSING_SPEND_MIN_EUR) {
      verdict = "losing";
      reason = `ROAS ${roas.toFixed(2)}x < ${scaledAdsetT.LOSING_ROAS_MAX} com spend €${spendEur.toFixed(0)} >= €${scaledAdsetT.LOSING_SPEND_MIN_EUR.toFixed(0)}.`;
    } else {
      verdict = "neutral";
      reason = `ROAS ${roas != null ? roas.toFixed(2) + "x" : "n/a"}, spend €${spendEur.toFixed(0)}, freq ${(freq ?? 0).toFixed(2)}.`;
    }
    const recommended_action: "inherit" | "discard" | "modify" =
      verdict === "winning" ? "inherit" :
      verdict === "losing" ? "discard" :
      verdict === "saturated" ? "modify" : "inherit";

    const daysActive = a.start_time
      ? Math.max(1, Math.round((Date.now() - new Date(a.start_time).getTime()) / 86400000))
      : daysRunning;

    return {
      external_adset_id: a.external_adset_id,
      name: a.name ?? "(sem nome)",
      optimization_goal: a.optimization_goal ?? null,
      billing_event: a.billing_event ?? null,
      targeting_summary: targetingSummary(a.targeting),
      // ADITIVO (Etapa 4): tipo de audiência por adset (broad/interest/lookalike/
      // custom/retargeting), reusando detectAudienceType. Permite ao motor de
      // escala distinguir PROSPECÇÃO de RETARGETING. Não altera nada do resto.
      audience_type: detectAudienceType(a.targeting, a.name ?? "").type,
      performance: {
        roas, spend_eur: spendEur, purchases, frequency: freq,
        cpa_eur: cpaEur, days_active: daysActive,
        roas_decay_pct: roasDecayPct,
      },
      verdict, reason, recommended_action,
    };
  });

  // ── 4) Ads + criativos (group by meta_creative_id) ───────────────────
  const { data: adsRaw } = await (supabase as any)
    .schema("crm").from("meta_ad_snapshot")
    .select("external_ad_id, external_adset_id, meta_creative_id, name")
    .eq("external_campaign_id", campaignId)
    .not("meta_creative_id", "is", null)
    .limit(200);
  const ads = adsRaw ?? [];
  const adIds: string[] = ads.map((a: any) => a.external_ad_id);

  let adInsightsRaw: any[] = [];
  if (adIds.length > 0) {
    const { data } = await (supabase as any)
      .schema("crm").from("meta_ad_insights_daily")
      .select("external_ad_id, spend_cents, impressions, clicks, purchases_count, purchases_value_cents")
      .in("external_ad_id", adIds)
      .gte("date_start", fromIso)
      .lte("date_start", toIso);
    adInsightsRaw = data ?? [];
  }
  const adAgg = new Map<string, Agg>();
  for (const id of adIds) adAgg.set(id, emptyAgg());
  for (const r of adInsightsRaw) {
    const a = adAgg.get(r.external_ad_id); if (a) addRow(a, r);
  }

  // Group por creative_id
  const creativeAdsMap = new Map<string, { ad_ids: string[]; agg: Agg }>();
  for (const ad of ads) {
    const cid = ad.meta_creative_id;
    let g = creativeAdsMap.get(cid);
    if (!g) { g = { ad_ids: [], agg: emptyAgg() }; creativeAdsMap.set(cid, g); }
    g.ad_ids.push(ad.external_ad_id);
    const a = adAgg.get(ad.external_ad_id);
    if (a) {
      g.agg.spend_cents += a.spend_cents;
      g.agg.impressions += a.impressions;
      g.agg.clicks += a.clicks;
      g.agg.purchases += a.purchases;
      g.agg.value_cents += a.value_cents;
    }
  }

  const creativeIds = [...creativeAdsMap.keys()];
  let creativeMeta: any[] = [];
  if (creativeIds.length > 0) {
    const { data } = await (supabase as any)
      .schema("crm").from("meta_creatives")
      .select("meta_creative_id, name, type, file_url, headline, body, analysis_jsonb")
      .in("meta_creative_id", creativeIds);
    creativeMeta = data ?? [];
  }
  const creativeMetaMap = new Map<string, any>();
  for (const c of creativeMeta) creativeMetaMap.set(c.meta_creative_id, c);

  const creatives_inventory = creativeIds.map((cid) => {
    const g = creativeAdsMap.get(cid)!;
    const meta = creativeMetaMap.get(cid);
    const score = typeof meta?.analysis_jsonb?.scores?.overall === "number" ? meta.analysis_jsonb.scores.overall : null;
    const roas = roasOf(g.agg);
    const ctr = ctrOf(g.agg);
    const spendEur = g.agg.spend_cents / 100;
    const impressions = g.agg.impressions;
    const purchases = g.agg.purchases;

    let verdict: "winning" | "neutral" | "losing";
    let reason: string;
    const winningPrimary = score != null && score >= scaledCreativeT.WINNING_SCORE_MIN;
    const winningAlt = score != null && score >= scaledCreativeT.WINNING_ALT_SCORE_MIN
      && roas != null && roas > scaledCreativeT.WINNING_ALT_ROAS_MIN
      && impressions >= scaledCreativeT.WINNING_ALT_IMPRESSIONS_MIN;
    // Sprint 3c-1: fallback para criativos sem score IA. Exige 2× do ROAS
    // benchmark scaled (compensa falta de signal qualitativo) + metade das
    // impressões (com floor de 500 para evitar pure-noise).
    const winningByPerf = score == null
      && roas != null && roas > scaledCreativeT.WINNING_ALT_ROAS_MIN * 2
      && impressions >= Math.max(500, scaledCreativeT.WINNING_ALT_IMPRESSIONS_MIN / 2);

    const losingByScore = score != null && score < scaledCreativeT.LOSING_SCORE_MAX;
    const losingByPerf = roas != null && roas < scaledCreativeT.LOSING_ROAS_MAX && spendEur >= scaledCreativeT.LOSING_SPEND_MIN_EUR;
    // Sprint 3c-1: zero compras com spend significativo é losing mesmo sem score.
    const losingByZero = score == null && roas != null && roas === 0
      && spendEur >= scaledCreativeT.LOSING_SPEND_MIN_EUR * 0.5;

    if (winningPrimary || winningAlt || winningByPerf) {
      verdict = "winning";
      reason = winningPrimary
        ? `Score IA ${score}/100 >= ${scaledCreativeT.WINNING_SCORE_MIN}.`
        : winningAlt
          ? `Score IA ${score}/100 + ROAS ${roas?.toFixed(2)}x com ${impressions} impressões.`
          : `ROAS ${roas?.toFixed(2)}x (>2× benchmark scaled ${scaledCreativeT.WINNING_ALT_ROAS_MIN.toFixed(1)}x) com ${impressions} impressões (sem score IA).`;
    } else if (losingByScore || losingByPerf || losingByZero) {
      verdict = "losing";
      reason = losingByScore
        ? `Score IA ${score}/100 < ${scaledCreativeT.LOSING_SCORE_MAX}.`
        : losingByPerf
          ? `ROAS ${roas?.toFixed(2)}x < ${scaledCreativeT.LOSING_ROAS_MAX} com spend €${spendEur.toFixed(0)} >= €${scaledCreativeT.LOSING_SPEND_MIN_EUR.toFixed(0)}.`
          : `Zero compras com spend €${spendEur.toFixed(0)} (sem score IA).`;
    } else {
      verdict = "neutral";
      reason = `Score ${score ?? "—"}, ROAS ${roas != null ? roas.toFixed(2) + "x" : "n/a"}, spend €${spendEur.toFixed(0)}.`;
    }
    const recommended_action: "inherit" | "discard" = verdict === "losing" ? "discard" : "inherit";

    return {
      meta_creative_id: cid,
      name: meta?.name ?? null,
      type: meta?.type ?? null,
      file_url: meta?.file_url ?? null,
      headline: meta?.headline ?? null,
      body: meta?.body ?? null,
      performance: { roas, spend_eur: spendEur, ctr, impressions, purchases, score_ai: score },
      verdict, reason, recommended_action,
    };
  });

  // ── 5) Audiences inventory (a partir dos adsets) ─────────────────────
  const audiences_inventory: Array<{
    source_adset_id: string;
    type: 'broad' | 'interest' | 'lookalike' | 'custom' | 'retargeting';
    description: string;
    verdict: 'winning' | 'saturated' | 'gap_identified';
    recommended_action: 'inherit' | 'create_new';
  }> = [];
  const seenAudienceKeys = new Set<string>();
  for (const a of adsets) {
    const sourceAdset = adsets_inventory.find((x) => x.external_adset_id === a.external_adset_id);
    if (!sourceAdset || (sourceAdset.verdict !== "winning" && sourceAdset.verdict !== "saturated")) continue;
    const detected = detectAudienceType(a.targeting, a.name ?? "");
    const key = `${detected.type}::${detected.description}`;
    if (seenAudienceKeys.has(key)) continue;
    seenAudienceKeys.add(key);
    audiences_inventory.push({
      source_adset_id: a.external_adset_id,
      type: detected.type,
      description: detected.description,
      verdict: sourceAdset.verdict === "saturated" ? "saturated" : "winning",
      recommended_action: sourceAdset.verdict === "saturated" ? "create_new" : "inherit",
    });
  }

  // ── 6) Cross-event context ───────────────────────────────────────────
  let cross_event_context: any = {
    event_id: campaign.linked_event_id ?? null,
    event_name: null,
    other_campaigns_same_event: [],
    learnings_summary: null,
  };
  if (campaign.linked_event_id) {
    const { data: eventRow } = await supabase
      .from("events").select("id, name").eq("id", campaign.linked_event_id).maybeSingle();
    cross_event_context.event_name = eventRow?.name ?? null;

    const { data: peersRaw } = await (supabase as any)
      .schema("crm").from("meta_campaign_snapshot")
      .select("external_campaign_id, name, status")
      .eq("linked_event_id", campaign.linked_event_id)
      .neq("external_campaign_id", campaignId)
      .limit(5);
    const peers = peersRaw ?? [];

    if (peers.length > 0) {
      const peerIds = peers.map((p: any) => p.external_campaign_id);
      const { data: peerInsights } = await (supabase as any)
        .schema("crm").from("meta_campaign_insights_daily")
        .select("external_campaign_id, spend_cents, impressions, clicks, purchases_count, purchases_value_cents, frequency")
        .in("external_campaign_id", peerIds)
        .gte("date_start", fromIso)
        .lte("date_start", toIso);
      const peerAggs = new Map<string, Agg>();
      for (const id of peerIds) peerAggs.set(id, emptyAgg());
      for (const r of peerInsights ?? []) {
        const a = peerAggs.get(r.external_campaign_id); if (a) addRow(a, r);
      }
      const peerCampaigns = peers.map((p: any) => {
        const a = peerAggs.get(p.external_campaign_id) ?? emptyAgg();
        return {
          external_campaign_id: p.external_campaign_id,
          name: p.name,
          status: p.status,
          roas: roasOf(a),
          spend_eur: a.spend_cents / 100,
          purchases: a.purchases,
        };
      });
      cross_event_context.other_campaigns_same_event = peerCampaigns;

      // Learnings summary
      const peerRoas = peerCampaigns.map((p) => p.roas).filter((r): r is number => r != null && Number.isFinite(r));
      const meRoas = campaign_summary.roas;
      if (peerRoas.length > 0 && meRoas != null) {
        const avgPeerRoas = peerRoas.reduce((s, r) => s + r, 0) / peerRoas.length;
        const direction = meRoas >= avgPeerRoas ? "acima" : "abaixo";
        let summary = `Outras ${peerCampaigns.length} campanha(s) do mesmo evento têm ROAS médio ${avgPeerRoas.toFixed(2)}x — esta está ${direction} do peer group (${meRoas.toFixed(2)}x).`;
        const star = peerCampaigns.find((p) => p.roas != null && p.roas > meRoas * 2);
        if (star) summary += ` Campanha "${star.name}" performa em ${star.roas!.toFixed(2)}x — vale analisar o que faz diferente.`;
        cross_event_context.learnings_summary = summary;
      }
    }
  }

  // ── 7) Gaps detection ────────────────────────────────────────────────
  const gaps_detected: Array<{
    tag: 'missing_phase' | 'creative_fatigue' | 'audience_saturation' | 'audience_gap';
    description: string;
    suggested_phase?: string;
    suggested_angle?: string;
    affected_adset_id?: string;
    suggested_audience_type?: string;
  }> = [];

  // 7a) missing_phase — considerar todas as campanhas do evento
  if (campaign.linked_event_id) {
    const eventCampaignIds: string[] = [
      campaign.external_campaign_id,
      ...(cross_event_context.other_campaigns_same_event ?? []).map((p: any) => p.external_campaign_id),
    ];
    const { data: eventCampaignDetails } = await (supabase as any)
      .schema("crm").from("meta_campaign_snapshot")
      .select("external_campaign_id, name, objective")
      .in("external_campaign_id", eventCampaignIds);
    const { data: eventAdsetDetails } = await (supabase as any)
      .schema("crm").from("meta_adset_snapshot")
      .select("external_campaign_id, name")
      .in("external_campaign_id", eventCampaignIds);

    const hasConversion = (eventCampaignDetails ?? []).some((c: any) => CONVERSION_GOALS.test(c.objective ?? ""));
    const hasRetargeting = (eventAdsetDetails ?? []).some((a: any) => RETARGETING_RE.test(a.name ?? ""));
    if (!hasConversion) {
      gaps_detected.push({
        tag: "missing_phase",
        description: "Evento não tem campanhas com objectivo de conversão (OFFSITE_CONVERSIONS/PURCHASES).",
        suggested_phase: "OFFSITE_CONVERSIONS",
      });
    }
    if (!hasRetargeting) {
      gaps_detected.push({
        tag: "missing_phase",
        description: "Evento não tem fase de retargeting de audiences quentes (VC30d/ATC14d/IC7d).",
        suggested_phase: "RETARGETING",
      });
    }
  }

  // 7b) creative_fatigue — angle dominante nos winning
  const winningCreatives = creatives_inventory.filter((c) => c.verdict === "winning");
  if (winningCreatives.length >= GAP_THRESHOLDS.CREATIVE_FATIGUE_MIN_CREATIVES_SAME_ANGLE) {
    const angleCount = new Map<string, number>();
    for (const c of winningCreatives) {
      const angle = detectAngle(c.headline, c.body);
      angleCount.set(angle, (angleCount.get(angle) ?? 0) + 1);
    }
    let dominant: { angle: string; count: number } | null = null;
    for (const [angle, count] of angleCount) {
      if (!dominant || count > dominant.count) dominant = { angle, count };
    }
    if (dominant
      && dominant.count >= GAP_THRESHOLDS.CREATIVE_FATIGUE_MIN_CREATIVES_SAME_ANGLE
      && dominant.count / winningCreatives.length >= GAP_THRESHOLDS.CREATIVE_FATIGUE_DOMINANT_RATIO
    ) {
      const allAngles: Array<[string, number]> = ["urgency", "social_proof", "benefit", "scarcity", "fomo", "testimonial"]
        .map((a) => [a, angleCount.get(a) ?? 0]);
      allAngles.sort((a, b) => a[1] - b[1]);
      const leastUsed = allAngles[0][0];
      gaps_detected.push({
        tag: "creative_fatigue",
        description: `${dominant.count}/${winningCreatives.length} criativos winning usam angle "${dominant.angle}" (${Math.round(dominant.count / winningCreatives.length * 100)}%). Considera diversificar.`,
        suggested_angle: leastUsed,
      });
    }
  }

  // 7c) audience_saturation — um gap por cada adset saturated
  for (const a of adsets_inventory) {
    if (a.verdict === "saturated") {
      gaps_detected.push({
        tag: "audience_saturation",
        description: `Adset "${a.name}": ${a.reason}`,
        affected_adset_id: a.external_adset_id,
      });
    }
  }

  // 7d) audience_gap — sem custom_audiences em NENHUM adset
  const anyCustomAudience = adsets.some((a: any) => (a.targeting?.custom_audiences ?? []).length > 0);
  if (!anyCustomAudience) {
    gaps_detected.push({
      tag: "audience_gap",
      description: "Nenhum adset usa custom audiences (compradores históricos / engagers). Lookalike de buyers tipicamente entrega ROAS 8-15x para retomos de tour.",
      suggested_audience_type: "custom_buyers_lookalike",
    });
  }

  console.log(`[inventory] done: ${creatives_inventory.length} creatives · ${adsets_inventory.length} adsets · ${audiences_inventory.length} audiences · ${gaps_detected.length} gaps`);

  return json({
    campaign_summary,
    creatives_inventory,
    adsets_inventory,
    audiences_inventory,
    cross_event_context,
    gaps_detected,
  });
});
