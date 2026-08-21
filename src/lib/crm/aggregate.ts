// Agregação de insights do Dashboard (Meta + Google) + cálculos derivados.
// Fase 3B: a mesma agregação serve as duas plataformas. Métricas que o Google
// não fornece (alcance, frequência, cliques únicos, funil) ficam marcadas como
// ausentes através das flags has*, para a UI mostrar "—" em vez de zero.
import type { InsightRow } from "@/components/crm/dashboard/types";

// ============================================================
// Aggregation helpers
// ============================================================
export interface Aggregate {
  spendCents: number;
  revenueCents: number;
  conversions: number;
  impressions: number;
  clicks: number;
  roas: number | null;
  // Fase 1
  reachSum: number;          // soma NÃO deduplicada (ver tooltip na UI)
  uniqueClicks: number;
  viewContent: number;
  addToCart: number;
  initiateCheckout: number;
  // Fase 4 — vídeo (has* false ⇒ mostrar "—").
  videoPlays: number;
  video3sViews: number;
  videoThruplays: number;
  videoP75: number;
  hasVideo: boolean;
  // Fase 3B — presença real do dado (false ⇒ mostrar "—", nunca 0).
  hasReach: boolean;
  hasUniqueClicks: boolean;
  hasViewContent: boolean;
  hasAddToCart: boolean;
  hasInitiateCheckout: boolean;
}
export function emptyAgg(): Aggregate {
  return {
    spendCents: 0, revenueCents: 0, conversions: 0, impressions: 0, clicks: 0, roas: null,
    reachSum: 0, uniqueClicks: 0, viewContent: 0, addToCart: 0, initiateCheckout: 0,
    videoPlays: 0, video3sViews: 0, videoThruplays: 0, videoP75: 0, hasVideo: false,
    hasReach: false, hasUniqueClicks: false, hasViewContent: false,
    hasAddToCart: false, hasInitiateCheckout: false,
  };
}

export function aggregate(rows: InsightRow[]): Aggregate {
  const a = emptyAgg();
  for (const r of rows) {
    a.spendCents += r.spend_cents ?? 0;
    a.revenueCents += r.purchases_value_cents ?? 0;
    a.conversions += r.purchases_count ?? 0;
    a.impressions += r.impressions ?? 0;
    a.clicks += r.clicks ?? 0;
    a.reachSum += r.reach ?? 0;
    a.uniqueClicks += r.unique_clicks ?? 0;
    a.viewContent += r.view_content_count ?? 0;
    a.addToCart += r.add_to_cart_count ?? 0;
    a.initiateCheckout += r.initiate_checkout_count ?? 0;
    if (r.reach != null) a.hasReach = true;
    if (r.unique_clicks != null) a.hasUniqueClicks = true;
    if (r.view_content_count != null) a.hasViewContent = true;
    if (r.add_to_cart_count != null) a.hasAddToCart = true;
    if (r.initiate_checkout_count != null) a.hasInitiateCheckout = true;
    a.videoPlays += r.video_plays ?? 0;
    a.video3sViews += r.video_3s_views ?? 0;
    a.videoThruplays += r.video_thruplays ?? 0;
    a.videoP75 += r.video_p75_watched ?? 0;
    if (
      r.video_plays != null || r.video_3s_views != null ||
      r.video_thruplays != null || r.video_p75_watched != null
    ) a.hasVideo = true;

  }
  a.roas = a.spendCents > 0 ? a.revenueCents / a.spendCents : null;
  return a;
}
export function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return (curr - prev) / prev;
}

/** CPC médio do período (cêntimos) — gasto / cliques. */
export function computeCpcAvg(agg: Aggregate): number | null {
  return agg.clicks > 0 ? Math.round(agg.spendCents / agg.clicks) : null;
}

/** CTR médio do período (decimal) — cliques / impressões. */
export function computeCtrAvg(agg: Aggregate): number | null {
  return agg.impressions > 0 ? agg.clicks / agg.impressions : null;
}

/** Frequência média ponderada por impressões; fallback para média simples. */
export function computeFreqAvg(rows: InsightRow[]): number | null {
  let wf = 0;
  let wi = 0;
  let simpleSum = 0;
  let simpleN = 0;
  for (const r of rows) {
    const f = r.frequency;
    if (f == null || !Number.isFinite(f)) continue;
    simpleSum += f;
    simpleN += 1;
    const imp = r.impressions ?? 0;
    if (imp > 0) {
      wf += f * imp;
      wi += imp;
    }
  }
  if (wi > 0) return wf / wi;
  if (simpleN > 0) return simpleSum / simpleN;
  return null;
}

/** Gasto médio diário no período (cêntimos). */
export function computeSpendPerDay(agg: Aggregate, days: number): number {
  return agg.spendCents / days;
}

/** Razão de velocidade de gasto período actual vs anterior. */
export function computeVelRatio(agg: Aggregate, aggPrev: Aggregate, days: number): number | null {
  const prevSpendPerDay = aggPrev.spendCents / days;
  return prevSpendPerDay > 0 ? agg.spendCents / days / prevSpendPerDay : null;
}

/** CPM do período (cêntimos por mil impressões). */
export function computeCpm(agg: Aggregate): number | null {
  return agg.impressions > 0 ? Math.round((agg.spendCents / agg.impressions) * 1000) : null;
}

/** CPP do período (cêntimos por mil pessoas alcançadas — reach é soma não deduplicada). */
export function computeCpp(agg: Aggregate): number | null {
  if (!agg.hasReach) return null;
  return agg.reachSum > 0 ? Math.round((agg.spendCents / agg.reachSum) * 1000) : null;
}

/**
 * CTR único — cliques únicos ÷ ALCANCE (definição do Meta; a coluna unique_ctr
 * do Meta bate exactamente com este quociente). Como reachSum é uma soma não
 * deduplicada por dia, o valor agregado é aproximado.
 */
export function computeUniqueCtr(agg: Aggregate): number | null {
  if (!agg.hasReach || !agg.hasUniqueClicks) return null;
  return agg.reachSum > 0 ? agg.uniqueClicks / agg.reachSum : null;
}

/** CPA — investimento por compra (cêntimos). */
export function computeCpa(agg: Aggregate): number | null {
  return agg.conversions > 0 ? Math.round(agg.spendCents / agg.conversions) : null;
}

/** Ticket médio — receita por compra (cêntimos). */
export function computeTicket(agg: Aggregate): number | null {
  return agg.conversions > 0 ? Math.round(agg.revenueCents / agg.conversions) : null;
}
