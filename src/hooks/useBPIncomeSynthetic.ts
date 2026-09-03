/**
 * Linhas SINTÉTICAS de receita do BP (DR-2026-09-03-D21, issue #103 — D10 + D20).
 *
 * Não são persistidas em event_forecasts: são renderizadas a partir dos módulos.
 * Cada linha tem TRÊS colunas de valor:
 *   - Previsto original  → carga inicial × preço de planeamento, FIXADO na 1ª vez
 *                          (events.ticketing_baseline_net / ab_baseline_net)
 *   - Previsto corrente  → projecção ao vivo (Simulador / cenário A&B)
 *   - Real               → ao vivo (ticket_sales / transações A&B)
 *
 * Bilheteira usa o mesmo critério de arredondamento do cabeçalho do evento
 * (DR-D11: linha a linha, valor exacto de total_value quando existe).
 */
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ticketSaleRevenue } from "@/lib/ticket-sales-revenue";
import {
  computeScenarioRevenue,
  type CoalaConfig,
  type CoalaSession,
} from "@/lib/event-simulator-coala";
import { useEventABScenarios, type ABScenarioParticipants } from "@/hooks/useEventABScenarios";
import { useEventABRealized } from "@/hooks/useEventABRealized";

export interface SyntheticIncomeLine {
  key: "bilheteira" | "ab";
  label: string;
  source: string;
  categoryLabel: string;
  ivaPct: number | null;
  /** previsto original (s/IVA) — null quando não há base para o calcular */
  baselineNet: number | null;
  /** previsto corrente (s/IVA) — null quando não há projecção */
  currentNet: number | null;
  /** IVA (€) do previsto corrente */
  currentIva: number;
  /** real (s/IVA) ao vivo */
  realNet: number;
  /** aviso a mostrar quando currentNet é null */
  missingNote?: string;
  /** texto pequeno com cargas/vendidos */
  meta?: string;
}

const EMPTY_PARTICIPANTS: ABScenarioParticipants = { real: {}, breakeven: {}, forecast: {} };

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("pt-PT");
}
function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(`${d}T00:00:00`).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

export function useBPIncomeSynthetic(eventId: string, extraEventIds: string[] = []) {
  const queryClient = useQueryClient();
  const eventIds = useMemo(
    () => Array.from(new Set([eventId, ...(extraEventIds ?? [])])).filter(Boolean),
    [eventId, extraEventIds],
  );
  const idsKey = eventIds.join(",");

  const { data: eventRow } = useQuery({
    queryKey: ["bp_income_baselines", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, ticketing_baseline_net, ticketing_baseline_at, ab_baseline_net, ab_baseline_at")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!eventId,
  });

  const { data: ticketing } = useQuery({
    queryKey: ["bp_income_ticketing", idsKey],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id, total_capacity")
        .in("event_id", eventIds);
      const zoneIds = (zones ?? []).map((z: any) => z.id);
      const initialLoad = (zones ?? []).reduce((s: number, z: any) => s + Number(z.total_capacity || 0), 0);
      if (zoneIds.length === 0) {
        return { initialLoad, lots: [] as any[], sales: [] as any[] };
      }
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, quantity, price, iva_rate, sync_generated")
        .in("zone_id", zoneIds);
      const lotIds = (lots ?? []).map((l: any) => l.id);
      const { data: sales } = lotIds.length
        ? await supabase
            .from("ticket_sales")
            .select("lot_id, quantity, unit_price, total_value")
            .in("lot_id", lotIds)
        : { data: [] as any[] };
      return { initialLoad, lots: (lots ?? []) as any[], sales: (sales ?? []) as any[] };
    },
    enabled: eventIds.length > 0,
  });

  const { data: snapshot } = useQuery({
    queryKey: ["bp_income_zone_snapshot", eventId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("zone_capacity_snapshot" as any, { _event_id: eventId });
      if (error) return null;
      const rows = (data ?? []) as any[];
      const withLoad = rows.filter((r) => r.zone_name);
      if (withLoad.length === 0) return null;
      const total = withLoad.reduce((s, r) => s + Number(r.capacity || 0), 0);
      const observedOn = withLoad.map((r) => r.observed_on).filter(Boolean).sort().pop() ?? null;
      return { total, observedOn: observedOn as string | null };
    },
    enabled: !!eventId,
  });

  const { data: sim } = useQuery({
    queryKey: ["bp_income_simulator", eventId],
    queryFn: async () => {
      const [{ data: cfg }, { data: inputs }] = await Promise.all([
        supabase.from("event_simulator_config").select("*").eq("event_id", eventId).maybeSingle(),
        supabase.from("event_simulator_inputs").select("*").eq("event_id", eventId),
      ]);
      return { cfg: cfg as any, inputs: (inputs ?? []) as any[] };
    },
    enabled: !!eventId,
  });

  const abScenarios = useEventABScenarios(eventId, EMPTY_PARTICIPANTS);
  const abRealized = useEventABRealized(eventId);

  return useMemo(() => {
    const lines: SyntheticIncomeLine[] = [];
    const lots = ticketing?.lots ?? [];
    const sales = ticketing?.sales ?? [];
    const initialLoad = Number(ticketing?.initialLoad || 0);

    // ── BILHETEIRA (1.1.01) ──────────────────────────────────────────
    const planningLots = lots.filter(
      (l: any) => Number(l.quantity || 0) > 0 && Number(l.price || 0) > 0 && !l.sync_generated,
    );
    const lotIvaMap = new Map<string, number>(lots.map((l: any) => [l.id, Number(l.iva_rate ?? 0)]));

    let planningQty = 0, planningNet = 0, planningIvaWeighted = 0;
    for (const l of planningLots) {
      const qty = Number(l.quantity || 0);
      const rate = Number(l.iva_rate ?? 6);
      planningQty += qty;
      planningNet += (qty * Number(l.price || 0)) / (1 + rate / 100);
      planningIvaWeighted += qty * rate;
    }

    const realQty = sales.reduce((s: number, x: any) => s + Number(x.quantity || 0), 0);
    const realNet = sales.reduce((s: number, x: any) => {
      const gross = ticketSaleRevenue(x);
      const rate = lotIvaMap.get(x.lot_id) ?? 0;
      return s + (rate > 0 ? gross / (1 + rate / 100) : gross);
    }, 0);

    const ivaPct = planningQty > 0 ? planningIvaWeighted / planningQty : 6;
    const avgNetPrice =
      planningQty > 0 ? planningNet / planningQty : realQty > 0 ? realNet / realQty : null;

    const computedBaseline =
      initialLoad > 0 && avgNetPrice != null ? initialLoad * avgNetPrice : null;
    const storedBaseline =
      eventRow?.ticketing_baseline_net != null ? Number(eventRow.ticketing_baseline_net) : null;
    const baselineNet = storedBaseline ?? computedBaseline;

    // fixa o previsto original na 1ª vez que é calculável
    if (storedBaseline == null && computedBaseline != null && computedBaseline > 0 && eventRow) {
      void supabase
        .from("events")
        .update({ ticketing_baseline_net: computedBaseline, ticketing_baseline_at: new Date().toISOString() } as never)
        .eq("id", eventId)
        .then(() => queryClient.invalidateQueries({ queryKey: ["bp_income_baselines", eventId] }));
    }

    let currentNet: number | null = null;
    if (sim?.cfg && (sim?.inputs?.length ?? 0) > 0) {
      const cfg: CoalaConfig = {
        ab_drink_avg_ticket: Number(sim.cfg.default_drink_avg_ticket || 0),
        ab_food_avg_ticket: Number(sim.cfg.default_food_avg_ticket || 0),
        ab_drink_passthrough_pct: Number(sim.cfg.ab_drink_passthrough_pct || 0),
        ab_food_passthrough_pct: Number(sim.cfg.ab_food_passthrough_pct || 0),
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
        ticket_iva_pct: Number(sim.cfg.ticket_iva_pct || 6),
      } as CoalaConfig;
      const sessions: CoalaSession[] = sim.inputs.map((s: any) => ({
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
      currentNet = computeScenarioRevenue(sessions, cfg, "forecast").ticketsRevenue;
    }

    const metaParts: string[] = [];
    if (initialLoad > 0) metaParts.push(`Carga inicial ${fmtInt(initialLoad)}`);
    if (snapshot?.total) {
      const d = fmtDate(snapshot.observedOn);
      metaParts.push(`Carga corrente ${fmtInt(snapshot.total)}${d ? ` (${d})` : ""}`);
    } else {
      metaParts.push("sem retrato de carga");
    }
    if (realQty > 0) {
      const pcts: string[] = [];
      if (initialLoad > 0) pcts.push(`${Math.round((realQty / initialLoad) * 100)}% da inicial`);
      if (snapshot?.total) pcts.push(`${Math.round((realQty / snapshot.total) * 100)}% da corrente`);
      metaParts.push(`Vendidos ${fmtInt(realQty)}${pcts.length ? ` — ${pcts.join(" · ")}` : ""}`);
    }

    if (initialLoad > 0 || realNet > 0 || currentNet != null) {
      lines.push({
        key: "bilheteira",
        label: "Venda de Bilhetes",
        source: "Bilheteira — módulo (não editável)",
        categoryLabel: "1.1.01 Venda de Bilhetes",
        ivaPct,
        baselineNet,
        currentNet,
        currentIva: currentNet != null ? (currentNet * ivaPct) / 100 : 0,
        realNet,
        missingNote: currentNet == null ? "Sem previsão — configura o Simulador" : undefined,
        meta: metaParts.join(" · "),
      });
    }

    // ── A&B (1.1.03) ─────────────────────────────────────────────────
    const abCurrent = abScenarios.totals ? abScenarios.totals.forecast.receitaTotal : null;
    const abStored = eventRow?.ab_baseline_net != null ? Number(eventRow.ab_baseline_net) : null;
    const abBaseline = abStored ?? abCurrent;
    if (abStored == null && abCurrent != null && abCurrent > 0 && eventRow) {
      void supabase
        .from("events")
        .update({ ab_baseline_net: abCurrent, ab_baseline_at: new Date().toISOString() } as never)
        .eq("id", eventId)
        .then(() => queryClient.invalidateQueries({ queryKey: ["bp_income_baselines", eventId] }));
    }
    const abReal = Number(abRealized?.receita || 0);
    if (abScenarios.hasConfig || abReal > 0) {
      lines.push({
        key: "ab",
        label: "Alimentos & Bebidas",
        source: "Módulo A&B (não editável)",
        categoryLabel: "1.1.03 A&B",
        ivaPct: null,
        baselineNet: abBaseline,
        currentNet: abCurrent,
        currentIva: 0,
        realNet: abReal,
        missingNote: abCurrent == null ? "Sem previsão" : undefined,
      });
    }

    return {
      lines,
      totals: {
        baselineNet: lines.reduce((s, l) => s + (l.baselineNet ?? 0), 0),
        currentNet: lines.reduce((s, l) => s + (l.currentNet ?? 0), 0),
        currentIva: lines.reduce((s, l) => s + l.currentIva, 0),
        realNet: lines.reduce((s, l) => s + l.realNet, 0),
      },
      ticketRealNet: realNet,
    };
  }, [ticketing, snapshot, sim, eventRow, abScenarios, abRealized, eventId, queryClient]);
}
