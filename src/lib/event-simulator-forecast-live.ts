/**
 * Cenário FORECAST do Simulador calculado AO VIVO (DR-2026-09-03-D21, adenda 2).
 *
 * Fonte de verdade única partilhada entre a página do Simulador e o BP de
 * receita: nunca usar o fallback estático de `computeScenarioRevenue(...,
 * "forecast")` (real + projected_qty × TM sobre `event_simulator_inputs`
 * possivelmente parados). Aqui:
 *   - vendas reais lidas AGORA de `ticket_sales` (qty + receita bruta por zona);
 *   - capacidade por zona = CARGA CORRENTE (`zone_capacity_snapshot`, D20), com
 *     fallback à carga inicial (`event_ticket_zones.total_capacity`);
 *   - `solveForecast` com os mesmos parâmetros da página (aceleração/janela);
 *   - `computeScenarioRevenue(..., "forecast", qtyByKey, revenueByKey)`.
 *
 * Sem config do Simulador E sem retrato de carga corrente → `currentNet = null`.
 */
import { supabase } from "@/integrations/supabase/client";
import { keepLatestFeverImportRows } from "@/lib/ticket-sales-batch-filter";
import {
  computeScenarioRevenue,
  solveForecast,
  type CoalaConfig,
  type CoalaSession,
  type SessionLotInfo,
} from "@/lib/event-simulator-coala";

export const normZoneLabel = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export interface CurrentLoadEntry {
  load: number;
  observedOn: string | null;
}

/** Último retrato de carga corrente por nome normalizado da zona (D20). */
export async function fetchCurrentLoadByZoneName(
  eventId: string,
): Promise<Map<string, CurrentLoadEntry>> {
  const out = new Map<string, CurrentLoadEntry>();
  const { data } = await supabase.rpc("zone_capacity_snapshot" as any, { _event_id: eventId });
  for (const r of ((data ?? []) as any[])) {
    if (!r?.zone_name) continue;
    out.set(normZoneLabel(r.zone_name), {
      load: Number(r.capacity || 0),
      observedOn: r.observed_on ?? null,
    });
  }
  return out;
}

export interface LiveTicketForecast {
  /** receita líquida de bilhetes no cenário Forecast; null = sem base */
  net: number | null;
  /** quantidade total prevista (inclui vendas reais), ≤ carga corrente */
  totalQty: number;
  currentLoad: number | null;
  currentLoadOn: string | null;
}

export async function computeLiveTicketForecast(eventId: string): Promise<LiveTicketForecast> {
  const [{ data: evt }, { data: cfgRow }, { data: inputs }, { data: zones }, currentLoadMap] =
    await Promise.all([
      supabase.from("events").select("start_date, end_date").eq("id", eventId).maybeSingle(),
      supabase.from("event_simulator_config").select("*").eq("event_id", eventId).maybeSingle(),
      supabase.from("event_simulator_inputs").select("*").eq("event_id", eventId).order("day_index"),
      supabase.from("event_ticket_zones").select("id, name, total_capacity").eq("event_id", eventId),
      fetchCurrentLoadByZoneName(eventId),
    ]);

  let currentLoad: number | null = null;
  let currentLoadOn: string | null = null;
  if (currentLoadMap.size > 0) {
    currentLoad = 0;
    for (const v of currentLoadMap.values()) {
      currentLoad += v.load;
      if (v.observedOn && (!currentLoadOn || v.observedOn > currentLoadOn)) currentLoadOn = v.observedOn;
    }
  }

  if (!cfgRow && currentLoadMap.size === 0) {
    return { net: null, totalQty: 0, currentLoad, currentLoadOn };
  }

  const zoneRows = (zones ?? []) as any[];
  const zoneIds = zoneRows.map((z) => z.id);
  let lots: any[] = [];
  let sales: any[] = [];
  if (zoneIds.length > 0) {
    const { data: l } = await supabase
      .from("event_ticket_lots")
      .select("id, zone_id, lot_number, price, quantity, iva_rate")
      .in("zone_id", zoneIds);
    lots = l ?? [];
    const lotIds = lots.map((x) => x.id);
    if (lotIds.length > 0) {
      const { data: s } = await supabase
        .from("ticket_sales")
        .select(
          "lot_id, zone_id, sale_date, quantity, unit_price, total_value, financial_account_id, source, import_batch_id, created_at",
        )
        .in("lot_id", lotIds);
      sales = keepLatestFeverImportRows((s ?? []) as any[]);
    }
  }

  const soldByLot = new Map<string, number>();
  const firstSaleByZone = new Map<string, string>();
  const salesByZone = new Map<string, { qty: number; revenue: number }>();
  for (const s of sales) {
    soldByLot.set(s.lot_id, (soldByLot.get(s.lot_id) ?? 0) + Number(s.quantity || 0));
    const cur = firstSaleByZone.get(s.zone_id);
    if (s.sale_date && (!cur || s.sale_date < cur)) firstSaleByZone.set(s.zone_id, s.sale_date);
    const agg = salesByZone.get(s.zone_id) ?? { qty: 0, revenue: 0 };
    agg.qty += Number(s.quantity || 0);
    const tv = s.total_value;
    agg.revenue +=
      tv !== null && tv !== undefined && tv !== "" && !Number.isNaN(Number(tv))
        ? Number(tv)
        : Number(s.quantity || 0) * Number(s.unit_price || 0);
    salesByZone.set(s.zone_id, agg);
  }

  const today = new Date().toISOString().slice(0, 10);
  const lotInfoByKey: Record<string, SessionLotInfo> = {};
  const salesByZoneName = new Map<string, { qty: number; revenue: number }>();
  const ivaByZoneName = new Map<string, number>();
  for (const z of zoneRows) {
    const zoneLots = lots.filter((l) => l.zone_id === z.id);
    const firstSale = firstSaleByZone.get(z.id);
    let daysSelling = 1;
    if (firstSale) {
      daysSelling = Math.max(
        1,
        Math.round((new Date(today).getTime() - new Date(firstSale).getTime()) / 86400000),
      );
    }
    const snap = currentLoadMap.get(normZoneLabel(z.name));
    lotInfoByKey[String(z.name)] = {
      key: String(z.name),
      // carga corrente manda; carga inicial só como fallback
      capacity: snap ? snap.load : Number(z.total_capacity || 0),
      lots: zoneLots.map((l) => ({
        lot_number: Number(l.lot_number || 1),
        price: Number(l.price || 0),
        quantity: Number(l.quantity || 0),
        sold: Number(soldByLot.get(l.id) ?? 0),
      })),
      days_selling: daysSelling,
    };
    const agg = salesByZone.get(z.id);
    if (agg) {
      const k = normZoneLabel(z.name);
      const prev = salesByZoneName.get(k) ?? { qty: 0, revenue: 0 };
      salesByZoneName.set(k, { qty: prev.qty + agg.qty, revenue: prev.revenue + agg.revenue });
    }
    const withIva = zoneLots.find((l) => l.iva_rate != null);
    if (withIva) ivaByZoneName.set(normZoneLabel(z.name), Number(withIva.iva_rate));
  }

  const cfg = (cfgRow ?? {}) as any;
  const coala: CoalaConfig = {
    ab_drink_avg_ticket: 0,
    ab_food_avg_ticket: 0,
    ab_drink_passthrough_pct: 0,
    ab_food_passthrough_pct: 0,
    sponsorship_revenue: 0,
    souvenir_revenue: 0,
    souvenir_cost: 0,
    bonif_bebidas: 0,
    ponto_vendido: 0,
    other_revenue: 0,
    prior_year_tickets: 0,
    prior_year_drink: 0,
    prior_year_food: 0,
    prior_year_sponsor: 0,
    prior_year_souvenir: 0,
    prior_year_other: 0,
    ticket_iva_pct: Number(cfg.ticket_iva_pct || 6),
  } as CoalaConfig;

  // Sessões: esqueleto dos inputs persistidos (day_index, cortesias, forecast
  // manual, IVA) mas com as vendas REAIS lidas agora. Sem inputs, uma sessão
  // por zona. `projected_qty` é irrelevante: o solver não o usa.
  const usedZoneName = new Set<string>();
  let sessions: CoalaSession[] = [];
  const rows = (inputs ?? []) as any[];
  if (rows.length > 0) {
    sessions = rows.map((s) => {
      const k = normZoneLabel(s.zone_label);
      const agg = usedZoneName.has(k) ? null : salesByZoneName.get(k);
      usedZoneName.add(k);
      return {
        day_index: Number(s.day_index || 0),
        zone_label: String(s.zone_label || ""),
        real_sales_qty: agg ? agg.qty : 0,
        real_sales_revenue: agg ? agg.revenue : 0,
        projected_qty: 0,
        courtesy_qty: Number(s.courtesy_qty || 0),
        forecast_qty: Number(s.forecast_qty || 0),
        prior_year_qty: Number(s.prior_year_qty || 0),
        prior_year_revenue: Number(s.prior_year_revenue || 0),
        iva_pct: Number(s.iva_pct || ivaByZoneName.get(k) || coala.ticket_iva_pct || 6),
        avg_ticket_override: s.avg_ticket_override,
      } as CoalaSession;
    });
  } else {
    sessions = zoneRows.map((z) => {
      const k = normZoneLabel(z.name);
      const agg = salesByZoneName.get(k);
      return {
        day_index: 0,
        zone_label: String(z.name),
        real_sales_qty: agg ? agg.qty : 0,
        real_sales_revenue: agg ? agg.revenue : 0,
        projected_qty: 0,
        courtesy_qty: 0,
        forecast_qty: 0,
        prior_year_qty: 0,
        prior_year_revenue: 0,
        iva_pct: Number(ivaByZoneName.get(k) || coala.ticket_iva_pct || 6),
        avg_ticket_override: null,
      } as CoalaSession;
    });
  }

  if (sessions.length === 0) return { net: null, totalQty: 0, currentLoad, currentLoadOn };

  const eventDate = (evt as any)?.end_date ?? (evt as any)?.start_date ?? null;
  const solution = solveForecast(sessions, coala, lotInfoByKey, eventDate, {
    finalAccel: Number(cfg.forecast_final_accel) || undefined,
    finalWindowDays: Number(cfg.forecast_final_window_days) || undefined,
  });
  const rev = computeScenarioRevenue(sessions, coala, "forecast", solution.qtyByKey, solution.revenueByKey);
  const totalQty = Object.values(solution.qtyByKey || {}).reduce((a, b) => a + Number(b || 0), 0);

  return { net: rev.ticketsRevenue, totalQty, currentLoad, currentLoadOn };
}
