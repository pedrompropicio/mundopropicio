import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type CardMode, type ModeUsed, type Phase, type RevenueScenario,
  type FormalidadeBreakdown,
  emptyBreakdown, addToBreakdown, detectPhase, defaultModeForPhase, classifyIncomeL1,
} from "@/lib/event-financial-card";
import { computeScenarioRevenue, type CoalaConfig, type CoalaSession } from "@/lib/event-simulator-coala";

export interface UseEventFinancialCardDataArgs {
  eventId: string;
  /** Todos os event_ids relevantes (master + subs em vista global, ou só o sub seleccionado). */
  eventIds: string[];
  kind: "income" | "expense";
  mode: CardMode;
  scenario?: RevenueScenario; // só usado em forecast+income
  eventStatus?: string | null;
  primaryEventDate?: string | null;
  /** Receita já calculada de ticket_sales (vem do EventDetail). */
  ticketSalesRevenue?: number;
  /** TX do Master rateadas (÷ N siblings). */
  masterExpenseShare?: number;
  /** Forecasts overhead do Master rateados (÷ N siblings). Só aplicado em committed/forecast. */
  masterForecastShare?: number;
  /** Cachê calculado efetivo. */
  cacheImpact?: number;
}

export interface Subtotal {
  label: string;
  value: number | null; // null = "—"
}

export interface UseEventFinancialCardDataResult {
  displayValue: number;
  subtotals: Subtotal[];
  formalidadeBreakdown: FormalidadeBreakdown | null;
  phase: Phase;
  modeUsed: ModeUsed;
  /** Algum dado indisponível (p.ex. simulador sem config). */
  unavailable: boolean;
  /** Total da componente forecast bilheteira para casos especiais. */
  meta?: Record<string, number | null>;
}

export function useEventFinancialCardData(args: UseEventFinancialCardDataArgs): UseEventFinancialCardDataResult {
  const { eventId, eventIds, kind, mode, scenario = "forecast", eventStatus, primaryEventDate } = args;
  const ids = eventIds.length > 0 ? eventIds : [eventId];
  const idsKey = ids.slice().sort().join(",");

  // ── transactions (paid + approved, NÃO inclui pending para alinhar com Cards/Análise) ──
  const { data: txs = [] } = useQuery({
    queryKey: ["efc-tx", idsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, type, status, amount, paid_amount, category_id, is_transitory, account_categories(code)")
        .in("event_id", ids);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: ids.length > 0,
  });

  // ── BP forecasts (active version) — usados em committed e forecast ──
  const { data: forecasts = [] } = useQuery({
    queryKey: ["efc-forecasts", idsKey, kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_forecasts")
        .select("id, event_id, type, status, amount, category_id, formalidade, is_transitory, exclude_from_result")
        .in("event_id", ids)
        .is("version_id", null)
        .eq("type", kind);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: ids.length > 0,
  });

  // ── Simulator (apenas em forecast+income) ──
  const simEnabled = mode === "forecast" && kind === "income";
  const { data: simCfg } = useQuery({
    queryKey: ["efc-sim-cfg", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_simulator_config")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle();
      return data as any | null;
    },
    enabled: simEnabled,
  });

  const { data: simInputs = [] } = useQuery({
    queryKey: ["efc-sim-inputs", eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("event_simulator_inputs")
        .select("*")
        .eq("event_id", eventId)
        .order("day_index")
        .order("zone_label");
      return (data ?? []) as any[];
    },
    enabled: simEnabled,
  });

  return useMemo<UseEventFinancialCardDataResult>(() => {
    // ── Fase ──
    const realizedTx = txs.filter((t: any) =>
      (t.status === "paid" || t.status === "approved") && !t.is_transitory
    );
    const hasTx = realizedTx.length > 0;
    const hasSales = (args.ticketSalesRevenue ?? 0) > 0;
    const phase = detectPhase({
      eventStatus,
      lastDate: primaryEventDate,
      firstDate: primaryEventDate,
      hasTransactions: hasTx,
      hasSales,
    });
    const modeUsed: ModeUsed = mode === "auto" ? defaultModeForPhase(phase) : mode;

    // ── REALIZED ──────────────────────────────────────────────
    if (modeUsed === "realized") {
      if (kind === "income") {
        const incomeTx = realizedTx.filter((t: any) => t.type === "income");
        const nonTicket = incomeTx.filter((t: any) => t.account_categories?.code !== "1.1.01");
        const nonTicketSum = nonTicket.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
        const allIncomeSum = incomeTx.reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
        const hasSalesNow = (args.ticketSalesRevenue ?? 0) > 0;
        const display = hasSalesNow ? (args.ticketSalesRevenue ?? 0) + nonTicketSum : allIncomeSum;

        // Subtotais por L1
        const buckets = { bilheteira: hasSalesNow ? (args.ticketSalesRevenue ?? 0) : 0, patrocinio: 0, outros: 0 };
        const source = hasSalesNow ? nonTicket : incomeTx;
        for (const t of source) {
          const cls = classifyIncomeL1(t.account_categories?.code);
          if (hasSalesNow && cls === "bilheteira") { /* já contado em ticketSales */ continue; }
          if (cls === "bilheteira") buckets.bilheteira += Number(t.amount || 0);
          else if (cls === "patrocinio") buckets.patrocinio += Number(t.amount || 0);
          else buckets.outros += Number(t.amount || 0);
        }
        return {
          displayValue: display,
          subtotals: [
            { label: "Bilheteira", value: buckets.bilheteira },
            { label: "Patrocínio", value: buckets.patrocinio },
            { label: "Outros", value: buckets.outros },
          ],
          formalidadeBreakdown: null, phase, modeUsed, unavailable: false,
        };
      } else {
        // Expense
        const expTx = realizedTx.filter((t: any) => t.type === "expense");
        const paid = expTx.filter((t: any) => t.status === "paid").reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
        const approved = expTx.filter((t: any) => t.status === "approved").reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
        const own = paid + approved;
        const masterTx = Number(args.masterExpenseShare || 0);
        const cache = Number(args.cacheImpact || 0);
        // Realized NÃO inclui forecasts do Master (só TX).
        const extra = masterTx + cache;
        return {
          displayValue: own + extra,
          subtotals: [
            { label: "Pago", value: paid },
            { label: "Comprometido (próprio)", value: approved },
          ],
          formalidadeBreakdown: null, phase, modeUsed, unavailable: false,
        };
      }
    }


    // ── COMMITTED ─────────────────────────────────────────────
    if (modeUsed === "committed") {
      const approved = forecasts.filter((f: any) =>
        f.status === "approved" && !f.is_transitory && !f.exclude_from_result
      );
      const total = approved.reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
      const bd = approved.reduce<FormalidadeBreakdown>(
        (acc, f) => addToBreakdown(acc, f.formalidade, Number(f.amount || 0)),
        emptyBreakdown(),
      );
      const extra = kind === "expense"
        ? Number(args.masterExpenseShare || 0) + Number(args.masterForecastShare || 0) + Number(args.cacheImpact || 0)
        : 0;
      return {
        displayValue: total + extra,
        subtotals: [], // mini-barra é render direto da breakdown
        formalidadeBreakdown: bd,
        phase, modeUsed, unavailable: approved.length === 0,
      };
    }

    // ── FORECAST ──────────────────────────────────────────────
    if (kind === "income") {
      if (!simCfg || simInputs.length === 0) {
        return {
          displayValue: 0,
          subtotals: [
            { label: "Bilheteira", value: null },
            { label: "Patrocínio", value: null },
            { label: "A&B", value: null },
            { label: "Outros", value: null },
          ],
          formalidadeBreakdown: null, phase, modeUsed, unavailable: true,
        };
      }
      const cfg: CoalaConfig = {
        ab_drink_avg_ticket: Number(simCfg.default_drink_avg_ticket || 0),
        ab_food_avg_ticket: Number(simCfg.default_food_avg_ticket || 0),
        ab_drink_passthrough_pct: Number(simCfg.ab_drink_passthrough_pct || 0),
        ab_food_passthrough_pct: Number(simCfg.ab_food_passthrough_pct || 0),
        sponsorship_revenue: Number(simCfg.sponsorship_revenue || 0),
        souvenir_revenue: Number(simCfg.souvenir_revenue || 0),
        souvenir_cost: Number(simCfg.souvenir_cost || 0),
        bonif_bebidas: Number(simCfg.bonif_bebidas || 0),
        ponto_vendido: Number(simCfg.ponto_vendido || 0),
        other_revenue: Number(simCfg.other_revenue || 0),
        prior_year_tickets: Number(simCfg.prior_year_tickets || 0),
        prior_year_drink: Number(simCfg.prior_year_drink || 0),
        prior_year_food: Number(simCfg.prior_year_food || 0),
        prior_year_sponsor: Number(simCfg.prior_year_sponsor || 0),
        prior_year_souvenir: Number(simCfg.prior_year_souvenir || 0),
        prior_year_other: Number(simCfg.prior_year_other || 0),
        ticket_iva_pct: Number(simCfg.ticket_iva_pct || 6),
      };
      const sessions: CoalaSession[] = simInputs.map((s: any) => ({
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
      }));
      const rev = computeScenarioRevenue(sessions, cfg, scenario);
      const abZero = cfg.ab_drink_avg_ticket === 0 && cfg.ab_food_avg_ticket === 0;
      return {
        displayValue: rev.totalRevenue,
        subtotals: [
          { label: "Bilheteira", value: rev.ticketsRevenue },
          { label: "Patrocínio", value: rev.sponsorRevenue },
          { label: "A&B", value: abZero ? null : rev.drinkRevenue + rev.foodRevenue },
          { label: "Outros", value: rev.souvenirRevenue + rev.otherCredits },
        ],
        formalidadeBreakdown: null, phase, modeUsed, unavailable: false,
      };
    } else {
      // Forecast custos: formalidade-aware
      const approved = forecasts.filter((f: any) =>
        f.status === "approved" && !f.is_transitory && !f.exclude_from_result
      );
      // soma TX por category_id+event_id (paid+approved+pending)
      const txExpense = txs.filter((t: any) => t.type === "expense" && !t.is_transitory);
      const txByCat = new Map<string, number>();
      for (const t of txExpense) {
        if (!t.category_id) continue;
        if (t.status !== "paid" && t.status !== "approved" && t.status !== "pending") continue;
        txByCat.set(t.category_id, (txByCat.get(t.category_id) ?? 0) + Number(t.amount || 0));
      }
      // categorias cobertas pelo BP
      const bpCats = new Set<string>(approved.map((f: any) => f.category_id).filter(Boolean));
      let bpSum = 0;
      let txLinkedSum = 0;
      for (const f of approved) {
        const f_ = f as any;
        const isBlinded =
          f_.formalidade === "fechado" ||
          f_.formalidade === "pago_parcial" ||
          f_.formalidade === "pago_total";
        if (isBlinded && f_.category_id) {
          const txAmt = txByCat.get(f_.category_id) ?? 0;
          if (txAmt > 0) {
            txLinkedSum += txAmt;
            continue;
          }
        }
        bpSum += Number(f_.amount || 0);
      }
      // órfãs: TX em categorias fora do BP
      let orphanSum = 0;
      for (const [cat, sum] of txByCat) {
        if (!bpCats.has(cat)) orphanSum += sum;
      }
      const extra =
        Number(args.masterExpenseShare || 0) +
        Number(args.masterForecastShare || 0) +
        Number(args.cacheImpact || 0);
      const total = bpSum + txLinkedSum + orphanSum + extra;
      return {
        displayValue: total,
        subtotals: [
          { label: "BP próprio", value: bpSum },
          { label: "TX fora do BP", value: txLinkedSum + orphanSum },
          { label: "Forecast total", value: total },
        ],
        formalidadeBreakdown: null, phase, modeUsed, unavailable: false,
      };
    }
  }, [txs, forecasts, simCfg, simInputs, mode, kind, scenario, eventStatus, primaryEventDate,
      args.ticketSalesRevenue, args.masterExpenseShare, args.masterForecastShare, args.cacheImpact]);
}
