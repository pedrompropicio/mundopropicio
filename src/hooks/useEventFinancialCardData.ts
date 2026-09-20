import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type CardMode, type ModeUsed, type Phase, type RevenueScenario,
  type FormalidadeBreakdown,
  emptyBreakdown, addToBreakdown, detectPhase, resolveMode, classifyIncomeL1,
} from "@/lib/event-financial-card";
import {
  lineValue, computeOutsideBpExcess,
  computeEventCostOnBasis, computeMasterQuota,
} from "@/lib/event-cost-basis";
import { isValidFechoTransaction } from "@/lib/fecho-filters";
import { hasResultBlockingFlags } from "@/lib/fecho-filters";
import { useEventRevenueBasis } from "@/hooks/useEventRevenueBasis";
import { useEventRootSettlements } from "@/hooks/useEventRootSettlements";
import { keepRootPerimeter } from "@/lib/settlement-perimeter";

import { computeScenarioRevenue, type CoalaConfig, type CoalaSession } from "@/lib/event-simulator-coala";
import { fetchAllPagedQuery } from "@/lib/supabase-paging";



export interface UseEventFinancialCardDataArgs {
  eventId: string;
  /** Todos os event_ids relevantes (master + subs em vista global, ou só o sub seleccionado). */
  eventIds: string[];
  kind: "income" | "expense";
  mode: CardMode;
  scenario?: RevenueScenario; // só usado em forecast+income
  eventStatus?: string | null;
  primaryEventDate?: string | null;
  /** Receita de ticket_sales em par {net, gross} (vem do EventDetail). */
  ticketSales?: { net: number; gross: number };
  /**
   * Vista de CIDADE numa turnê (issue #217): quota igualitária do custo do Master.
   * O custo do Master é calculado com o MESMO critério da cidade e da turnê
   * (`computeEventCostOnBasis`) e dividido por `siblingCount`.
   */
  masterQuota?: { masterEventId: string; siblingCount: number };
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
  /**
   * Totais do perímetro em vigor nas DUAS bases de IVA (#223 correção).
   * Alimenta o card de Lucro: o contrato escolhe a base de IVA, o perímetro
   * (modo do card) escolhe os valores — nunca se misturam perímetros.
   */
  perimeter?: { net: number; gross: number } | null;
  /**
   * Receita REAL do perímetro da raiz na base de IVA do card (D24 + D25 g3).
   * Só definido em kind='income'. É este o valor que alimenta o Lucro/margem,
   * porque o fecho nunca usa receita prevista — o toggle "previsto + excedido"
   * é apenas uma vista do card de Receitas.
   */
  realValue?: number;
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

  // SSoT da receita (D24) — só para kind='income'. O custo mantém a lógica própria.
  const { data: revenue } = useEventRevenueBasis(
    kind === "income" ? eventId : undefined,
    kind === "income" ? ids : [],
  );

  // Valor da linha c/ ou s/IVA — arredondamento ao cêntimo LINHA A LINHA (Art.º 18 CIVA).
  const eff = (amount: number | null | undefined, ivaRate: number | null | undefined) =>
    lineValue(amount, ivaRate, withVat);

  // Bilheteira obedece ao MESMO seletor das transações: bruto com c/IVA, líquido s/IVA.
  const ticketRevenue = withVat
    ? Number(args.ticketSales?.gross ?? 0)
    : Number(args.ticketSales?.net ?? 0);
  const ticketNet = Number(args.ticketSales?.net ?? 0);

  // ── transactions (paid + approved + partially_paid, NÃO inclui pending para alinhar com Cards/Análise) ──
  // NOTA: o Card mostra "Pago vs Comprometido" usando paid_amount, por isso inclui "partially_paid".
  // O Fecho (isValidFechoTransaction) só aceita approved/paid. A diferença de status é intencional;
  // o que se alinha entre vistas são os flags bloqueadores, via hasResultBlockingFlags.
  const { data: txsAll = [] } = useQuery({
    queryKey: ["efc-tx", idsKey],
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("transactions")
        .select("id, event_id, type, status, amount, paid_amount, iva_rate, category_id, is_transitory, is_hidden, reversed_at, exclude_from_result, event_settlement_id, account_categories(code)")
        .in("event_id", ids));
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: ids.length > 0,
  });

  // Perímetro da raiz (D25 g3): linhas marcadas com um fechamento filho são
  // exclusivas desse fechamento e nunca entram no resultado do evento.
  const { data: rootInfo } = useEventRootSettlements(ids);
  const rootIds = rootInfo?.rootIds;
  const txs = useMemo(() => keepRootPerimeter(txsAll, rootIds), [txsAll, rootIds]);


  // ── BP forecasts (active version) — usados em committed e forecast ──
  const { data: forecastsAll = [] } = useQuery({
    queryKey: ["efc-forecasts", idsKey, kind],
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("event_forecasts")
        .select("id, event_id, type, status, amount, iva_rate, category_id, transaction_id, formalidade, is_transitory, exclude_from_result, is_overhead, event_settlement_id")
        .in("event_id", ids)
        .is("version_id", null)
        .eq("type", kind));
      if (error) throw error;
      return (data ?? []) as any[];
    },

    enabled: ids.length > 0,
  });
  const forecasts = useMemo(() => keepRootPerimeter(forecastsAll, rootIds), [forecastsAll, rootIds]);

  // ── Master de uma turnê (issue #217): mesmas colunas e filtros dos `ids`.
  // O custo do Master é calculado com o MESMO critério e depois dividido pelas cidades.
  const masterId = kind === "expense" ? (args.masterQuota?.masterEventId ?? null) : null;
  const masterIdsArr = masterId ? [masterId] : [];

  const { data: masterTxsAll = [] } = useQuery({
    queryKey: ["efc-master-tx", masterId],
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("transactions")
        .select("id, event_id, type, status, amount, paid_amount, iva_rate, category_id, is_transitory, is_hidden, reversed_at, exclude_from_result, event_settlement_id, account_categories(code)")
        .in("event_id", masterIdsArr));
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!masterId,
  });

  const { data: masterForecastsAll = [] } = useQuery({
    queryKey: ["efc-master-forecasts", masterId, kind],
    queryFn: async () => {
      const { data, error } = await fetchAllPagedQuery(supabase
        .from("event_forecasts")
        .select("id, event_id, type, status, amount, iva_rate, category_id, transaction_id, formalidade, is_transitory, exclude_from_result, is_overhead, event_settlement_id")
        .in("event_id", masterIdsArr)
        .is("version_id", null)
        .eq("type", kind));
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!masterId,
  });

  const { data: masterRootInfo } = useEventRootSettlements(masterIdsArr);
  const masterRootIds = masterRootInfo?.rootIds;
  const masterTxs = useMemo(
    () => keepRootPerimeter(masterTxsAll, masterRootIds),
    [masterTxsAll, masterRootIds],
  );
  const masterForecasts = useMemo(
    () => keepRootPerimeter(masterForecastsAll, masterRootIds),
    [masterForecastsAll, masterRootIds],
  );

  // ── Simulator (apenas em forecast+income) ──
  const simEnabled = mode === "forecast" && kind === "income";
  const { data: simCfg } = useQuery({
    queryKey: ["efc-sim-cfg", eventId],
    queryFn: async () => {
      const { data, error: qErr1 } = await supabase
        .from("event_simulator_config")
        .select("*")
        .eq("event_id", eventId)
        .maybeSingle();
      if (qErr1) throw qErr1;
      return data as any | null;
    },
    enabled: simEnabled,
  });

  const { data: simInputs = [] } = useQuery({
    queryKey: ["efc-sim-inputs", eventId],
    queryFn: async () => {
      const { data, error: qErr2 } = await supabase
        .from("event_simulator_inputs")
        .select("*")
        .eq("event_id", eventId)
        .order("day_index")
        .order("zone_label");
      if (qErr2) throw qErr2;
      return (data ?? []) as any[];
    },
    enabled: simEnabled,
  });

  return useMemo<UseEventFinancialCardDataResult>(() => {
    // ── Fase ──
    const realizedTx = txs.filter((t: any) =>
      (t.status === "paid" || t.status === "approved" || t.status === "partially_paid") && !hasResultBlockingFlags(t)
    );

    const hasTx = realizedTx.length > 0;
    const hasSales = ticketNet > 0;
    const phase = detectPhase({
      eventStatus,
      lastDate: primaryEventDate,
      firstDate: primaryEventDate,
      hasTransactions: hasTx,
      hasSales,
    });
    const modeUsed: ModeUsed = resolveMode(mode, phase, kind);

    // Receita REAL (perímetro da raiz) na base de IVA do card — alimenta o Lucro.
    const realValue = kind === "income"
      ? (revenue ? (withVat ? revenue.real.total.gross : revenue.real.total.net) : 0)
      : undefined;

    /**
     * CUSTO POR EVENTO, nunca pooled (issue #217).
     *
     * Um único critério (`computeEventCostOnBasis`) para a cidade, para a quota
     * do Master e para a turnê. Somar evento a evento é o que torna
     * `Σ custo(cidades) = custo(turnê)` verdadeiro por construção e impede que
     * o excesso por rubrica de uma cidade seja absorvido pela folga de outra.
     */
    const costForMode = (m: "realized" | "committed", vat: boolean = withVat) => {
      const byEvent = new Map<string, { f: any[]; t: any[] }>();
      const bucket = (evId: string) => {
        let b = byEvent.get(evId);
        if (!b) { b = { f: [], t: [] }; byEvent.set(evId, b); }
        return b;
      };
      for (const f of forecasts as any[]) bucket(f.event_id ?? eventId).f.push(f);
      for (const t of txs as any[]) {
        if (t.type !== "expense") continue;
        bucket(t.event_id ?? eventId).t.push(t);
      }

      let total = 0, overhead = 0, excess = 0, approvedCount = 0;
      for (const b of byEvent.values()) {
        const r = computeEventCostOnBasis({
          forecasts: b.f, transactions: b.t, mode: m, withVat: vat, includeOverhead,
        });
        total += r.total;
        overhead += r.overhead;
        excess += r.excess;
        approvedCount += r.approvedCount;
      }

      // Quota do Master: MESMO critério, dividido pelo nº de cidades.
      let quota = 0;
      if (args.masterQuota) {
        const masterCost = computeEventCostOnBasis({
          forecasts: masterForecasts as any[],
          transactions: (masterTxs as any[]).filter((t) => t.type === "expense"),
          mode: m, withVat: vat, includeOverhead,
        }).total;
        quota = computeMasterQuota(masterCost, args.masterQuota.siblingCount);
      }

      return { total, overhead, excess, approvedCount, quota };
    };


    // ── REALIZED ──────────────────────────────────────────────
    if (modeUsed === "realized") {
      if (kind === "income") {
        // SSoT da receita (D24): bilheteira linha a linha + TX pelo filtro canónico
        // do Fecho, anti-duplicação por prefixo 1.1.01. Sem cálculo local.
        const b = revenue?.real.buckets;
        const pick = (k: "bilheteira" | "patrocinio" | "ab" | "outros") =>
          b ? (withVat ? b[k].gross : b[k].net) : 0;
        const display = revenue
          ? withVat ? revenue.real.total.gross : revenue.real.total.net
          : 0;
        const ab = pick("ab");
        return {
          displayValue: display,
          subtotals: [
            { label: "Bilheteira", value: pick("bilheteira") },
            { label: "Patrocínio", value: pick("patrocinio") },
            ...(ab !== 0 ? [{ label: "A&B", value: ab }] : []),
            { label: "Outros", value: pick("outros") },
          ],
          realValue, formalidadeBreakdown: null, phase, modeUsed, unavailable: false,
          perimeter: revenue ? { net: revenue.real.total.net, gross: revenue.real.total.gross } : null,
        };

      } else {
        // Expense — universo canónico do Fecho (`isValidFechoTransaction`),
        // somado evento a evento pelo critério único (#217).
        const c = costForMode("realized");
        const expTx = (txs as any[]).filter(
          (t) => t.type === "expense" && isValidFechoTransaction(t),
        );
        let paid = 0;
        let approved = 0;
        for (const t of expTx) {
          const gross = eff(t.amount, t.iva_rate);
          if (t.status === "paid") paid += gross;
          else approved += gross;
        }

        const cache = Number(args.cacheImpact || 0);
        // Perímetro nas duas bases de IVA — o Lucro escolhe a base pelo contrato.
        const cNet = withVat ? { total: 0, quota: 0, ...costForMode("realized", false) } : { total: c.total, quota: c.quota };
        const cGross = withVat ? { total: c.total, quota: c.quota } : costForMode("realized", true);
        return {
          displayValue: c.total + c.quota + cache,
          subtotals: [
            { label: "Pago", value: paid },
            { label: "Comprometido (próprio)", value: approved },
          ],
          formalidadeBreakdown: null, phase, modeUsed, unavailable: false,
          meta: { masterQuota: c.quota },
          perimeter: { net: cNet.total + cNet.quota + cache, gross: cGross.total + cGross.quota + cache },
        };
      }
    }


    // ── COMMITTED ─────────────────────────────────────────────
    if (modeUsed === "committed") {
      // Receita: "Previsto + excedido" (D24) vem do SSoT — por componente
      // max(real, previsto corrente), na base de IVA da VISTA (#207).
      if (kind === "income") {
        const c = revenue?.committed;
        const pickC = (k: "bilheteira" | "patrocinio" | "ab" | "outros") =>
          c ? (withVat ? c.buckets[k].gross : c.buckets[k].net) : null;
        const abC = pickC("ab");
        return {
          displayValue: c ? (withVat ? c.total.gross : c.total.net) : 0,
          subtotals: [
            { label: "Bilheteira", value: pickC("bilheteira") },
            { label: "Patrocínio", value: pickC("patrocinio") },
            ...(abC != null && abC !== 0 ? [{ label: "A&B", value: abC }] : []),
            { label: "Outros", value: pickC("outros") },
          ],
          realValue, formalidadeBreakdown: null, phase, modeUsed, unavailable: !c,
          perimeter: c ? { net: c.total.net, gross: c.total.gross } : null,
        };
      }
      // Custo "Previsto + excedido" pelo critério único, EVENTO A EVENTO (#217):
      // linhas operacionais aprovadas + excesso por rubrica (só approved/paid,
      // nunca `pending`) + overhead quando o toggle está ligado.
      const c2 = costForMode("committed");

      // Mini-barra de formalidade — apresentação das linhas aprovadas do BP.
      const approvedLines = (forecasts as any[]).filter((f) =>
        f.status === "approved" && !f.is_transitory &&
        (f.is_overhead ? includeOverhead : !f.exclude_from_result)
      );
      const bd = approvedLines.reduce<FormalidadeBreakdown>(
        (acc, f) => addToBreakdown(acc, f.formalidade, eff(f.amount, f.iva_rate)),
        emptyBreakdown(),
      );

      const cache = Number(args.cacheImpact || 0);
      // Perímetro nas duas bases de IVA — o Lucro escolhe a base pelo contrato.
      const c2Net = withVat ? costForMode("committed", false) : { total: c2.total, quota: c2.quota };
      const c2Gross = withVat ? { total: c2.total, quota: c2.quota } : costForMode("committed", true);
      return {
        displayValue: c2.total + c2.quota + cache,
        subtotals: [], // mini-barra é render direto da breakdown
        formalidadeBreakdown: bd,
        phase, modeUsed, unavailable: c2.approvedCount === 0,
        meta: { overhead: c2.overhead, excess: c2.excess, masterQuota: c2.quota },
        perimeter: { net: c2Net.total + c2Net.quota + cache, gross: c2Gross.total + c2Gross.quota + cache },
      };
    }


    // ── FORECAST ──────────────────────────────────────────────
    if (kind === "income") {
      // Cenário Forecast = previsto corrente do SSoT (D24): bilheteira ao vivo,
      // A&B, patrocínios e outras receitas de BP. Os cenários today/breakeven
      // continuam a vir directamente do motor do Simulador.
      if (scenario === "forecast") {
        const f = revenue?.currentForecast;
        const pickF = (k: "bilheteira" | "patrocinio" | "ab" | "outros") => {
          const p = f?.buckets[k];
          return p ? (withVat ? p.gross : p.net) : null;
        };
        return {
          displayValue: f?.total ? (withVat ? f.total.gross : f.total.net) : 0,
          subtotals: [
            { label: "Bilheteira", value: pickF("bilheteira") },
            { label: "Patrocínio", value: pickF("patrocinio") },
            { label: "A&B", value: pickF("ab") },
            { label: "Outros", value: pickF("outros") },
          ],
          realValue, formalidadeBreakdown: null, phase, modeUsed,
          unavailable: !f || f.total == null,
          perimeter: f?.total ? { net: f.total.net, gross: f.total.gross } : null,
        };
      }
      if (!simCfg || simInputs.length === 0) {
        return {
          displayValue: 0,
          subtotals: [
            { label: "Bilheteira", value: null },
            { label: "Patrocínio", value: null },
            { label: "A&B", value: null },
            { label: "Outros", value: null },
          ],
          realValue, formalidadeBreakdown: null, phase, modeUsed, unavailable: true,
          perimeter: null,
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
        realValue, formalidadeBreakdown: null, phase, modeUsed, unavailable: false,
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
        t.type === "expense" && !hasResultBlockingFlags(t) &&
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

      // Rateio da turnê no modo exploratório Forecast: mesma quota da base
      // "Previsto + excedido" (o Forecast não tem base própria no Master).
      const quota = costForMode("committed").quota;
      const extra = quota + Number(args.cacheImpact || 0);
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
        meta: { masterQuota: quota },
      };
    }

  }, [txs, forecasts, revenue, simCfg, simInputs, mode, kind, scenario, eventStatus, primaryEventDate, withVat,
      includeOverhead, eventId, masterForecasts, masterTxs,
      args.ticketSales, args.masterQuota, args.cacheImpact]);

}
