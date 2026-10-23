/**
 * #339 B — fetcher ÚNICO do contexto da receita repartida do Master.
 * Lê as linhas de receita do Master com regra, as transações ligadas, as
 * cidades e (só para ticket_share) a base de bilheteira; devolve o resultado
 * de `expandMasterRevenueToSplits`. Sem regras → resultado vazio (zero leituras extra).
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";
import { isEventRealized } from "@/lib/event-realized";
import { computeLiveTicketForecast } from "@/lib/event-simulator-forecast-live";
import {
  expandMasterRevenueToSplits,
  type MasterRevenueSplitResult,
  type TicketShareBasis,
} from "@/lib/master-revenue-proration";

export type MasterRevenueSplit = MasterRevenueSplitResult<any, any>;

export const emptyMasterRevenueSplit = (): MasterRevenueSplit => ({
  forecastSlices: [],
  transactionSlices: [],
  shares: {},
  sourceForecastIds: new Set(),
  sourceTransactionIds: new Set(),
  ticketBasisUsed: {},
  warnings: [],
});

export async function fetchMasterRevenueSplit(masterIds: string[]): Promise<MasterRevenueSplit> {
  const ids = Array.from(new Set(masterIds.filter(Boolean)));
  if (ids.length === 0) return emptyMasterRevenueSplit();

  const { data: fcs, error: fErr } = await supabase
    .from("event_forecasts")
    .select(
      "id, event_id, type, amount, iva_rate, description, category_id, status, is_transitory, exclude_from_result, is_overhead, event_settlement_id, revenue_split_mode, revenue_split_params, account_categories(code, name)",
    )
    .in("event_id", ids)
    .eq("type", "income")
    .eq("status", "approved")
    .is("version_id", null)
    .not("revenue_split_mode", "is", null);
  if (fErr) throw fErr;
  const forecasts = (fcs ?? []) as any[];
  if (forecasts.length === 0) return emptyMasterRevenueSplit();

  const ruledMasters = Array.from(new Set(forecasts.map((f) => f.event_id)));
  const [{ data: cities, error: cErr }, txRes] = await Promise.all([
    supabase.from("events").select("id, parent_event_id, date, status").in("parent_event_id", ruledMasters),
    fetchAllPagedQuery(supabase
      .from("transactions")
      .select(
        "id, event_id, type, status, amount, iva_rate, category_id, forecast_id, is_transitory, exclude_from_result, reversed_at, is_hidden, description, event_settlement_id, account_categories(code, name)",
      )
      .in("event_id", ruledMasters)
      .eq("type", "income")
      .in("status", ["approved", "paid"])
      .in("forecast_id", forecasts.map((f) => f.id))),
  ]);
  if (cErr) throw cErr;
  const cityRows = (cities ?? []) as any[];

  let ticketBasis: TicketShareBasis | undefined;
  if (forecasts.some((f) => f.revenue_split_mode === "ticket_share")) {
    const cityIds = cityRows.map((c) => c.id);
    const realizedEventIds = cityRows
      .filter((c) => isEventRealized({ status: c.status ?? null, date: c.date ?? null, childDates: [] }))
      .map((c) => c.id);
    const { data: totals, error: tErr } = await supabase.rpc("get_event_ticket_sales_totals", {
      p_event_ids: cityIds,
    });
    if (tErr) throw tErr;
    const realByEvent: Record<string, number> = {};
    for (const r of (totals ?? []) as any[]) realByEvent[r.event_id] = Number(r.net || 0);
    const forecastByEvent: Record<string, number> = {};
    if (realizedEventIds.length < cityIds.length) {
      const live = await Promise.all(cityIds.map((id) => computeLiveTicketForecast(id).catch(() => null)));
      cityIds.forEach((id, i) => { forecastByEvent[id] = Number(live[i]?.net ?? 0); });
    }
    ticketBasis = { realByEvent, forecastByEvent, realizedEventIds };
  }

  return expandMasterRevenueToSplits({
    events: cityRows,
    forecasts,
    transactions: (txRes.data ?? []) as any[],
    ticketBasis,
  });
}
