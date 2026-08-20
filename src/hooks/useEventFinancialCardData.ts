import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type CardMode, type ModeUsed, type Phase, type RevenueScenario,
  type FormalidadeBreakdown,
  emptyBreakdown, addToBreakdown, detectPhase, resolveMode, classifyIncomeL1,
} from "@/lib/event-financial-card";
import { lineValue, computeOutsideBpExcess } from "@/lib/event-cost-basis";

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
  /** Se true, aplica IVA (bruto). Default false = base líquida. */
  withVat?: boolean;
  /** Incluir linhas de overhead do BP (default OFF). */
  includeOverhead?: boolean;
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
  const {
    eventId, eventIds, kind, mode, scenario = "forecast", eventStatus, primaryEventDate,
    withVat = false, includeOverhead = false,
  } = args;
  const ids = eventIds.length > 0 ? eventIds : [eventId];
  const idsKey = ids.slice().sort().join(",");

  // Valor da linha c/ ou s/IVA — arredondamento ao cêntimo LINHA A LINHA (Art.º 18 CIVA).
  const eff = (amount: number | null | undefined, ivaRate: number | null | undefined) =>
    lineValue(amount, ivaRate, withVat);

  // ── transactions (paid + approved, NÃO inclui pending para alinhar com Cards/Análise) ──
  const { data: txs = [] } = useQuery({
    queryKey: ["efc-tx", idsKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, event_id, type, status, amount, paid_amount, iva_rate, category_id, is_transitory, is_hidden, reversed_at, account_categories(code)")
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
        .select("id, event_id, type, status, amount, iva_rate, category_id, transaction_id, formalidade, is_transitory, exclude_from_result, is_overhead")
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
      (t.status === "paid" || t.status === "approved" || t.status === "partially_paid") && !t.is_transitory
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
    const modeUsed: ModeUsed = resolveMode(mode, phase, kind);


    // ── REALIZED ──────────────────────────────────────────────
    if (modeUsed === "realized") {
      if (kind === "income") {
        const incomeTx = realizedTx.filter((t: any) => t.type === "income");
        const nonTicket = incomeTx.filter((t: any) => t.account_categories?.code !== "1.1.01");
        const nonTicketSum = nonTicket.reduce((s: number, t: any) => s + eff(t.amount, t.iva_rate), 0);
        const allIncomeSum = incomeTx.reduce((s: number, t: any) => s + eff(t.amount, t.iva_rate), 0);
        const hasSalesNow = (args.ticketSalesRevenue ?? 0) > 0;
        const display = hasSalesNow ? (args.ticketSalesRevenue ?? 0) + nonTicketSum : allIncomeSum;

        // Subtotais por rubrica exata
        const buckets = { bilheteira: hasSalesNow ? (args.ticketSalesRevenue ?? 0) : 0, patrocinio: 0, ab: 0, outros: 0 };
        const source = hasSalesNow ? nonTicket : incomeTx;
        for (const t of source) {
          const code = t.account_categories?.code ?? "";
          const cls = classifyIncomeL1(code);
          // A substituição por ticket_sales aplica-se APENAS a 1.1.01 (bilheteira),
          // nunca a outras rubricas 1.1.* (ex. 1.1.03 A&B).
          if (hasSalesNow && code === "1.1.01") continue;
          const v = eff(t.amount, t.iva_rate);
          if (cls === "bilheteira") buckets.bilheteira += v;
          else if (cls === "patrocinio") buckets.patrocinio += v;
          else if (cls === "ab") buckets.ab += v;
          else buckets.outros += v;
        }

        return {
          displayValue: display,
          subtotals: [
            { label: "Bilheteira", value: buckets.bilheteira },
            { label: "Patrocínio", value: buckets.patrocinio },
            ...(buckets.ab !== 0 ? [{ label: "A&B", value: buckets.ab }] : []),
            { label: "Outros", value: buckets.outros },
          ],
          formalidadeBreakdown: null, phase, modeUsed, unavailable: false,
        };

      } else {
        // Expense
        const expTx = realizedTx.filter((t: any) => t.type === "expense");
        let paid = 0;
        let approved = 0;
        for (const t of expTx) {
          const gross = eff(t.amount, t.iva_rate);
          if (t.status === "paid") { paid += gross; continue; }
          if (t.status === "partially_paid") {
            // paid_amount é bruto; separa recebido/pago do que falta liquidar.
            const already = Math.min(Math.max(Number(t.paid_amount || 0), 0), gross);
            paid += already;
            approved += gross - already;
            continue;
          }
          approved += gross;
        }
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
      // Operacionais: linhas aprovadas que entram no resultado.
      // Overhead: linhas is_overhead (têm exclude_from_result=true) — só com o toggle ON.
      const operational = forecasts.filter((f: any) =>
        f.status === "approved" && !f.is_transitory && !f.is_overhead && !f.exclude_from_result
      );
      const overheadLines = forecasts.filter((f: any) =>
        f.status === "approved" && !f.is_transitory && f.is_overhead
      );
      const approved = includeOverhead ? [...operational, ...overheadLines] : operational;
      const total = approved.reduce((s: number, f: any) => s + eff(f.amount, f.iva_rate), 0);
      const bd = approved.reduce<FormalidadeBreakdown>(
        (acc, f) => addToBreakdown(acc, f.formalidade, eff(f.amount, f.iva_rate)),
        emptyBreakdown(),
      );

      // Excesso por rubrica sobre as linhas OPERACIONAIS do BP
      // (Σ max(realizado − previsto, 0)) — entra SEMPRE na base "BP ajustado".
      // Não é opcional: um total dependente de um clique produz erro de fecho.
      const outsideBp = kind === "expense"
        ? computeOutsideBpExcess(
            operational,
            txs.filter((t: any) =>
              t.type === "expense" && !t.is_transitory && !t.is_hidden && !t.reversed_at
            ),
            withVat,
          )
        : 0;

      const extra = kind === "expense"
        ? Number(args.masterExpenseShare || 0) + Number(args.masterForecastShare || 0) + Number(args.cacheImpact || 0)
        : 0;
      return {
        displayValue: total + extra + outsideBp,
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
      // Forecast custos: formalidade-aware.
      // Regra: cada transação é consumida NO MÁXIMO UMA VEZ (vínculo 1:1 via
      // event_forecasts.transaction_id; fallback por categoria só para linhas sem vínculo).
      const approved = forecasts.filter((f: any) =>
        f.status === "approved" && !f.is_transitory &&
        (f.is_overhead ? includeOverhead : !f.exclude_from_result)

      );
      const txEligible = txs.filter((t: any) =>
        t.type === "expense" && !t.is_transitory &&
        (t.status === "paid" || t.status === "approved" || t.status === "partially_paid" || t.status === "pending")
      );
      const txAmount = new Map<string, number>();
      const txIdsByCat = new Map<string, string[]>();
      for (const t of txEligible) {
        txAmount.set(t.id, eff(t.amount, t.iva_rate));
        if (!t.category_id) continue;
        const arr = txIdsByCat.get(t.category_id) ?? [];
        arr.push(t.id);
        txIdsByCat.set(t.category_id, arr);
      }
      const bpCats = new Set<string>(approved.map((f: any) => f.category_id).filter(Boolean));
      const usedTxIds = new Set<string>();
      const isBlinded = (f: any) =>
        f.formalidade === "fechado" || f.formalidade === "pago_parcial" || f.formalidade === "pago_total";

      let bpSum = 0;
      let txLinkedSum = 0;
      const pending: any[] = [];

      // Passo 1 — vínculo directo 1:1.
      for (const f of approved as any[]) {
        if (isBlinded(f) && f.transaction_id && txAmount.has(f.transaction_id) && !usedTxIds.has(f.transaction_id)) {
          usedTxIds.add(f.transaction_id);
          txLinkedSum += txAmount.get(f.transaction_id) ?? 0;
          continue;
        }
        pending.push(f);
      }

      // Passo 2 — fallback por categoria (consome cada TX uma única vez).
      for (const f of pending) {
        if (isBlinded(f) && f.category_id) {
          const ids = (txIdsByCat.get(f.category_id) ?? []).filter((id) => !usedTxIds.has(id));
          const sum = ids.reduce((s, id) => s + (txAmount.get(id) ?? 0), 0);
          if (ids.length > 0) {
            ids.forEach((id) => usedTxIds.add(id));
            // A TX substitui a linha do BP (intenção do modo), mesmo quando soma 0.
            txLinkedSum += sum;
            continue;
          }
          if (usedTxIds.size > 0 && (txIdsByCat.get(f.category_id) ?? []).length > 0) {
            // Categoria já totalmente consumida por outra linha → não somar de novo nem duplicar BP.
            continue;
          }
        }
        bpSum += eff(f.amount, f.iva_rate);
      }

      // TX sem BP: categorias fora do BP (ou sem categoria) nunca consumidas.
      let orphanSum = 0;
      for (const t of txEligible) {
        if (usedTxIds.has(t.id)) continue;
        if (t.category_id && bpCats.has(t.category_id)) continue;
        orphanSum += txAmount.get(t.id) ?? 0;
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
          { label: "TX que substituem BP", value: txLinkedSum },
          { label: "TX sem BP", value: orphanSum },
          { label: "Forecast total", value: total },
        ],
        formalidadeBreakdown: null, phase, modeUsed, unavailable: false,
      };
    }

  }, [txs, forecasts, simCfg, simInputs, mode, kind, scenario, eventStatus, primaryEventDate, withVat,
      includeOverhead,
      args.ticketSalesRevenue, args.masterExpenseShare, args.masterForecastShare, args.cacheImpact]);

}
