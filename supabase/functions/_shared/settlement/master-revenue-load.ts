/**
 * #339 B2b — leitor ÚNICO (ERP + edge `partner-statement`) da receita do Master
 * repartida. Mesmas queries nos dois lados; o cálculo é sempre
 * `expandMasterRevenueToSplits`.
 *
 * `ticketForecastNet` (opcional) dá o previsto corrente da bilheteira por
 * cidade (o ERP injecta `computeLiveTicketForecast`). Sem ele — no servidor —
 * uma regra `ticket_share` com cidades ainda por realizar NÃO reparte e avisa
 * (o previsto do simulador não corre no servidor); depois de todas as cidades
 * realizadas a base é o real nos dois lados.
 */
import { fetchAllPagedQuery } from "../paging.ts";
import {
  expandMasterRevenueToSplits,
  type MasterRevenueSplitResult,
  type TicketShareBasis,
} from "./master-revenue-proration.ts";

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

function isRealized(ev: { status?: string | null; date?: string | null }, today = new Date()): boolean {
  if ((ev.status ?? "") === "completed") return true;
  const d = typeof ev.date === "string" ? ev.date.slice(0, 10) : "";
  if (d.length < 10) return false;
  const t = today;
  const local = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  return d < local;
}

export async function loadMasterRevenueSplit(
  client: any,
  masterIds: string[],
  opts: { ticketForecastNet?: (eventId: string) => Promise<number | null> } = {},
): Promise<MasterRevenueSplit> {
  const ids = Array.from(new Set(masterIds.filter(Boolean)));
  if (ids.length === 0) return emptyMasterRevenueSplit();

  const { data: fcs, error: fErr } = await fetchAllPagedQuery(client
    .from("event_forecasts")
    .select(
      "id, event_id, type, amount, iva_rate, description, category_id, status, is_transitory, exclude_from_result, is_overhead, event_settlement_id, excluded_from_partner_settlement, revenue_split_mode, revenue_split_params, account_categories(code, name, ebitda_class)",
    )
    .in("event_id", ids)
    .eq("type", "income")
    .eq("status", "approved")
    .is("version_id", null)
    .not("revenue_split_mode", "is", null));
  if (fErr) throw new Error(fErr.message ?? String(fErr));
  const forecasts = (fcs ?? []) as any[];
  if (forecasts.length === 0) return emptyMasterRevenueSplit();

  const ruledMasters = Array.from(new Set(forecasts.map((f) => f.event_id)));
  const [{ data: cities, error: cErr }, txRes] = await Promise.all([
    client.from("events").select("id, parent_event_id, date, status").in("parent_event_id", ruledMasters),
    fetchAllPagedQuery(client
      .from("transactions")
      .select(
        "id, event_id, type, status, amount, iva_rate, date, category_id, forecast_id, is_transitory, exclude_from_result, reversed_at, is_hidden, description, event_settlement_id, excluded_from_partner_settlement, account_categories(id, code, name, parent_id, ebitda_class)",
      )
      .in("event_id", ruledMasters)
      .eq("type", "income")
      .in("status", ["approved", "paid"])
      .in("forecast_id", forecasts.map((f) => f.id))),
  ]);
  if (cErr) throw new Error(cErr.message ?? String(cErr));
  if (txRes.error) throw new Error(txRes.error.message ?? String(txRes.error));
  const cityRows = (cities ?? []) as any[];

  let ticketBasis: TicketShareBasis | undefined;
  if (forecasts.some((f) => f.revenue_split_mode === "ticket_share")) {
    const cityIds = cityRows.map((c) => c.id);
    const realizedEventIds = cityRows.filter((c) => isRealized(c)).map((c) => c.id);
    const { data: totals, error: tErr } = await client.rpc("get_event_ticket_sales_totals", { p_event_ids: cityIds });
    if (tErr) throw new Error(tErr.message ?? String(tErr));
    const realByEvent: Record<string, number> = {};
    for (const r of (totals ?? []) as any[]) realByEvent[r.event_id] = Number(r.net || 0);
    const forecastByEvent: Record<string, number> = {};
    if (realizedEventIds.length < cityIds.length && opts.ticketForecastNet) {
      const live = await Promise.all(cityIds.map((id) => opts.ticketForecastNet!(id).catch(() => null)));
      cityIds.forEach((id, i) => { forecastByEvent[id] = Number(live[i] ?? 0); });
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

/**
 * Fatias que um perímetro SEM o seu Master recebe (cidade vista sozinha).
 * Perímetro com o Master → vazio (a linha do Master conta uma vez).
 */
export async function loadMasterRevenueSlicesFor(
  client: any,
  perimeter: Array<{ id: string; parent_event_id?: string | null }>,
  opts: { ticketForecastNet?: (eventId: string) => Promise<number | null> } = {},
): Promise<{ forecastSlices: any[]; transactionSlices: any[]; warnings: any[] }> {
  const ids = perimeter.map((e) => e.id);
  const orphanMasters = Array.from(new Set(
    perimeter.map((e) => e.parent_event_id).filter((p): p is string => !!p && !ids.includes(p)),
  ));
  if (orphanMasters.length === 0) return { forecastSlices: [], transactionSlices: [], warnings: [] };
  const split = await loadMasterRevenueSplit(client, orphanMasters, opts);
  return {
    forecastSlices: split.forecastSlices.filter((s) => ids.includes(s.event_id)),
    transactionSlices: split.transactionSlices.filter((s) => ids.includes(s.event_id)),
    warnings: split.warnings,
  };
}
