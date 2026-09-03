/**
 * Cálculo das linhas SINTÉTICAS de receita do BP (DR-2026-09-03-D21).
 * Partilhado entre o ecrã (useBPIncomeSynthetic) e o PDF do BP.
 *
 * Não persiste nada — excepto o "previsto original" da bilheteira, que é fixado
 * na primeira vez em events.ticketing_baseline_net (feito pelo hook da UI).
 */
import { supabase } from "@/integrations/supabase/client";
import { ticketSaleRevenue } from "@/lib/ticket-sales-revenue";
import { computeScenarioRevenue, type CoalaConfig, type CoalaSession } from "@/lib/event-simulator-coala";

export interface TicketSyntheticResult {
  initialLoad: number;
  currentLoad: number | null;
  currentLoadOn: string | null;
  soldQty: number;
  ivaPct: number;
  /** previsto original (s/IVA) */
  baselineNet: number | null;
  /** valor calculado agora (antes de ler o guardado) */
  computedBaselineNet: number | null;
  /** previsto corrente (s/IVA) — null sem Simulador */
  currentNet: number | null;
  /** real (s/IVA), critério linha a linha (D11) */
  realNet: number;
}

export async function computeTicketSynthetic(
  eventId: string,
  eventIds: string[] = [eventId],
): Promise<TicketSyntheticResult> {
  const ids = Array.from(new Set([eventId, ...eventIds])).filter(Boolean);

  const [{ data: zones }, { data: evt }] = await Promise.all([
    supabase.from("event_ticket_zones").select("id, total_capacity").in("event_id", ids),
    supabase.from("events").select("ticketing_baseline_net").eq("id", eventId).maybeSingle(),
  ]);
  const initialLoad = (zones ?? []).reduce((s: number, z: any) => s + Number(z.total_capacity || 0), 0);
  const zoneIds = (zones ?? []).map((z: any) => z.id);

  let lots: any[] = [];
  let sales: any[] = [];
  if (zoneIds.length > 0) {
    const { data: l } = await supabase
      .from("event_ticket_lots")
      .select("id, quantity, price, iva_rate, sync_generated")
      .in("zone_id", zoneIds);
    lots = l ?? [];
    const lotIds = lots.map((x) => x.id);
    if (lotIds.length > 0) {
      const { data: s } = await supabase
        .from("ticket_sales")
        .select("lot_id, quantity, unit_price, total_value")
        .in("lot_id", lotIds);
      sales = s ?? [];
    }
  }

  const lotIva = new Map<string, number>(lots.map((l) => [l.id, Number(l.iva_rate ?? 0)]));
  const planning = lots.filter(
    (l) => Number(l.quantity || 0) > 0 && Number(l.price || 0) > 0 && !l.sync_generated,
  );
  let pQty = 0, pNet = 0, pIva = 0;
  for (const l of planning) {
    const qty = Number(l.quantity || 0);
    const rate = Number(l.iva_rate ?? 6);
    pQty += qty;
    pNet += (qty * Number(l.price || 0)) / (1 + rate / 100);
    pIva += qty * rate;
  }

  const soldQty = sales.reduce((s, x) => s + Number(x.quantity || 0), 0);
  const realNet = sales.reduce((s, x) => {
    const gross = ticketSaleRevenue(x);
    const rate = lotIva.get(x.lot_id) ?? 0;
    return s + (rate > 0 ? gross / (1 + rate / 100) : gross);
  }, 0);

  const ivaPct = pQty > 0 ? pIva / pQty : 6;
  const avgNet = pQty > 0 ? pNet / pQty : soldQty > 0 ? realNet / soldQty : null;
  const computedBaselineNet = initialLoad > 0 && avgNet != null ? initialLoad * avgNet : null;
  const stored = (evt as any)?.ticketing_baseline_net;
  const baselineNet = stored != null ? Number(stored) : computedBaselineNet;

  // Carga corrente (último retrato das bilheteiras)
  let currentLoad: number | null = null;
  let currentLoadOn: string | null = null;
  const { data: snap } = await supabase.rpc("zone_capacity_snapshot" as any, { _event_id: eventId });
  const rows = ((snap ?? []) as any[]).filter((r) => r.zone_name);
  if (rows.length > 0) {
    currentLoad = rows.reduce((s, r) => s + Number(r.capacity || 0), 0);
    currentLoadOn = rows.map((r) => r.observed_on).filter(Boolean).sort().pop() ?? null;
  }

  // Previsto corrente (Simulador, cenário forecast, sempre líquido)
  let currentNet: number | null = null;
  const [{ data: cfg }, { data: inputs }] = await Promise.all([
    supabase.from("event_simulator_config").select("*").eq("event_id", eventId).maybeSingle(),
    supabase.from("event_simulator_inputs").select("*").eq("event_id", eventId),
  ]);
  if (cfg && (inputs ?? []).length > 0) {
    const c = cfg as any;
    const coala: CoalaConfig = {
      ab_drink_avg_ticket: Number(c.default_drink_avg_ticket || 0),
      ab_food_avg_ticket: Number(c.default_food_avg_ticket || 0),
      ab_drink_passthrough_pct: Number(c.ab_drink_passthrough_pct || 0),
      ab_food_passthrough_pct: Number(c.ab_food_passthrough_pct || 0),
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
      ticket_iva_pct: Number(c.ticket_iva_pct || 6),
    } as CoalaConfig;
    const sessions = (inputs ?? []).map((s: any) => ({
      day_index: Number(s.day_index || 0),
      zone_label: String(s.zone_label || ""),
      real_sales_qty: Number(s.real_sales_qty || 0),
      real_sales_revenue: Number(s.real_sales_revenue || 0),
      projected_qty: Number(s.projected_qty || 0),
      courtesy_qty: Number(s.courtesy_qty || 0),
      forecast_qty: Number(s.forecast_qty || 0),
      prior_year_qty: Number(s.prior_year_qty || 0),
      prior_year_revenue: Number(s.prior_year_revenue || 0),
      iva_pct: Number(s.iva_pct || 6),
      avg_ticket_override: s.avg_ticket_override,
    })) as CoalaSession[];
    currentNet = computeScenarioRevenue(sessions, coala, "forecast").ticketsRevenue;
  }

  return {
    initialLoad, currentLoad, currentLoadOn, soldQty, ivaPct,
    baselineNet, computedBaselineNet, currentNet, realNet,
  };
}
