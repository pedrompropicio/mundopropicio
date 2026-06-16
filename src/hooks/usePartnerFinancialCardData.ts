import { useMemo } from "react";
import {
  type CardMode, type ModeUsed, type Phase,
  type FormalidadeBreakdown,
  emptyBreakdown, addToBreakdown, detectPhase, defaultModeForPhase, classifyIncomeL1,
} from "@/lib/event-financial-card";

/**
 * Hook DERIVADO próprio do portal sócio (NÃO mexe no hook do staff).
 *
 * Reutiliza os helpers PUROS neutros de `event-financial-card.ts`
 * (detectPhase / defaultModeForPhase / classifyIncomeL1 / formalidade /
 * tipos CardMode/Phase) mas a lógica de cálculo é própria, aplicando as
 * 3 regras permanentes do sócio:
 *
 *   1. RECEITAS  → sempre NET (sem IVA)         [amount é NET por convenção]
 *   2. DESPESAS  → sempre BRUTO (com IVA)       [amount × (1 + iva_rate/100)]
 *   3. BILHETEIRA prevista → CARGAS (event_ticket_lots), NÃO BP income 1.1*
 *
 * Sem queries próprias: recebe os dados JÁ carregados pelo `PartnerEventDetail`,
 * garantindo respeito automático à RLS partner e evitando queries duplicadas.
 */

export interface PartnerTxRow {
  id: string;
  event_id?: string | null;
  type: "income" | "expense" | string;
  status: string;
  amount: number | string | null;
  iva_rate?: number | string | null;
  category_id?: string | null;
  is_transitory?: boolean | null;
  exclude_from_result?: boolean | null;
  account_categories?: { code?: string | null } | null;
}

export interface PartnerForecastRow {
  id: string;
  event_id?: string | null;
  type: "income" | "expense" | string;
  status: string;
  amount: number | string | null;
  iva_rate?: number | string | null;
  category_id?: string | null;
  formalidade?: string | null;
  is_transitory?: boolean | null;
  exclude_from_result?: boolean | null;
  account_categories?: { code?: string | null } | null;
}

export interface UsePartnerFinancialCardDataArgs {
  kind: "income" | "expense";
  mode: CardMode;

  /** Estado + data primária para resolver fase (Auto). */
  eventStatus?: string | null;
  primaryEventDate?: string | null;

  /** Dados já carregados pelo PartnerEventDetail. */
  transactions: PartnerTxRow[];
  forecasts: PartnerForecastRow[]; // active version (version_id IS NULL), todos os types

  // ── Bilheteira (NET) ──
  /** Receita REAL de bilheteira (NET). Usada no Realizado income. */
  ticketRevenueNet?: number;
  /** Receita PREVISTA de bilheteira via CARGAS (event_ticket_lots, NET). Usada em Comprometido/Forecast income. */
  ticketCargasNet?: number;

  // ── Extras de despesa já em BRUTO (caller pré-calcula com calcTotalWithIva) ──
  masterExpenseShareGross?: number;  // TX do Master rateadas ÷ N
  masterForecastShareGross?: number; // forecasts overhead do Master rateados ÷ N (só committed/forecast)
  cacheImpactGross?: number;         // cachê efetivo
}

export interface PartnerSubtotal {
  label: string;
  value: number | null;
}

export interface UsePartnerFinancialCardDataResult {
  displayValue: number;
  subtotals: PartnerSubtotal[];
  formalidadeBreakdown: FormalidadeBreakdown | null;
  phase: Phase;
  modeUsed: ModeUsed;
  unavailable: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** amount × (1 + iva_rate/100). amount é NET; resultado é BRUTO. */
const gross = (amount: unknown, ivaRate: unknown): number => {
  const a = num(amount);
  const i = num(ivaRate);
  return a * (1 + i / 100);
};

export function usePartnerFinancialCardData(
  args: UsePartnerFinancialCardDataArgs,
): UsePartnerFinancialCardDataResult {
  const {
    kind, mode, eventStatus, primaryEventDate,
    transactions, forecasts,
    ticketRevenueNet = 0, ticketCargasNet = 0,
    masterExpenseShareGross = 0, masterForecastShareGross = 0, cacheImpactGross = 0,
  } = args;

  return useMemo<UsePartnerFinancialCardDataResult>(() => {
    // ─── Fase + modo efetivo (reutiliza helpers neutros do staff) ───
    const realizedTx = transactions.filter(
      (t) => (t.status === "paid" || t.status === "approved") && !t.is_transitory,
    );
    const hasTx = realizedTx.length > 0;
    const hasSales = ticketRevenueNet > 0;
    const phase = detectPhase({
      eventStatus,
      lastDate: primaryEventDate,
      firstDate: primaryEventDate,
      hasTransactions: hasTx,
      hasSales,
    });
    const modeUsed: ModeUsed = mode === "auto" ? defaultModeForPhase(phase) : mode;

    // ════════════════════════════════════════════════════
    //  REALIZADO
    // ════════════════════════════════════════════════════
    if (modeUsed === "realized") {
      if (kind === "income") {
        // Receitas NET: ticketRevenueNet (cargas reais) + TX income NET (amount cru)
        const incomeTx = realizedTx.filter((t) => t.type === "income" && !t.exclude_from_result);
        const nonTicket = incomeTx.filter(
          (t) => classifyIncomeL1(t.account_categories?.code) !== "bilheteira",
        );
        const nonTicketSum = nonTicket.reduce((s, t) => s + num(t.amount), 0);
        const display = ticketRevenueNet + nonTicketSum;

        const buckets = { bilheteira: ticketRevenueNet, patrocinio: 0, outros: 0 };
        for (const t of nonTicket) {
          const cls = classifyIncomeL1(t.account_categories?.code);
          if (cls === "patrocinio") buckets.patrocinio += num(t.amount);
          else buckets.outros += num(t.amount);
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
        // Despesas BRUTO: TX expense × (1+IVA) + extras (já em bruto)
        const expTx = realizedTx.filter((t) => t.type === "expense" && !t.exclude_from_result);
        const paidGross = expTx
          .filter((t) => t.status === "paid")
          .reduce((s, t) => s + gross(t.amount, t.iva_rate), 0);
        const approvedGross = expTx
          .filter((t) => t.status === "approved")
          .reduce((s, t) => s + gross(t.amount, t.iva_rate), 0);
        const own = paidGross + approvedGross;
        // Realizado NÃO inclui masterForecastShare (só TX).
        const extra = masterExpenseShareGross + cacheImpactGross;
        return {
          displayValue: own + extra,
          subtotals: [
            { label: "Pago", value: paidGross },
            { label: "Comprometido (próprio)", value: approvedGross },
          ],
          formalidadeBreakdown: null, phase, modeUsed, unavailable: false,
        };
      }
    }

    // ════════════════════════════════════════════════════
    //  COMPROMETIDO (BP aprovado)
    // ════════════════════════════════════════════════════
    if (modeUsed === "committed") {
      const approved = forecasts.filter(
        (f) => f.type === kind && f.status === "approved" && !f.is_transitory && !f.exclude_from_result,
      );

      if (kind === "income") {
        // Bilheteira via CARGAS, ignora forecasts 1.1*; patrocínio + outros do BP NET.
        const nonTicket = approved.filter(
          (f) => classifyIncomeL1(f.account_categories?.code) !== "bilheteira",
        );
        let patrocinio = 0, outros = 0;
        for (const f of nonTicket) {
          const cls = classifyIncomeL1(f.account_categories?.code);
          if (cls === "patrocinio") patrocinio += num(f.amount);
          else outros += num(f.amount);
        }
        const total = ticketCargasNet + patrocinio + outros;
        return {
          displayValue: total,
          subtotals: [
            { label: "Bilheteira", value: ticketCargasNet },
            { label: "Patrocínio", value: patrocinio },
            { label: "Outros", value: outros },
          ],
          formalidadeBreakdown: null, phase, modeUsed, unavailable: total === 0,
        };
      } else {
        // Despesas BP BRUTO + extras BRUTO.
        const totalBpGross = approved.reduce((s, f) => s + gross(f.amount, f.iva_rate), 0);
        const bd = approved.reduce<FormalidadeBreakdown>(
          (acc, f) => addToBreakdown(acc, f.formalidade, gross(f.amount, f.iva_rate)),
          emptyBreakdown(),
        );
        const extra = masterExpenseShareGross + masterForecastShareGross + cacheImpactGross;
        return {
          displayValue: totalBpGross + extra,
          subtotals: [],
          formalidadeBreakdown: bd,
          phase, modeUsed, unavailable: approved.length === 0,
        };
      }
    }

    // ════════════════════════════════════════════════════
    //  FORECAST
    // ════════════════════════════════════════════════════
    if (kind === "income") {
      // Sócio NÃO tem view_simulator → fallback CARGAS + patrocínio BP NET.
      // (Não dividir por IVA: tudo já é NET.)
      const incomeForecasts = forecasts.filter(
        (f) => f.type === "income" && f.status === "approved" && !f.is_transitory && !f.exclude_from_result,
      );
      const nonTicket = incomeForecasts.filter(
        (f) => classifyIncomeL1(f.account_categories?.code) !== "bilheteira",
      );
      let patrocinio = 0, outros = 0;
      for (const f of nonTicket) {
        const cls = classifyIncomeL1(f.account_categories?.code);
        if (cls === "patrocinio") patrocinio += num(f.amount);
        else outros += num(f.amount);
      }
      const total = ticketCargasNet + patrocinio + outros;
      return {
        displayValue: total,
        subtotals: [
          { label: "Bilheteira", value: ticketCargasNet },
          { label: "Patrocínio", value: patrocinio },
          { label: "A&B", value: null },
          { label: "Outros", value: outros },
        ],
        formalidadeBreakdown: null, phase, modeUsed, unavailable: total === 0,
      };
    } else {
      // Forecast despesa: formalidade-aware × IVA.
      const approved = forecasts.filter(
        (f) => f.type === "expense" && f.status === "approved" && !f.is_transitory && !f.exclude_from_result,
      );
      // TX expense (paid+approved+pending) agrupadas por category_id, em BRUTO.
      const txExpense = transactions.filter(
        (t) => t.type === "expense" && !t.is_transitory && !t.exclude_from_result,
      );
      const txByCatGross = new Map<string, number>();
      for (const t of txExpense) {
        if (!t.category_id) continue;
        if (t.status !== "paid" && t.status !== "approved" && t.status !== "pending") continue;
        txByCatGross.set(
          t.category_id,
          (txByCatGross.get(t.category_id) ?? 0) + gross(t.amount, t.iva_rate),
        );
      }
      const bpCats = new Set<string>(
        approved.map((f) => f.category_id).filter(Boolean) as string[],
      );
      let bpSum = 0;
      let txLinkedSum = 0;
      for (const f of approved) {
        const isBlinded =
          f.formalidade === "fechado" ||
          f.formalidade === "pago_parcial" ||
          f.formalidade === "pago_total";
        if (isBlinded && f.category_id) {
          const txAmt = txByCatGross.get(f.category_id) ?? 0;
          if (txAmt > 0) {
            txLinkedSum += txAmt;
            continue;
          }
        }
        bpSum += gross(f.amount, f.iva_rate);
      }
      // Órfãs: TX em categorias fora do BP.
      let orphanSum = 0;
      for (const [cat, sum] of txByCatGross) {
        if (!bpCats.has(cat)) orphanSum += sum;
      }
      const extra = masterExpenseShareGross + masterForecastShareGross + cacheImpactGross;
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
  }, [
    kind, mode, eventStatus, primaryEventDate,
    transactions, forecasts,
    ticketRevenueNet, ticketCargasNet,
    masterExpenseShareGross, masterForecastShareGross, cacheImpactGross,
  ]);
}
