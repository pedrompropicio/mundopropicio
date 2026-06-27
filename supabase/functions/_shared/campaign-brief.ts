// _shared/campaign-brief.ts
// Brief determinístico único (DR-2026-06-26 ponto 3 + DR-2026-06-26b + DR-2026-06-27b).
// READ-ONLY. Sem LLM. Não trunca nada — o caller serializa/trunca.
//
// Critério ÚNICO de "vencedor" (D1): rácio ROAS puro, igual ao redesign.
//   winner se creative_roas >= caps.target_blended_roas * 0.6,
//   gates spend>=€50 e purchases>=3;
//   abaixo dos gates → "inconclusive"; senão → "loser".
//
// Onda 1 (DR-2026-06-27b): acrescenta trajectory, daily_series, viability,
// peers enriquecidos, audience_ranking (co-presence), adset_saturation,
// creative fatigue, format_gaps. Todas as fórmulas/constantes são EXTRAÍDAS
// do crm-meta-campaign-redesign — sem inventar thresholds.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.39.0";

const GRAPH_API_VERSION = "v21.0";

// ────────────────────────────────────────────────────────────────────────────
// Constantes (espelham redesign — fonte das regras)
// ────────────────────────────────────────────────────────────────────────────

// Criativos (redesign L39-41)
const CREATIVE_MIN_SPEND_EUR = 50;
const CREATIVE_MIN_PURCHASES = 3;
const CREATIVE_WINNER_ROAS_RATIO = 0.6;

// Viabilidade (redesign L46-47, L973-977)
const TICKET_AVG_FALLBACK_EUR = 25;
const STATISTICAL_FLOOR_SPEND_EUR = 2000;
const STATISTICAL_FLOOR_PURCHASES = 50;

// Trajectory (redesign L28-31, L202-210)
const TRAJECTORY_STRONG_UPTREND_RATIO = 1.5;
const TRAJECTORY_UPTREND_RATIO = 1.15;
const TRAJECTORY_DOWNTREND_RATIO = 0.85;
const TRAJECTORY_STRONG_DOWNTREND_RATIO = 0.7;

// Saturação adset / fadiga criativa — herdam 1.15/0.85 dos ratios de trajectory.
const SATURATION_FREQ_UP_RATIO = 1.15;
const SATURATION_CTR_DOWN_RATIO = 0.85;
const SATURATION_CPM_UP_RATIO = 1.15;
const SATURATION_MIN_IMPRESSIONS = 1000;

const FATIGUE_ROAS_DROP_RATIO = 0.85;
const FATIGUE_FREQ_MIN = 2.0;
const FATIGUE_MIN_SPEND_EUR = 25;

// Format gaps
const CANONICAL_FORMAT_TYPES = ["video", "image", "carousel"] as const;
const FORMAT_UNDERREPRESENTED_SHARE = 0.20;

const DAILY_SERIES_MAX_DAYS = 90;

// ────────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ────────────────────────────────────────────────────────────────────────────

export type BudgetCaps = {
  target_blended_roas: number;          // D5 — passado pelo caller
  daily_budget_cents?: number | null;
  lifetime_budget_cents?: number | null;
  roas_floor?: number | null;
  end_time?: string | null;
};

export type WinnerLabel = "winner" | "loser" | "inconclusive";

export type TrajectoryString =
  | "strong_uptrend"
  | "uptrend"
  | "stable"
  | "downtrend"
  | "strong_downtrend"
  | "insufficient_data";

export type GapSeverity = "comfortable" | "stretch" | "aggressive" | "unrealistic";

export type CreativePerformance = {
  spend_eur: number;
  purchases_count: number;
  purchases_value_eur: number;
  roas: number | null;
};

export type CreativeFatigue = {
  roas_7d: number | null;
  roas_prev7d: number | null;
  frequency_7d: number | null;
  spend_7d_eur: number;
  fatigued: boolean;
};

export type WinnerPacket = {
  meta_creative_id: string;
  ad_name: string | null;
  library: {
    id?: string;
    name?: string | null;
    type?: string | null;
    file_url?: string | null;
    headline?: string | null;
    body?: string | null;
    cta_type?: string | null;
    link_url?: string | null;
  } | null;
  performance: CreativePerformance;
  label: WinnerLabel;
  fatigue?: CreativeFatigue;
};

export type AudiencePacket = {
  id: string;
  name: string;
  subtype?: string | null;
  approximate_count_lower_bound?: number | null;
  approximate_count_upper_bound?: number | null;
};

export type AdsetSummary = {
  external_adset_id: string;
  name: string | null;
  optimization_goal: string | null;
  billing_event: string | null;
  daily_budget_cents?: number | null;
  lifetime_budget_cents?: number | null;
};

export type PeerSummary = {
  external_campaign_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  spend_eur: number;
  purchases: number;
  roas: number | null;
  // Onda 1 — enriquecidos
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  ctr: number | null;     // clicks / impressions
  cpm_eur: number | null; // (spend / impressions) * 1000
};

export type EventContext = {
  id: string | null;
  name: string | null;
  date: string | null;
  effective_date: string | null;
  event_date_source: string | null;
  days_until: number | null;
  tickets_total: number | null;
  location: string | null;
  ticketing_url: string | null;
};

export type ROASBuckets = {
  roas_7d: number | null;
  roas_28d: number | null;
  roas_lifetime: number | null;
};

export type DailyPoint = {
  date_start: string;
  spend_cents: number;
  purchases_count: number;
  purchases_value_cents: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
};

export type Viability = {
  target_roas: number;
  current_roas: number;
  trajectory: TrajectoryString;
  event_goal_revenue_eur: number;
  days_until: number;
  current_daily_spend_eur: number;
  projected_purchases: number;
  spend_needed_for_goal_eur: number | null;
  daily_spend_needed_eur: number | null;
  current_projected_spend_eur: number;
  meets_statistical_floor: boolean;
  roas_gap: number | null;
  gap_severity: GapSeverity;
  // constantes usadas — auditabilidade
  constants: {
    ticket_avg_fallback_eur: number;
    statistical_floor_spend_eur: number;
    statistical_floor_purchases: number;
  };
};

export type AudienceRankingItem = {
  audience_id: string;
  name: string | null;
  used_in_adsets: string[];
  spend_eur: number;
  purchases_count: number;
  purchases_value_eur: number;
  roas: number | null;
  label: WinnerLabel;
  attribution: "co_presence";
};

export type AudienceRanking = {
  note: string;
  items: AudienceRankingItem[];
};

export type AdsetSaturationItem = {
  external_adset_id: string;
  name: string | null;
  frequency_a: number | null;
  frequency_b: number | null;
  ctr_a: number | null;
  ctr_b: number | null;
  cpm_a_eur: number | null;
  cpm_b_eur: number | null;
  impressions_a: number;
  impressions_b: number;
  saturating: boolean;
};

export type FormatGaps = {
  winners_by_type: Record<string, number>;
  types_missing: string[];
  types_underrepresented: string[];
  canonical_types: string[];
};

export type CampaignBrief = {
  generated_at: string;
  schema_version: 2;

  campaign: {
    external_campaign_id: string;
    company_id: string;
    connection_id: string;
    ad_account_id: string;
    name: string | null;
    status: string | null;
    effective_status: string | null;
    objective: string | null;
    currency: string | null;
    linked_event_id: string | null;
    daily_budget_cents: number | null;
    lifetime_budget_cents: number | null;
  };

  caps: BudgetCaps;
  winner_roas_threshold: number;       // = caps.target_blended_roas * 0.6

  event: EventContext;

  diagnosis_360: Record<string, unknown> | null;

  roas_buckets: ROASBuckets;
  trajectory: TrajectoryString;
  daily_series: DailyPoint[];

  adsets: AdsetSummary[];

  winners_packet: WinnerPacket[];

  reference: null | {
    external_campaign_id: string;
    name: string | null;
    creatives: WinnerPacket[];
    adsets: AdsetSummary[];
  };

  audiences: AudiencePacket[];

  peers: PeerSummary[];

  viability: Viability | null;
  audience_ranking: AudienceRanking;
  adset_saturation: AdsetSaturationItem[];
  format_gaps: FormatGaps;

  meta: {
    graph_api_version: string;
    rules: {
      winner_min_spend_eur: number;
      winner_min_purchases: number;
      winner_roas_ratio: number;
      ticket_avg_fallback_eur: number;
      statistical_floor_spend_eur: number;
      statistical_floor_purchases: number;
      saturation_freq_up_ratio: number;
      saturation_ctr_down_ratio: number;
      saturation_cpm_up_ratio: number;
      fatigue_roas_drop_ratio: number;
      fatigue_freq_min: number;
      fatigue_min_spend_eur: number;
    };
    warnings: string[];
  };
};

export type BuildBriefArgs = {
  supabase: SupabaseClient;
  campaign_id: string;
  caps: BudgetCaps;
  reference_campaign_id?: string | null;
  period_days?: number;
  meta_access_token?: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ────────────────────────────────────────────────────────────────────────────

type Agg = {
  spendCents: number; purchases: number; purchasesValueCents: number;
};
const emptyAgg = (): Agg => ({ spendCents: 0, purchases: 0, purchasesValueCents: 0 });
function aggregateInto(t: Agg, r: any) {
  t.spendCents += Number(r.spend_cents ?? 0);
  t.purchases += Number(r.purchases_count ?? 0);
  t.purchasesValueCents += Number(r.purchases_value_cents ?? 0);
}
function roasOf(a: Agg): number | null {
  return a.spendCents > 0 ? Math.round((a.purchasesValueCents / a.spendCents) * 10000) / 10000 : null;
}
function round2(n: number): number { return Math.round(n * 100) / 100; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }

// classifyTrajectory — espelha redesign L202-210
function classifyTrajectory(roas7d: number | null, roas28d: number | null): TrajectoryString {
  if (roas7d == null || roas28d == null || roas28d <= 0) return "insufficient_data";
  const ratio = roas7d / roas28d;
  if (ratio >= TRAJECTORY_STRONG_UPTREND_RATIO) return "strong_uptrend";
  if (ratio >= TRAJECTORY_UPTREND_RATIO) return "uptrend";
  if (ratio >= TRAJECTORY_DOWNTREND_RATIO) return "stable";
  if (ratio >= TRAJECTORY_STRONG_DOWNTREND_RATIO) return "downtrend";
  return "strong_downtrend";
}

function normalizeAdAccountId(raw: string): string {
  const s = (raw ?? "").toString().trim();
  if (!s) return "";
  return s.startsWith("act_") ? s : `act_${s}`;
}

type EffDate = { ms: number; source: "master" | "child" | "event_dates"; is_future: boolean };
function resolveEffectiveEventDate(
  masterDate: string | null,
  children: Array<{ date: string | null }>,
  eventDates: Array<{ date: string | null }>,
): { effectiveMs: number | null; source: EffDate["source"] | null } {
  const now = Date.now();
  const all: EffDate[] = [];
  const push = (d: string | null | undefined, s: EffDate["source"]) => {
    if (!d) return;
    const t = new Date(d).getTime();
    if (!Number.isFinite(t)) return;
    all.push({ ms: t, source: s, is_future: t >= now });
  };
  push(masterDate, "master");
  for (const c of children) push(c.date, "child");
  for (const e of eventDates) push(e.date, "event_dates");
  if (all.length === 0) return { effectiveMs: null, source: null };
  const futures = all.filter(d => d.is_future);
  const pick = futures.length
    ? futures.reduce((a, b) => (a.ms <= b.ms ? a : b))
    : all.reduce((a, b) => (a.ms >= b.ms ? a : b));
  return { effectiveMs: pick.ms, source: pick.source };
}

/**
 * Classifica criativos pela regra D1 + computa fatigue (Onda 1).
 * Lê meta_ad_snapshot + meta_creatives + meta_ad_insights_daily.
 */
async function classifyCreativesForCampaign(
  supabase: SupabaseClient,
  companyId: string,
  externalCampaignId: string,
  winnerRoasThreshold: number,
  computeFatigue: boolean,
): Promise<WinnerPacket[]> {
  const sb: any = supabase;

  const { data: ads } = await sb
    .schema("crm").from("meta_ad_snapshot")
    .select("external_ad_id, meta_creative_id, name, effective_status")
    .eq("company_id", companyId)
    .eq("external_campaign_id", externalCampaignId)
    .not("meta_creative_id", "is", null);

  const inheritedMap = new Map<string, { meta_creative_id: string; ad_name: string | null; library: any | null }>();
  const adToCreative = new Map<string, string>();
  for (const a of ads ?? []) {
    if (!a.meta_creative_id) continue;
    if (a.external_ad_id) adToCreative.set(a.external_ad_id, a.meta_creative_id);
    if (!inheritedMap.has(a.meta_creative_id)) {
      inheritedMap.set(a.meta_creative_id, { meta_creative_id: a.meta_creative_id, ad_name: a.name ?? null, library: null });
    }
  }
  const inheritedIds = [...inheritedMap.keys()];
  if (inheritedIds.length === 0) return [];

  const { data: lib } = await sb
    .schema("crm").from("meta_creatives")
    .select("id, name, type, file_url, headline, body, cta_type, link_url, meta_creative_id")
    .in("meta_creative_id", inheritedIds);
  for (const c of lib ?? []) {
    const slot = inheritedMap.get(c.meta_creative_id);
    if (slot) slot.library = c;
  }

  // Insights por ad — selecionamos também date_start e frequency para fatigue.
  const perfByCreative = new Map<string, Agg>();
  for (const id of inheritedIds) perfByCreative.set(id, emptyAgg());

  // Fatigue: por criativo, agregados 7d / 8-14d ant.
  type FatAgg = { spendCents: number; purchasesValueCents: number; freqSum: number; freqN: number };
  const emptyFat = (): FatAgg => ({ spendCents: 0, purchasesValueCents: 0, freqSum: 0, freqN: 0 });
  const fat7 = new Map<string, FatAgg>();
  const fatPrev = new Map<string, FatAgg>();

  const today = new Date();
  const cutoff7 = new Date(today); cutoff7.setUTCDate(cutoff7.getUTCDate() - 6);
  const cutoffPrevStart = new Date(today); cutoffPrevStart.setUTCDate(cutoffPrevStart.getUTCDate() - 13);
  const cutoffPrevEnd = new Date(today); cutoffPrevEnd.setUTCDate(cutoffPrevEnd.getUTCDate() - 7);
  const c7 = cutoff7.toISOString().slice(0, 10);
  const cPrevStart = cutoffPrevStart.toISOString().slice(0, 10);
  const cPrevEnd = cutoffPrevEnd.toISOString().slice(0, 10);

  const adIds = [...adToCreative.keys()];
  if (adIds.length > 0) {
    const selectCols = computeFatigue
      ? "external_ad_id, date_start, spend_cents, purchases_value_cents, purchases_count, frequency"
      : "external_ad_id, spend_cents, purchases_value_cents, purchases_count";
    const { data: insights } = await sb
      .schema("crm").from("meta_ad_insights_daily")
      .select(selectCols)
      .eq("company_id", companyId)
      .eq("external_campaign_id", externalCampaignId)
      .in("external_ad_id", adIds);
    for (const r of insights ?? []) {
      const cid = adToCreative.get(r.external_ad_id);
      if (!cid) continue;
      const agg = perfByCreative.get(cid)!;
      aggregateInto(agg, r);

      if (computeFatigue && r.date_start) {
        const d = r.date_start as string;
        const spend = Number(r.spend_cents ?? 0);
        const pv = Number(r.purchases_value_cents ?? 0);
        const f = r.frequency != null ? Number(r.frequency) : null;
        if (d >= c7) {
          if (!fat7.has(cid)) fat7.set(cid, emptyFat());
          const x = fat7.get(cid)!;
          x.spendCents += spend; x.purchasesValueCents += pv;
          if (f != null) { x.freqSum += f; x.freqN++; }
        } else if (d >= cPrevStart && d <= cPrevEnd) {
          if (!fatPrev.has(cid)) fatPrev.set(cid, emptyFat());
          const x = fatPrev.get(cid)!;
          x.spendCents += spend; x.purchasesValueCents += pv;
          if (f != null) { x.freqSum += f; x.freqN++; }
        }
      }
    }
  }

  const out: WinnerPacket[] = [];
  for (const slot of inheritedMap.values()) {
    const agg = perfByCreative.get(slot.meta_creative_id) ?? emptyAgg();
    const spend_eur = agg.spendCents / 100;
    const pv_eur = agg.purchasesValueCents / 100;
    const roas = roasOf(agg);
    let label: WinnerLabel;
    if (spend_eur < CREATIVE_MIN_SPEND_EUR || agg.purchases < CREATIVE_MIN_PURCHASES) {
      label = "inconclusive";
    } else {
      label = roas != null && roas >= winnerRoasThreshold ? "winner" : "loser";
    }
    const packet: WinnerPacket = {
      meta_creative_id: slot.meta_creative_id,
      ad_name: slot.ad_name,
      library: slot.library,
      performance: {
        spend_eur: round2(spend_eur),
        purchases_count: agg.purchases,
        purchases_value_eur: round2(pv_eur),
        roas,
      },
      label,
    };

    if (computeFatigue) {
      const f7 = fat7.get(slot.meta_creative_id) ?? emptyFat();
      const fp = fatPrev.get(slot.meta_creative_id) ?? emptyFat();
      const roas7 = f7.spendCents > 0 ? round4(f7.purchasesValueCents / f7.spendCents) : null;
      const roasPrev = fp.spendCents > 0 ? round4(fp.purchasesValueCents / fp.spendCents) : null;
      const freq7 = f7.freqN > 0 ? round4(f7.freqSum / f7.freqN) : null;
      const spend7Eur = f7.spendCents / 100;
      const fatigued =
        roas7 != null && roasPrev != null && roasPrev > 0 &&
        roas7 < roasPrev * FATIGUE_ROAS_DROP_RATIO &&
        freq7 != null && freq7 > FATIGUE_FREQ_MIN &&
        spend7Eur > FATIGUE_MIN_SPEND_EUR;
      packet.fatigue = {
        roas_7d: roas7,
        roas_prev7d: roasPrev,
        frequency_7d: freq7,
        spend_7d_eur: round2(spend7Eur),
        fatigued,
      };
    }
    out.push(packet);
  }
  return out;
}

async function loadAdsets(
  supabase: SupabaseClient,
  externalCampaignId: string,
): Promise<AdsetSummary[]> {
  const { data } = await (supabase as any)
    .schema("crm").from("meta_adset_snapshot")
    .select("external_adset_id, name, optimization_goal, billing_event, daily_budget_cents, lifetime_budget_cents")
    .eq("external_campaign_id", externalCampaignId);
  return (data ?? []) as AdsetSummary[];
}

// Lê adsets com targeting + daily insights, devolve audience_ranking + adset_saturation.
async function buildAdsetSignals(
  supabase: SupabaseClient,
  companyId: string,
  externalCampaignId: string,
  winnerRoasThreshold: number,
): Promise<{
  audience_ranking: AudienceRanking;
  adset_saturation: AdsetSaturationItem[];
}> {
  const sb: any = supabase;

  // Adsets com targeting
  const { data: adsetRows } = await sb
    .schema("crm").from("meta_adset_snapshot")
    .select("external_adset_id, name, targeting")
    .eq("company_id", companyId)
    .eq("external_campaign_id", externalCampaignId);

  const adsetIds: string[] = (adsetRows ?? []).map((a: any) => a.external_adset_id).filter(Boolean);

  // Audience map: audience_id → { name, adsets[] }
  type AudSlot = { name: string | null; adsets: Set<string> };
  const audMap = new Map<string, AudSlot>();
  // adset → list of audience ids
  const adsetToAuds = new Map<string, string[]>();
  for (const r of adsetRows ?? []) {
    const t = r.targeting as any;
    const cas: any[] = Array.isArray(t?.custom_audiences) ? t.custom_audiences : [];
    const ids: string[] = [];
    for (const ca of cas) {
      const id = ca?.id != null ? String(ca.id) : null;
      if (!id) continue;
      ids.push(id);
      if (!audMap.has(id)) audMap.set(id, { name: ca?.name ?? null, adsets: new Set() });
      audMap.get(id)!.adsets.add(r.external_adset_id);
    }
    adsetToAuds.set(r.external_adset_id, ids);
  }

  // Insights all-time por adset (uma query só)
  const adsetAllTime = new Map<string, Agg>();
  // Insights por janela 7d / 8-14d ant. p/ saturação
  type SatAgg = { impressions: number; clicks: number; spendCents: number; freqSum: number; freqN: number; ctrSum: number; ctrN: number; cpmSumCents: number; cpmN: number };
  const emptySat = (): SatAgg => ({ impressions: 0, clicks: 0, spendCents: 0, freqSum: 0, freqN: 0, ctrSum: 0, ctrN: 0, cpmSumCents: 0, cpmN: 0 });
  const sat7 = new Map<string, SatAgg>();
  const satPrev = new Map<string, SatAgg>();

  const today = new Date();
  const cutoff7 = new Date(today); cutoff7.setUTCDate(cutoff7.getUTCDate() - 6);
  const cutoffPrevStart = new Date(today); cutoffPrevStart.setUTCDate(cutoffPrevStart.getUTCDate() - 13);
  const cutoffPrevEnd = new Date(today); cutoffPrevEnd.setUTCDate(cutoffPrevEnd.getUTCDate() - 7);
  const c7 = cutoff7.toISOString().slice(0, 10);
  const cPrevStart = cutoffPrevStart.toISOString().slice(0, 10);
  const cPrevEnd = cutoffPrevEnd.toISOString().slice(0, 10);

  if (adsetIds.length > 0) {
    const { data: insights } = await sb
      .schema("crm").from("meta_adset_insights_daily")
      .select("external_adset_id, date_start, impressions, clicks, spend_cents, purchases_count, purchases_value_cents, frequency, ctr, cpm_cents")
      .eq("company_id", companyId)
      .in("external_adset_id", adsetIds);
    for (const r of insights ?? []) {
      if (!adsetAllTime.has(r.external_adset_id)) adsetAllTime.set(r.external_adset_id, emptyAgg());
      aggregateInto(adsetAllTime.get(r.external_adset_id)!, r);

      const d = r.date_start as string;
      const accum = (m: Map<string, SatAgg>) => {
        if (!m.has(r.external_adset_id)) m.set(r.external_adset_id, emptySat());
        const x = m.get(r.external_adset_id)!;
        x.impressions += Number(r.impressions ?? 0);
        x.clicks += Number(r.clicks ?? 0);
        x.spendCents += Number(r.spend_cents ?? 0);
        if (r.frequency != null) { x.freqSum += Number(r.frequency); x.freqN++; }
        if (r.ctr != null) { x.ctrSum += Number(r.ctr); x.ctrN++; }
        if (r.cpm_cents != null) { x.cpmSumCents += Number(r.cpm_cents); x.cpmN++; }
      };
      if (d >= c7) accum(sat7);
      else if (d >= cPrevStart && d <= cPrevEnd) accum(satPrev);
    }
  }

  // audience_ranking: para cada audiência, soma os agregados all-time de cada adset onde aparece.
  const items: AudienceRankingItem[] = [];
  for (const [audId, slot] of audMap.entries()) {
    const agg = emptyAgg();
    for (const aid of slot.adsets) {
      const a = adsetAllTime.get(aid);
      if (!a) continue;
      agg.spendCents += a.spendCents;
      agg.purchases += a.purchases;
      agg.purchasesValueCents += a.purchasesValueCents;
    }
    const spend_eur = agg.spendCents / 100;
    const pv_eur = agg.purchasesValueCents / 100;
    const roas = roasOf(agg);
    let label: WinnerLabel;
    if (spend_eur < CREATIVE_MIN_SPEND_EUR || agg.purchases < CREATIVE_MIN_PURCHASES) {
      label = "inconclusive";
    } else {
      label = roas != null && roas >= winnerRoasThreshold ? "winner" : "loser";
    }
    items.push({
      audience_id: audId,
      name: slot.name,
      used_in_adsets: [...slot.adsets],
      spend_eur: round2(spend_eur),
      purchases_count: agg.purchases,
      purchases_value_eur: round2(pv_eur),
      roas,
      label,
      attribution: "co_presence",
    });
  }
  // Ordena: winners primeiro por ROAS desc, depois losers por spend desc, depois inconclusive.
  const labelOrder: Record<WinnerLabel, number> = { winner: 0, loser: 1, inconclusive: 2 };
  items.sort((a, b) => {
    const lo = labelOrder[a.label] - labelOrder[b.label];
    if (lo !== 0) return lo;
    if (a.label === "winner") return (b.roas ?? 0) - (a.roas ?? 0);
    return b.spend_eur - a.spend_eur;
  });

  const audience_ranking: AudienceRanking = {
    note:
      "Ranking por CO-PRESENÇA: cada audiência herda os agregados dos adsets onde aparece no targeting. " +
      "Não é atribuição limpa (1 adset pode usar N audiences). Overlap real fica para Onda 2 (Graph /audience_overlaps).",
    items,
  };

  // adset_saturation
  const adset_saturation: AdsetSaturationItem[] = [];
  for (const r of adsetRows ?? []) {
    const id = r.external_adset_id as string;
    const a = sat7.get(id) ?? emptySat();
    const b = satPrev.get(id) ?? emptySat();
    const freqA = a.freqN > 0 ? a.freqSum / a.freqN : null;
    const freqB = b.freqN > 0 ? b.freqSum / b.freqN : null;
    const ctrA = a.ctrN > 0 ? a.ctrSum / a.ctrN : null;
    const ctrB = b.ctrN > 0 ? b.ctrSum / b.ctrN : null;
    const cpmAEur = a.cpmN > 0 ? (a.cpmSumCents / a.cpmN) / 100 : null;
    const cpmBEur = b.cpmN > 0 ? (b.cpmSumCents / b.cpmN) / 100 : null;
    const saturating =
      freqA != null && freqB != null && freqB > 0 &&
      ctrA != null && ctrB != null && ctrB > 0 &&
      cpmAEur != null && cpmBEur != null && cpmBEur > 0 &&
      a.impressions > SATURATION_MIN_IMPRESSIONS &&
      freqA > freqB * SATURATION_FREQ_UP_RATIO &&
      ctrA < ctrB * SATURATION_CTR_DOWN_RATIO &&
      cpmAEur > cpmBEur * SATURATION_CPM_UP_RATIO;
    adset_saturation.push({
      external_adset_id: id,
      name: r.name ?? null,
      frequency_a: freqA != null ? round4(freqA) : null,
      frequency_b: freqB != null ? round4(freqB) : null,
      ctr_a: ctrA != null ? round4(ctrA) : null,
      ctr_b: ctrB != null ? round4(ctrB) : null,
      cpm_a_eur: cpmAEur != null ? round4(cpmAEur) : null,
      cpm_b_eur: cpmBEur != null ? round4(cpmBEur) : null,
      impressions_a: a.impressions,
      impressions_b: b.impressions,
      saturating,
    });
  }

  return { audience_ranking, adset_saturation };
}

function buildFormatGaps(winners: WinnerPacket[]): FormatGaps {
  const winners_by_type: Record<string, number> = {};
  let totalWinners = 0;
  for (const p of winners) {
    if (p.label !== "winner") continue;
    const t = (p.library?.type ?? "unknown") as string;
    winners_by_type[t] = (winners_by_type[t] ?? 0) + 1;
    totalWinners++;
  }
  const types_missing: string[] = [];
  const types_underrepresented: string[] = [];
  for (const t of CANONICAL_FORMAT_TYPES) {
    const c = winners_by_type[t] ?? 0;
    if (c === 0) types_missing.push(t);
    else if (totalWinners > 0 && (c / totalWinners) < FORMAT_UNDERREPRESENTED_SHARE) {
      types_underrepresented.push(t);
    }
  }
  return {
    winners_by_type,
    types_missing,
    types_underrepresented,
    canonical_types: [...CANONICAL_FORMAT_TYPES],
  };
}

// analyzeViability — espelha redesign L958-1010.
function buildViability(args: {
  targetRoas: number;
  currentRoas: number;
  buckets: ROASBuckets;
  trajectory: TrajectoryString;
  ticketsTotal: number | null;
  daysUntil: number | null;
  campSpendCents: number;
  campPurchases: number;
  periodDays: number;
}): Viability {
  const {
    targetRoas, currentRoas, ticketsTotal, daysUntil: du,
    campSpendCents, campPurchases, periodDays, trajectory,
  } = args;
  const daysUntil = du ?? 60;
  const eventGoalRevenue = (ticketsTotal ?? 0) * TICKET_AVG_FALLBACK_EUR;
  const currentDailySpend = (campSpendCents / 100) / Math.max(1, periodDays);
  const currentPurchaseRate = campPurchases / Math.max(1, periodDays);
  const projectedPurchases = currentPurchaseRate * daysUntil;
  const spendNeededForGoal = eventGoalRevenue > 0 ? eventGoalRevenue / targetRoas : null;
  const dailySpendNeeded = spendNeededForGoal != null && daysUntil > 0 ? spendNeededForGoal / daysUntil : null;
  const currentProjectedSpend = currentDailySpend * daysUntil;
  const meetsStatFloor =
    currentProjectedSpend >= STATISTICAL_FLOOR_SPEND_EUR ||
    projectedPurchases >= STATISTICAL_FLOOR_PURCHASES;
  const roasGap = targetRoas > 0 ? targetRoas / Math.max(0.1, currentRoas) : null;
  let gap_severity: GapSeverity = "comfortable";
  if (roasGap != null) {
    if (roasGap < 1.5) gap_severity = "comfortable";
    else if (roasGap < 2.5) gap_severity = "stretch";
    else if (roasGap < 4.0) gap_severity = "aggressive";
    else gap_severity = "unrealistic";
  }
  return {
    target_roas: targetRoas,
    current_roas: round4(currentRoas),
    trajectory,
    event_goal_revenue_eur: round2(eventGoalRevenue),
    days_until: daysUntil,
    current_daily_spend_eur: round2(currentDailySpend),
    projected_purchases: Math.round(projectedPurchases),
    spend_needed_for_goal_eur: spendNeededForGoal != null ? round2(spendNeededForGoal) : null,
    daily_spend_needed_eur: dailySpendNeeded != null ? round2(dailySpendNeeded) : null,
    current_projected_spend_eur: round2(currentProjectedSpend),
    meets_statistical_floor: meetsStatFloor,
    roas_gap: roasGap != null ? round4(roasGap) : null,
    gap_severity,
    constants: {
      ticket_avg_fallback_eur: TICKET_AVG_FALLBACK_EUR,
      statistical_floor_spend_eur: STATISTICAL_FLOOR_SPEND_EUR,
      statistical_floor_purchases: STATISTICAL_FLOOR_PURCHASES,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────────────────────────────────

export async function buildCampaignBrief(args: BuildBriefArgs): Promise<CampaignBrief> {
  const { supabase, campaign_id, caps, reference_campaign_id, period_days, meta_access_token } = args;
  if (!campaign_id) throw new Error("missing_campaign_id");
  if (!caps || typeof caps.target_blended_roas !== "number" || !(caps.target_blended_roas > 0)) {
    throw new Error("missing_or_invalid_caps.target_blended_roas");
  }
  const periodDays = Math.min(Math.max(period_days ?? 30, 7), 90);
  const winnerRoasThreshold = caps.target_blended_roas * CREATIVE_WINNER_ROAS_RATIO;
  const warnings: string[] = [];
  const sb: any = supabase;

  // 1) Snapshot da campanha
  const { data: campaign, error: campErr } = await sb
    .schema("crm").from("meta_campaign_snapshot")
    .select("company_id, connection_id, ad_account_id, external_campaign_id, name, status, effective_status, objective, currency, linked_event_id, daily_budget_cents, lifetime_budget_cents")
    .eq("external_campaign_id", campaign_id)
    .maybeSingle();
  if (campErr || !campaign) throw new Error(`campaign_not_found: ${campErr?.message ?? campaign_id}`);

  // 2) Diagnóstico 360 — COMPLETO (D4)
  const { data: diagRow } = await sb
    .schema("crm").from("campaign_diagnosis_360")
    .select("*")
    .eq("external_campaign_id", campaign_id)
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  if (!diagRow) warnings.push("no_diagnosis_360");

  // 3) Insights diários da campanha — query ÚNICA com colunas alargadas (Onda 1).
  //    Reutilizada para: roas_buckets, daily_series, viability.
  const today = new Date();
  const cutoff7 = new Date(today); cutoff7.setUTCDate(cutoff7.getUTCDate() - 6);
  const cutoff28 = new Date(today); cutoff28.setUTCDate(cutoff28.getUTCDate() - 27);
  const c7 = cutoff7.toISOString().slice(0, 10);
  const c28 = cutoff28.toISOString().slice(0, 10);
  const cutoffSeries = new Date(today); cutoffSeries.setUTCDate(cutoffSeries.getUTCDate() - (DAILY_SERIES_MAX_DAYS - 1));
  const cSeries = cutoffSeries.toISOString().slice(0, 10);
  const sinceLegacy = new Date(today); sinceLegacy.setUTCDate(sinceLegacy.getUTCDate() - (periodDays - 1));
  const cLegacy = sinceLegacy.toISOString().slice(0, 10);

  const { data: campInsights } = await sb
    .schema("crm").from("meta_campaign_insights_daily")
    .select("date_start, spend_cents, purchases_count, purchases_value_cents, impressions, reach, frequency, clicks")
    .eq("external_campaign_id", campaign_id)
    .order("date_start", { ascending: false });

  const a7 = emptyAgg(), a28 = emptyAgg(), aLife = emptyAgg(), aLegacy = emptyAgg();
  const daily_series: DailyPoint[] = [];
  for (const r of campInsights ?? []) {
    const d = r.date_start as string;
    aggregateInto(aLife, r);
    if (d >= c28) aggregateInto(a28, r);
    if (d >= c7) aggregateInto(a7, r);
    if (d >= cLegacy) aggregateInto(aLegacy, r);
    if (d >= cSeries) {
      daily_series.push({
        date_start: d,
        spend_cents: Number(r.spend_cents ?? 0),
        purchases_count: Number(r.purchases_count ?? 0),
        purchases_value_cents: Number(r.purchases_value_cents ?? 0),
        impressions: Number(r.impressions ?? 0),
        reach: Number(r.reach ?? 0),
        frequency: r.frequency != null ? Number(r.frequency) : null,
        clicks: Number(r.clicks ?? 0),
      });
    }
  }
  daily_series.sort((x, y) => x.date_start.localeCompare(y.date_start));

  const roas_buckets: ROASBuckets = {
    roas_7d: roasOf(a7),
    roas_28d: roasOf(a28),
    roas_lifetime: roasOf(aLife),
  };
  const trajectory = classifyTrajectory(roas_buckets.roas_7d, roas_buckets.roas_28d);

  // 4) Adsets da campanha (resumo)
  const adsets = await loadAdsets(supabase, campaign_id);

  // 5) Criativos classificados (D1) + fatigue (Onda 1)
  let winners_packet: WinnerPacket[] = [];
  try {
    winners_packet = await classifyCreativesForCampaign(
      supabase, campaign.company_id, campaign_id, winnerRoasThreshold, true,
    );
  } catch (e) {
    warnings.push(`winners_packet_failed:${(e as Error).message}`);
  }

  // 6) Evento + data efetiva
  let event: EventContext = {
    id: null, name: null, date: null, effective_date: null, event_date_source: null,
    days_until: null, tickets_total: null, location: null, ticketing_url: null,
  };
  if (campaign.linked_event_id) {
    const { data: e } = await supabase.from("events")
      .select("id, name, date, location, tickets_total, ticketing_url")
      .eq("id", campaign.linked_event_id).maybeSingle();
    if (e) {
      const [{ data: children }, { data: dates }] = await Promise.all([
        supabase.from("events").select("date").eq("parent_event_id", (e as any).id),
        supabase.from("event_dates").select("date").eq("event_id", (e as any).id),
      ]);
      const resolved = resolveEffectiveEventDate(
        (e as any).date ?? null,
        (children ?? []) as any,
        (dates ?? []) as any,
      );
      const daysUntil = resolved.effectiveMs != null
        ? Math.max(0, Math.round((resolved.effectiveMs - Date.now()) / 86400000))
        : null;
      const effIso = resolved.effectiveMs != null
        ? new Date(resolved.effectiveMs).toISOString().slice(0, 10) : null;
      event = {
        id: (e as any).id,
        name: (e as any).name,
        date: (e as any).date,
        effective_date: effIso,
        event_date_source: resolved.source,
        days_until: daysUntil,
        tickets_total: (e as any).tickets_total,
        location: (e as any).location,
        ticketing_url: (e as any).ticketing_url ?? null,
      };
    }
  }

  // 7) Peers do mesmo evento (janela periodDays) — enriquecidos (Onda 1).
  const peers: PeerSummary[] = [];
  if (campaign.linked_event_id) {
    const toDate = today.toISOString().slice(0, 10);
    const fromDate = cLegacy;

    const { data: peersRaw } = await sb
      .schema("crm").from("meta_campaign_snapshot")
      .select("external_campaign_id, name, status, effective_status")
      .eq("linked_event_id", campaign.linked_event_id)
      .neq("external_campaign_id", campaign_id)
      .limit(10);
    const peerIds: string[] = (peersRaw ?? []).map((p: any) => p.external_campaign_id);

    type PeerAgg = Agg & { impressions: number; reach: number; clicks: number; freqSum: number; freqN: number };
    const emptyPeer = (): PeerAgg => ({ spendCents: 0, purchases: 0, purchasesValueCents: 0, impressions: 0, reach: 0, clicks: 0, freqSum: 0, freqN: 0 });
    const peerAggs = new Map<string, PeerAgg>();
    if (peerIds.length > 0) {
      const { data: pi } = await sb
        .schema("crm").from("meta_campaign_insights_daily")
        .select("external_campaign_id, spend_cents, purchases_count, purchases_value_cents, impressions, reach, frequency, clicks")
        .in("external_campaign_id", peerIds)
        .gte("date_start", fromDate).lte("date_start", toDate);
      for (const id of peerIds) peerAggs.set(id, emptyPeer());
      for (const r of pi ?? []) {
        const a = peerAggs.get(r.external_campaign_id);
        if (!a) continue;
        a.spendCents += Number(r.spend_cents ?? 0);
        a.purchases += Number(r.purchases_count ?? 0);
        a.purchasesValueCents += Number(r.purchases_value_cents ?? 0);
        a.impressions += Number(r.impressions ?? 0);
        a.reach = Math.max(a.reach, Number(r.reach ?? 0));
        a.clicks += Number(r.clicks ?? 0);
        if (r.frequency != null) { a.freqSum += Number(r.frequency); a.freqN++; }
      }
    }
    for (const p of peersRaw ?? []) {
      const a = peerAggs.get(p.external_campaign_id) ?? emptyPeer();
      const spend_eur = a.spendCents / 100;
      const ctr = a.impressions > 0 ? round4(a.clicks / a.impressions) : null;
      const cpmEur = a.impressions > 0 ? round4((spend_eur / a.impressions) * 1000) : null;
      const freq = a.freqN > 0 ? round4(a.freqSum / a.freqN) : null;
      peers.push({
        external_campaign_id: p.external_campaign_id,
        name: p.name ?? null,
        status: p.status ?? null,
        effective_status: p.effective_status ?? null,
        spend_eur: round2(spend_eur),
        purchases: a.purchases,
        roas: a.spendCents > 0 ? round4(a.purchasesValueCents / a.spendCents) : null,
        impressions: a.impressions,
        reach: a.reach,
        frequency: freq,
        clicks: a.clicks,
        ctr,
        cpm_eur: cpmEur,
      });
    }
  }

  // 8) Reference campaign (opcional) — mesma classificação D1 + fatigue.
  let reference: CampaignBrief["reference"] = null;
  if (reference_campaign_id && reference_campaign_id !== campaign_id) {
    const { data: ref } = await sb
      .schema("crm").from("meta_campaign_snapshot")
      .select("company_id, external_campaign_id, name")
      .eq("external_campaign_id", reference_campaign_id)
      .maybeSingle();
    if (ref) {
      try {
        const refCreatives = await classifyCreativesForCampaign(
          supabase, ref.company_id, reference_campaign_id, winnerRoasThreshold, true,
        );
        const refAdsets = await loadAdsets(supabase, reference_campaign_id);
        reference = {
          external_campaign_id: reference_campaign_id,
          name: ref.name ?? null,
          creatives: refCreatives,
          adsets: refAdsets,
        };
      } catch (e) {
        warnings.push(`reference_failed:${(e as Error).message}`);
      }
    } else {
      warnings.push("reference_campaign_not_found");
    }
  }

  // 9) Custom audiences (Graph API, best-effort)
  const audiences: AudiencePacket[] = [];
  if (meta_access_token && campaign.ad_account_id) {
    try {
      const adAcc = normalizeAdAccountId(campaign.ad_account_id);
      const u = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAcc}/customaudiences`);
      u.searchParams.set("fields", "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound");
      u.searchParams.set("limit", "100");
      u.searchParams.set("access_token", meta_access_token);
      const r = await fetch(u);
      const j = await r.json();
      if (r.ok && Array.isArray(j?.data)) {
        for (const x of j.data) {
          audiences.push({
            id: x.id,
            name: x.name,
            subtype: x.subtype ?? null,
            approximate_count_lower_bound: x.approximate_count_lower_bound ?? null,
            approximate_count_upper_bound: x.approximate_count_upper_bound ?? null,
          });
        }
      } else {
        warnings.push(`audiences_fetch_failed:${j?.error?.message ?? r.status}`);
      }
    } catch (e) {
      warnings.push(`audiences_exception:${(e as Error).message}`);
    }
  } else if (!meta_access_token) {
    warnings.push("audiences_skipped_no_token");
  }

  // 10) Viabilidade (Onda 1)
  let viability: Viability | null = null;
  try {
    const currentRoas = aLegacy.spendCents > 0 ? aLegacy.purchasesValueCents / aLegacy.spendCents : 0;
    viability = buildViability({
      targetRoas: caps.target_blended_roas,
      currentRoas,
      buckets: roas_buckets,
      trajectory,
      ticketsTotal: event.tickets_total,
      daysUntil: event.days_until,
      campSpendCents: aLegacy.spendCents,
      campPurchases: aLegacy.purchases,
      periodDays,
    });
  } catch (e) {
    warnings.push(`viability_failed:${(e as Error).message}`);
  }

  // 11) audience_ranking + adset_saturation (Onda 1)
  let audience_ranking: AudienceRanking = {
    note: "Sem dados suficientes.",
    items: [],
  };
  let adset_saturation: AdsetSaturationItem[] = [];
  try {
    const r = await buildAdsetSignals(supabase, campaign.company_id, campaign_id, winnerRoasThreshold);
    audience_ranking = r.audience_ranking;
    adset_saturation = r.adset_saturation;
  } catch (e) {
    warnings.push(`adset_signals_failed:${(e as Error).message}`);
  }

  // 12) format_gaps (Onda 1)
  const format_gaps = buildFormatGaps(winners_packet);

  return {
    generated_at: new Date().toISOString(),
    schema_version: 2,
    campaign: {
      external_campaign_id: campaign.external_campaign_id,
      company_id: campaign.company_id,
      connection_id: campaign.connection_id,
      ad_account_id: campaign.ad_account_id,
      name: campaign.name ?? null,
      status: campaign.status ?? null,
      effective_status: campaign.effective_status ?? null,
      objective: campaign.objective ?? null,
      currency: campaign.currency ?? null,
      linked_event_id: campaign.linked_event_id ?? null,
      daily_budget_cents: campaign.daily_budget_cents ?? null,
      lifetime_budget_cents: campaign.lifetime_budget_cents ?? null,
    },
    caps,
    winner_roas_threshold: round4(winnerRoasThreshold),
    event,
    diagnosis_360: (diagRow ?? null) as any,
    roas_buckets,
    trajectory,
    daily_series,
    adsets,
    winners_packet,
    reference,
    audiences,
    peers,
    viability,
    audience_ranking,
    adset_saturation,
    format_gaps,
    meta: {
      graph_api_version: GRAPH_API_VERSION,
      rules: {
        winner_min_spend_eur: CREATIVE_MIN_SPEND_EUR,
        winner_min_purchases: CREATIVE_MIN_PURCHASES,
        winner_roas_ratio: CREATIVE_WINNER_ROAS_RATIO,
        ticket_avg_fallback_eur: TICKET_AVG_FALLBACK_EUR,
        statistical_floor_spend_eur: STATISTICAL_FLOOR_SPEND_EUR,
        statistical_floor_purchases: STATISTICAL_FLOOR_PURCHASES,
        saturation_freq_up_ratio: SATURATION_FREQ_UP_RATIO,
        saturation_ctr_down_ratio: SATURATION_CTR_DOWN_RATIO,
        saturation_cpm_up_ratio: SATURATION_CPM_UP_RATIO,
        fatigue_roas_drop_ratio: FATIGUE_ROAS_DROP_RATIO,
        fatigue_freq_min: FATIGUE_FREQ_MIN,
        fatigue_min_spend_eur: FATIGUE_MIN_SPEND_EUR,
      },
      warnings,
    },
  };
}

// Re-export útil
export { CREATIVE_MIN_SPEND_EUR, CREATIVE_MIN_PURCHASES, CREATIVE_WINNER_ROAS_RATIO };
