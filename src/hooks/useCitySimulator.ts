/**
 * useCitySimulator — carrega os dados do Simulador de UM evento (cidade ou
 * standalone) e devolve os 3 cenários (Real / Break Even / Forecast) já
 * computados, prontos para serem consumidos read-only pelo Master Tour.
 *
 * Reusa a mesma lógica de `EventSimulator.tsx`: tabelas
 * `event_simulator_config`, `event_simulator_inputs`, `event_simulator_cost_lines`,
 * solvers `solveBreakEven` / `solveForecast`, e módulo A&B canónico.
 *
 * Não faz mutações nem mostra UI — é apenas um leitor agregador.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type CoalaConfig,
  type CoalaSession,
  type CoalaCostLine,
  type SessionLotInfo,
  computeScenarioRevenue,
  computeScenarioCosts,
  computeScenarioResult,
  computeScenarioKpis,
  solveBreakEven,
  solveForecast,
} from "@/lib/event-simulator-coala";
import { loadSponsors, type SponsorRow } from "@/lib/event-simulator-sponsors";
import { useEventABScenarios, type ABScenarioParticipants } from "@/hooks/useEventABScenarios";
import { scaleABFromReal, scaleABCostFromReal } from "@/lib/event-simulator-ab-scale";
import { keepLatestFeverImportRows } from "@/lib/ticket-sales-batch-filter";

export interface CitySimulatorData {
  loading: boolean;
  event: any;
  cfg: CoalaConfig;
  sessions: CoalaSession[];
  costLines: CoalaCostLine[];
  sponsors: SponsorRow[];
  // 3 cenários
  rev: { real: any; breakeven: any; forecast: any };
  costs: { real: any; breakeven: any; forecast: any };
  res: { real: any; breakeven: any; forecast: any };
  kpis: { real: any; breakeven: any; forecast: any };
  // raw para gráficos do dashboard
  rawSessions: any[];
  rawCostLines: any[];
  abModule: any;
  beTotalQty: number;
  fcTotalQty: number;
}

export function useCitySimulator(eventId: string | undefined): CitySimulatorData {
  const enabled = !!eventId;

  const { data: event } = useQuery({
    queryKey: ["city-sim-event", eventId],
    queryFn: async () => {
      const { data } = await supabase.from("events").select("*").eq("id", eventId!).maybeSingle();
      return data;
    },
    enabled,
  });

  const { data: cfg, isLoading: loadingCfg } = useQuery<any | null>({
    queryKey: ["city-sim-cfg", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_simulator_config")
        .select("*")
        .eq("event_id", eventId!)
        .maybeSingle();
      return data ?? null;
    },
    enabled,
  });

  const { data: rawSessions = [] } = useQuery<any[]>({
    queryKey: ["city-sim-inputs", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_simulator_inputs")
        .select("*")
        .eq("event_id", eventId!)
        .order("day_index").order("zone_label");
      return data ?? [];
    },
    enabled,
  });

  const { data: rawCostLines = [] } = useQuery<any[]>({
    queryKey: ["city-sim-costs", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_simulator_cost_lines")
        .select("*")
        .eq("event_id", eventId!)
        .order("display_order");
      return data ?? [];
    },
    enabled,
  });

  const { data: sponsors = [] } = useQuery<SponsorRow[]>({
    queryKey: ["city-sim-sponsors", eventId, cfg?.sponsor_category_l2_id],
    queryFn: () => loadSponsors(eventId!, cfg?.sponsor_category_l2_id ?? null),
    enabled,
  });

  // Lotes p/ solver BE/Forecast
  const { data: beLotInfo = {} } = useQuery<Record<string, SessionLotInfo>>({
    queryKey: ["city-sim-lots", eventId],
    queryFn: async () => {
      const { data: zones } = await supabase
        .from("event_ticket_zones")
        .select("id, name, total_capacity").eq("event_id", eventId!);
      const zoneIds = (zones ?? []).map((z: any) => z.id);
      if (!zoneIds.length) return {};
      const { data: lots } = await supabase
        .from("event_ticket_lots")
        .select("id, zone_id, lot_number, price, quantity").in("zone_id", zoneIds);
      const lotIds = (lots ?? []).map((l: any) => l.id);
      const { data: sales } = lotIds.length
        ? await supabase.from("ticket_sales")
            .select("lot_id, zone_id, sale_date, quantity, financial_account_id, source, import_batch_id, created_at").in("lot_id", lotIds)
        : { data: [] as any[] };
      const soldByLot = new Map<string, number>();
      const firstSaleByZone = new Map<string, string>();
      for (const s of keepLatestFeverImportRows(((sales ?? []) as any[]))) {
        soldByLot.set(s.lot_id, (soldByLot.get(s.lot_id) ?? 0) + Number(s.quantity || 0));
        const cur = firstSaleByZone.get(s.zone_id);
        if (s.sale_date && (!cur || s.sale_date < cur)) firstSaleByZone.set(s.zone_id, s.sale_date);
      }
      const today = new Date().toISOString().slice(0, 10);
      const out: Record<string, SessionLotInfo> = {};
      for (const z of (zones ?? []) as any[]) {
        const zoneLots = (lots ?? []).filter((l: any) => l.zone_id === z.id);
        const lotsArr = zoneLots.map((l: any) => ({
          lot_number: Number(l.lot_number || 1),
          price: Number(l.price || 0),
          quantity: Number(l.quantity || 0),
          sold: Number(soldByLot.get(l.id) ?? 0),
        }));
        const firstSale = firstSaleByZone.get(z.id);
        let daysSelling = 1;
        if (firstSale) {
          const ms = new Date(today).getTime() - new Date(firstSale).getTime();
          daysSelling = Math.max(1, Math.round(ms / 86400000));
        }
        out[String(z.name)] = {
          key: String(z.name),
          capacity: Number(z.total_capacity || 0),
          lots: lotsArr,
          days_selling: daysSelling,
        };
      }
      return out;
    },
    enabled,
  });

  const calcCfg: CoalaConfig = useMemo(() => {
    const sponsorRevenueFromBp = sponsors.reduce((s, r) => s + Number(r.planned_amount || 0), 0);
    return {
      ab_drink_avg_ticket: Number(cfg?.default_drink_avg_ticket || 0),
      ab_food_avg_ticket: Number(cfg?.default_food_avg_ticket || 0),
      ab_drink_passthrough_pct: Number(cfg?.ab_drink_passthrough_pct || 0),
      ab_food_passthrough_pct: Number(cfg?.ab_food_passthrough_pct || 0),
      sponsorship_revenue: sponsorRevenueFromBp > 0 ? sponsorRevenueFromBp : Number(cfg?.sponsorship_revenue || 0),
      souvenir_revenue: Number(cfg?.souvenir_revenue || 0),
      souvenir_cost: Number(cfg?.souvenir_cost || 0),
      bonif_bebidas: Number(cfg?.bonif_bebidas || 0),
      ponto_vendido: Number(cfg?.ponto_vendido || 0),
      other_revenue: Number((cfg as any)?.other_revenue || 0),
      prior_year_tickets: Number(cfg?.prior_year_tickets || 0),
      prior_year_drink: Number(cfg?.prior_year_drink || 0),
      prior_year_food: Number(cfg?.prior_year_food || 0),
      prior_year_sponsor: Number(cfg?.prior_year_sponsor || 0),
      prior_year_souvenir: Number(cfg?.prior_year_souvenir || 0),
      prior_year_other: Number(cfg?.prior_year_other || 0),
      ticket_iva_pct: Number(cfg?.ticket_iva_pct || 6),
    };
  }, [cfg, sponsors]);

  const calcSessions: CoalaSession[] = useMemo(
    () => rawSessions.map((s) => ({
      day_index: s.day_index,
      zone_label: s.zone_label,
      real_sales_qty: Number(s.real_sales_qty || 0),
      real_sales_revenue: Number(s.real_sales_revenue || 0),
      projected_qty: Number(s.projected_qty || 0),
      courtesy_qty: Number(s.courtesy_qty || 0),
      forecast_qty: Number(s.forecast_qty || 0),
      prior_year_qty: Number(s.prior_year_qty || 0),
      prior_year_revenue: Number(s.prior_year_revenue || 0),
      iva_pct: Number(s.iva_pct || 6),
      avg_ticket_override: s.avg_ticket_override,
    })),
    [rawSessions],
  );

  const calcCosts: CoalaCostLine[] = useMemo(
    () => rawCostLines.map((c) => ({
      label: c.label,
      prior_year_amount: Number(c.prior_year_amount || 0),
      actual_amount: Number(c.actual_amount || 0),
      break_even_amount: Number(c.break_even_amount || 0),
      forecast_amount: Number(c.forecast_amount || 0),
      is_ab_passthrough: !!c.is_ab_passthrough,
    })),
    [rawCostLines],
  );

  // Pass 1 do solver BE: sem override A&B. Usado APENAS para alimentar
  // o módulo A&B canónico. O `beSolution` final (com `economics.abMarginPerPub`)
  // é re-solvido mais abaixo — Option B deep refactor (2026-05-20).
  const beSolutionDraft = useMemo(
    () => solveBreakEven(calcSessions, calcCosts, calcCfg, beLotInfo),
    [calcSessions, calcCosts, calcCfg, beLotInfo],
  );
  const eventDate = (event as any)?.end_date ?? (event as any)?.start_date ?? null;
  const fcSolution = useMemo(
    () => solveForecast(calcSessions, calcCfg, beLotInfo, eventDate, {
      finalAccel: Number(cfg?.forecast_final_accel) || undefined,
      finalWindowDays: Number(cfg?.forecast_final_window_days) || undefined,
    }),
    [calcSessions, calcCfg, beLotInfo, eventDate, cfg?.forecast_final_accel, cfg?.forecast_final_window_days],
  );

  const todayRev = useMemo(
    () => computeScenarioRevenue(calcSessions, calcCfg, "today"),
    [calcSessions, calcCfg],
  );
  const fcRev = useMemo(
    () => computeScenarioRevenue(calcSessions, calcCfg, "forecast", fcSolution.qtyByKey, fcSolution.revenueByKey),
    [calcSessions, calcCfg, fcSolution],
  );


  // A&B canónico
  // NOTA: para zonas com várias entradas no mesmo zone_label (ex.: passes
  // multi-dia onde a mesma quantidade aparece em vários day_index), tomamos
  // o MÁXIMO por dia em vez da soma — caso contrário o forecast/BE infla
  // por contagem dupla da mesma pessoa.
  const abParticipants = useMemo<ABScenarioParticipants>(() => {
    const realByZoneDay: Record<string, Record<number, number>> = {};
    const beByZoneDay: Record<string, Record<number, number>> = {};
    const fcByZoneDay: Record<string, Record<number, number>> = {};
    for (const s of calcSessions) {
      const key = `${s.day_index}-${s.zone_label}`;
      const zoneKey = (s.zone_label || "").toLowerCase();
      const courtesy = Number(s.courtesy_qty) || 0;
      const realQty = (Number(s.real_sales_qty) || 0) + courtesy;
      const beQty = (beSolutionDraft.qtyByKey?.[key] ?? (Number(s.real_sales_qty) || 0)) + courtesy;
      const fcQty = (fcSolution.qtyByKey?.[key] ?? (Number(s.real_sales_qty) || 0)) + courtesy;

      (realByZoneDay[zoneKey] ??= {})[s.day_index] = (realByZoneDay[zoneKey][s.day_index] ?? 0) + realQty;
      (beByZoneDay[zoneKey]   ??= {})[s.day_index] = (beByZoneDay[zoneKey][s.day_index]   ?? 0) + beQty;
      (fcByZoneDay[zoneKey]   ??= {})[s.day_index] = (fcByZoneDay[zoneKey][s.day_index]   ?? 0) + fcQty;
    }
    // Heurística: se a mesma zone_label aparece em >1 dia com valores idênticos,
    // é um passe multi-dia → usar máximo. Caso contrário, somar.
    const collapse = (byDay: Record<number, number>): number => {
      const vals = Object.values(byDay);
      if (vals.length <= 1) return vals.reduce((a, b) => a + b, 0);
      const allEqual = vals.every((v) => v === vals[0]);
      return allEqual ? vals[0] : vals.reduce((a, b) => a + b, 0);
    };
    const toMap = (src: Record<string, Record<number, number>>) => {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(src)) out[k] = collapse(v);
      return out;
    };
    return { real: toMap(realByZoneDay), breakeven: toMap(beByZoneDay), forecast: toMap(fcByZoneDay) };
  }, [calcSessions, beSolutionDraft, fcSolution]);

  const abModule = useEventABScenarios(eventId, abParticipants);

  // Real: usa receita/custo do módulo A&B (per-capita × participantes por zona).
  // BE/Forecast: escala SEMPRE pelo per-capita efectivo do Real
  // (receitaReal / públicoReal). Evita que `participants_manual` ou outros
  // casos em que o módulo devolve o mesmo valor congelem A&B no Real.
  const realRev = useMemo(() => {
    if (!abModule.hasConfig || !abModule.totals) return todayRev;
    const t = abModule.totals.real;
    const drink = t.receitaBebidas;
    const food = t.receitaAlimentos;
    return {
      ...todayRev,
      drinkRevenue: drink,
      foodRevenue: food,
      totalRevenue: todayRev.totalRevenue - todayRev.drinkRevenue - todayRev.foodRevenue + drink + food,
    };
  }, [todayRev, abModule]);

  const beRevAB = useMemo(() => {
    if (!abModule.hasConfig || !abModule.totals) return beRev;
    const real = abModule.totals.real;
    const scaled = scaleABFromReal(beRev, realRev, real.receitaBebidas, real.receitaAlimentos);
    return { ...beRev, ...scaled };
  }, [beRev, realRev, abModule]);

  const fcRevAB = useMemo(() => {
    if (!abModule.hasConfig || !abModule.totals) return fcRev;
    const real = abModule.totals.real;
    const scaled = scaleABFromReal(fcRev, realRev, real.receitaBebidas, real.receitaAlimentos);
    return { ...fcRev, ...scaled };
  }, [fcRev, realRev, abModule]);

  const realCosts = useMemo(() => {
    const base = computeScenarioCosts(calcCosts, realRev, calcCfg, "today");
    if (abModule.hasConfig && abModule.totals)
      return { ...base, abCost: abModule.totals.real.custoTotal, totalCost: base.eventCosts + abModule.totals.real.custoTotal + base.souvenirCost };
    return base;
  }, [calcCosts, realRev, calcCfg, abModule]);
  const beCosts = useMemo(() => {
    const base = computeScenarioCosts(calcCosts, beRevAB, calcCfg, "breakeven");
    if (abModule.hasConfig && abModule.totals) {
      const ab = scaleABCostFromReal(abModule.totals.real.custoTotal, realRev, beRevAB);
      return { ...base, abCost: ab, totalCost: base.eventCosts + ab + base.souvenirCost };
    }
    return base;
  }, [calcCosts, beRevAB, realRev, calcCfg, abModule]);
  const fcCosts = useMemo(() => {
    const base = computeScenarioCosts(calcCosts, fcRevAB, calcCfg, "forecast");
    if (abModule.hasConfig && abModule.totals) {
      const ab = scaleABCostFromReal(abModule.totals.real.custoTotal, realRev, fcRevAB);
      return { ...base, abCost: ab, totalCost: base.eventCosts + ab + base.souvenirCost };
    }
    return base;
  }, [calcCosts, fcRevAB, realRev, calcCfg, abModule]);

  const realRes = useMemo(() => computeScenarioResult(realRev, realCosts), [realRev, realCosts]);
  const beRes = useMemo(() => computeScenarioResult(beRevAB, beCosts), [beRevAB, beCosts]);
  const fcRes = useMemo(() => computeScenarioResult(fcRevAB, fcCosts), [fcRevAB, fcCosts]);

  const realKpis = useMemo(() => computeScenarioKpis(realRev, realCosts, realRes), [realRev, realCosts, realRes]);
  const beKpis = useMemo(() => computeScenarioKpis(beRevAB, beCosts, beRes), [beRevAB, beCosts, beRes]);
  const fcKpis = useMemo(() => computeScenarioKpis(fcRevAB, fcCosts, fcRes), [fcRevAB, fcCosts, fcRes]);

  return {
    loading: loadingCfg,
    event,
    cfg: calcCfg,
    sessions: calcSessions,
    costLines: calcCosts,
    sponsors,
    rev: { real: realRev, breakeven: beRevAB, forecast: fcRevAB },
    costs: { real: realCosts, breakeven: beCosts, forecast: fcCosts },
    res: { real: realRes, breakeven: beRes, forecast: fcRes },
    kpis: { real: realKpis, breakeven: beKpis, forecast: fcKpis },
    rawSessions,
    rawCostLines,
    abModule,
    beTotalQty: Object.values(beSolution.qtyByKey || {}).reduce((a, b) => a + Number(b || 0), 0),
    fcTotalQty: Object.values(fcSolution.qtyByKey || {}).reduce((a, b) => a + Number(b || 0), 0),
  };
}
