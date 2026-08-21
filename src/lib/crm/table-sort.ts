// Ordenação da tabela do Dashboard MP Audience (Fase 2).
// A ordenação aplica-se DENTRO de cada nível: ordenar campanhas não mexe
// na ordem dos conjuntos dentro delas (esses continuam por investimento).
import {
  aggregate,
  computeCpa,
  computeCpcAvg,
  computeCpm,
  computeCpp,
  computeCtrAvg,
  computeFreqAvg,
  computeTicket,
  computeUniqueCtr,
  type Aggregate,
} from "@/lib/crm/aggregate";
import type { MetricColumnId } from "@/lib/crm/columns";
import type { CampaignRow, InsightRow } from "@/components/crm/dashboard/types";

export type SortKey = "roas" | "budgetPerDay" | MetricColumnId;
export type SortDir = "asc" | "desc";
export interface SortState {
  key: SortKey | null;
  dir: SortDir;
}

export const NO_SORT: SortState = { key: null, dir: "desc" };

/** Ciclo do clique no cabeçalho: desc → asc → sem ordenação. */
export function nextSort(state: SortState, key: SortKey): SortState {
  if (state.key !== key) return { key, dir: "desc" };
  if (state.dir === "desc") return { key, dir: "asc" };
  return NO_SORT;
}

/** Valor numérico de uma coluna para efeitos de ordenação (null = sem dados). */
export function sortValue(
  key: SortKey,
  agg: Aggregate,
  rows: InsightRow[],
  campaign?: CampaignRow | null,
): number | null {
  switch (key) {
    case "roas":
      return agg.roas;
    case "budgetPerDay":
      return campaign ? (campaign.daily_budget_cents ?? 0) : null;
    case "spend":
      return agg.spendCents;
    case "revenue":
      return agg.revenueCents;
    case "conversions":
      return agg.conversions;
    case "cpa":
      return computeCpa(agg);
    case "ticket":
      return computeTicket(agg);
    case "cpc":
      return computeCpcAvg(agg);
    case "ctr":
      return computeCtrAvg(agg);
    case "cpm":
      return computeCpm(agg);
    case "freq":
      return computeFreqAvg(rows);
    case "reach":
      return agg.reachSum;
    case "impressions":
      return agg.impressions;
    case "cpp":
      return computeCpp(agg);
    case "uniqueClicks":
      return agg.uniqueClicks;
    case "uniqueCtr":
      return computeUniqueCtr(agg);
    case "viewContent":
      return agg.viewContent;
    case "addToCart":
      return agg.addToCart;
    case "initiateCheckout":
      return agg.initiateCheckout;
    default:
      return null;
  }
}

/** Ordena campanhas de um nível; sem chave activa devolve a ordem original. */
export function sortCampaigns(
  campaigns: CampaignRow[],
  insightsByCampaign: Map<string, InsightRow[]>,
  sort: SortState,
): CampaignRow[] {
  if (!sort.key) return campaigns;
  const key = sort.key;
  const factor = sort.dir === "asc" ? 1 : -1;
  const val = new Map<string, number | null>();
  for (const c of campaigns) {
    const rows = insightsByCampaign.get(c.external_campaign_id) ?? [];
    val.set(c.id, sortValue(key, aggregate(rows), rows, c));
  }
  return [...campaigns].sort((a, b) => {
    const va = val.get(a.id);
    const vb = val.get(b.id);
    // Sem dados fica sempre no fim, independentemente do sentido.
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va === vb) return 0;
    return (va - vb) * factor;
  });
}
