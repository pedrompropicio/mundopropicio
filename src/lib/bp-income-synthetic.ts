/**
 * Cálculo das linhas SINTÉTICAS de receita do BP (DR-2026-09-03-D21).
 * Partilhado entre o ecrã (useBPIncomeSynthetic) e o PDF do BP.
 *
 * Não persiste nada — excepto o "previsto original" da bilheteira, que é fixado
 * na primeira vez em events.ticketing_baseline_net (feito pelo hook da UI).
 */
import { supabase } from "@/integrations/supabase/client";
import { ticketSaleRevenue } from "@/lib/ticket-sales-revenue";
import { computeLiveTicketForecast } from "@/lib/event-simulator-forecast-live";

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
  /** previsto corrente (s/IVA) — null sem Simulador nem carga corrente */
  currentNet: number | null;
  /** quantidade total prevista no cenário Forecast (≤ carga corrente) */
  currentQty: number;
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
  // DR-2026-09-03-D21 (adenda): previsto original = min(carga inicial, Σ qty dos lotes
  // de planeamento) × preço médio líquido ponderado. Sem lotes de planeamento não há
  // previsto original (sem fallback ao preço médio real — inflacionava eventos antigos).
  const avgNet = pQty > 0 ? pNet / pQty : null;
  const computedBaselineNet =
    pQty > 0 && avgNet != null ? Math.min(initialLoad > 0 ? initialLoad : pQty, pQty) * avgNet : null;
  const stored = (evt as any)?.ticketing_baseline_net;
  const baselineNet = stored != null ? Number(stored) : computedBaselineNet;

  // Previsto corrente = cenário Forecast do Simulador calculado AO VIVO
  // (DR-2026-09-03-D21, adenda 2). Nunca o fallback estático.
  const live = await computeLiveTicketForecast(eventId);

  return {
    initialLoad,
    currentLoad: live.currentLoad,
    currentLoadOn: live.currentLoadOn,
    soldQty, ivaPct,
    baselineNet, computedBaselineNet,
    currentNet: live.net,
    currentQty: live.totalQty,
    realNet,
  };
}
