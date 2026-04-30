/**
 * Helpers para inicializar/sincronizar o Simulador a partir das fontes reais:
 *  - Vendas reais: ticket_sales (sum quantity, sum total_value via ticketSaleRevenue)
 *  - Sessões: produto cartesiano event_dates × event_ticket_zones
 *  - Projeção default: total_capacity − vendido (clamp ≥ 0)
 *  - Forecast custos: event_forecasts approved (type=expense) agregados por categoria L3
 *
 * Sources foram aprovadas pelo utilizador (msg de 2026-04-30).
 */
import { supabase } from "@/integrations/supabase/client";
import { ticketSaleRevenue } from "./ticket-sales-revenue";

export type SyncReport = {
  sessionsCreated: number;
  sessionsUpdated: number;
  costLinesCreated: number;
  costLinesUpdated: number;
};

type Row = Record<string, any>;

/**
 * Cria sessões em falta (date × zone) e atualiza Vendas Reais a partir de ticket_sales.
 * Não toca em campos manuais (cortesia, forecast_qty, avg_ticket_override) se a sessão já existe.
 */
export async function syncSimulatorFromSources(eventId: string): Promise<SyncReport> {
  const report: SyncReport = {
    sessionsCreated: 0, sessionsUpdated: 0,
    costLinesCreated: 0, costLinesUpdated: 0,
  };

  // 1) Carrega fontes
  const [datesRes, zonesRes, salesRes, existingRes, fcRes, catsRes, cfgRes] = await Promise.all([
    supabase.from("event_dates").select("id, date").eq("event_id", eventId).order("date"),
    supabase.from("event_ticket_zones").select("id, name, total_capacity, session_id").eq("event_id", eventId).order("name"),
    supabase.from("ticket_sales").select("zone_id, sale_date, quantity, unit_price, total_value")
      .in("zone_id", []) // placeholder substituído logo abaixo
      .limit(1),
    supabase.from("event_simulator_inputs").select("*").eq("event_id", eventId),
    supabase.from("event_forecasts").select("category_id, amount, type, status")
      .eq("event_id", eventId).eq("status", "approved").eq("type", "expense"),
    supabase.from("account_categories").select("id, code, name").eq("is_active", true),
    supabase.from("event_simulator_cost_lines").select("*").eq("event_id", eventId),
  ]);

  const dates = (datesRes.data ?? []) as Row[];
  const zones = (zonesRes.data ?? []) as Row[];
  const existing = (existingRes.data ?? []) as Row[];
  const forecasts = (fcRes.data ?? []) as Row[];
  const categories = (catsRes.data ?? []) as Row[];
  const existingCosts = (cfgRes.data ?? []) as Row[];

  // Re-fetch ticket_sales agora que temos zone_ids reais
  const zoneIds = zones.map((z) => z.id);
  let sales: Row[] = [];
  if (zoneIds.length) {
    const { data } = await supabase
      .from("ticket_sales")
      .select("zone_id, sale_date, quantity, unit_price, total_value")
      .in("zone_id", zoneIds);
    sales = (data ?? []) as Row[];
  }

  // 2) Agrega vendas por (zone_id, sale_date)
  const salesByZoneDate = new Map<string, { qty: number; revenue: number }>();
  for (const s of sales) {
    const key = `${s.zone_id}|${s.sale_date}`;
    const prev = salesByZoneDate.get(key) ?? { qty: 0, revenue: 0 };
    prev.qty += Number(s.quantity || 0);
    prev.revenue += ticketSaleRevenue(s as any);
    salesByZoneDate.set(key, prev);
  }
  // Total agregado por zona (independente da data) — usado quando não há match de data
  const salesByZone = new Map<string, { qty: number; revenue: number }>();
  for (const s of sales) {
    const prev = salesByZone.get(s.zone_id) ?? { qty: 0, revenue: 0 };
    prev.qty += Number(s.quantity || 0);
    prev.revenue += ticketSaleRevenue(s as any);
    salesByZone.set(s.zone_id, prev);
  }

  // 3) Indexa sessões existentes
  const existingByKey = new Map<string, Row>();
  for (const e of existing) existingByKey.set(`${e.day_index}|${e.zone_label}`, e);

  // 4) Para cada (date × zone) calcula payload e upsert
  // Se não há dates, cria 1 dia "virtual"
  const effectiveDates = dates.length ? dates : [{ id: null, date: null }];

  for (let dIdx = 0; dIdx < effectiveDates.length; dIdx++) {
    const d = effectiveDates[dIdx];
    for (const z of zones) {
      const key = `${dIdx}|${z.name}`;
      const existingRow = existingByKey.get(key);

      // sales: tenta match por sale_date == event_date.date, senão usa total da zona dividido pelos dias
      let realQty = 0, realRev = 0;
      if (d.date) {
        const m = salesByZoneDate.get(`${z.id}|${d.date}`);
        if (m) { realQty = m.qty; realRev = m.revenue; }
      }
      // Se nada encontrado pela data e só temos 1 sessão para esta zona, usa total da zona
      if (realQty === 0 && realRev === 0 && effectiveDates.length === 1) {
        const z2 = salesByZone.get(z.id);
        if (z2) { realQty = z2.qty; realRev = z2.revenue; }
      }

      const capacity = Number(z.total_capacity || 0);
      const projected = Math.max(0, capacity - realQty);

      if (existingRow) {
        // Update apenas as métricas automáticas; preserva manuais
        const patch: Row = {
          real_sales_qty: realQty,
          real_sales_revenue: realRev,
        };
        // Atualiza projeção só se o utilizador ainda não a editou (heurística: se existing.projected_qty == 0 ou == capacity)
        if (
          Number(existingRow.projected_qty || 0) === 0 ||
          Number(existingRow.projected_qty || 0) === capacity
        ) {
          patch.projected_qty = projected;
        }
        const { error } = await supabase
          .from("event_simulator_inputs")
          .update(patch).eq("id", existingRow.id);
        if (!error) report.sessionsUpdated++;
      } else {
        const { error } = await supabase
          .from("event_simulator_inputs")
          .insert({
            event_id: eventId,
            day_index: dIdx,
            day_date: d.date ?? null,
            zone_label: z.name,
            capacity_target: capacity,
            real_sales_qty: realQty,
            real_sales_revenue: realRev,
            projected_qty: projected,
            courtesy_qty: 0,
            forecast_qty: null,
            avg_ticket_override: null,
            iva_pct: 6,
          } as any);
        if (!error) report.sessionsCreated++;
      }
    }
  }

  // 5) Custos forecast por categoria L3
  // L3 = code com x.y.z
  const l3 = categories.filter((c) => /^\d+\.\d+\.\d+$/.test(c.code));
  const l3ById = new Map<string, Row>();
  for (const c of l3) l3ById.set(c.id, c);

  // Aggrega forecast por category_id
  const fcByCat = new Map<string, number>();
  for (const f of forecasts) {
    if (!f.category_id) continue;
    if (!l3ById.has(f.category_id)) continue;
    fcByCat.set(f.category_id, (fcByCat.get(f.category_id) ?? 0) + Number(f.amount || 0));
  }

  const existingCostByCat = new Map<string, Row>();
  for (const c of existingCosts) {
    if (c.category_id) existingCostByCat.set(c.category_id, c);
  }

  let order = existingCosts.length;
  for (const [catId, total] of fcByCat.entries()) {
    const cat = l3ById.get(catId)!;
    const exists = existingCostByCat.get(catId);
    if (exists) {
      const { error } = await supabase
        .from("event_simulator_cost_lines")
        .update({ forecast_amount: total })
        .eq("id", exists.id);
      if (!error) report.costLinesUpdated++;
    } else {
      const { error } = await supabase
        .from("event_simulator_cost_lines")
        .insert({
          event_id: eventId,
          category_id: catId,
          label: `${cat.code} — ${cat.name}`,
          prior_year_amount: 0,
          break_even_amount: 0,
          forecast_amount: total,
          is_ab_passthrough: false,
          display_order: order++,
        } as any);
      if (!error) report.costLinesCreated++;
    }
  }

  return report;
}
