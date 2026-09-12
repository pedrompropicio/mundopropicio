/**
 * Totais do EVENTO para o motor dos apuramentos (#146 (c)).
 *
 * Réplica fiel do bloco de cálculo do Encontro de Contas
 * (`PartnerSettlementTab`, linhas "Calculate financials" → `totalExpensesGross`):
 * receita de bilheteira via `ticket_sales` (com exclusão da rubrica 1.1.01 nas
 * transações para não duplicar), despesa pela base escolhida (realizado ou
 * previsto + excedido por rubrica), overhead por toggle, IVA linha a linha.
 *
 * Vive num módulo próprio para que o painel de Apuramentos e o script de prova
 * usem exactamente a mesma aritmética sem tocar no Encontro de Contas.
 */
import { calcTotalWithIva } from "@/lib/iva";
import { computeOutsideBpExcess, sumLines } from "@/lib/event-cost-basis";
import { expandOverheadToSplits } from "@/lib/overhead-proration";
import { expandMasterAdoptedExpensesToSplits } from "@/lib/master-adopted-expense-proration";
import { isValidFechoTransaction, isTicketingRevenueTx } from "@/lib/fecho-filters";

export interface SettlementTotalsBasis {
  includeOverhead: boolean;
  expenseSource: "realized" | "committed";
}

export interface SettlementTotalsInput {
  /** Master + sub-eventos (o mesmo universo que o Encontro de Contas carrega). */
  events: any[];
  transactions: any[];
  /** Linhas de BP aprovadas, `version_id IS NULL`. */
  forecasts: any[];
  /** Vendas de bilhetes já reduzidas a { gross, net }. */
  ticketSales: { gross: number; net: number }[];
  basis: SettlementTotalsBasis;
}

export interface SettlementTotals {
  revenueNet: number;
  expensesNet: number;
  expensesGross: number;
  hasTicketSales: boolean;
}

export function computeEventSettlementTotals(input: SettlementTotalsInput): SettlementTotals {
  const { events, transactions, forecasts, ticketSales, basis } = input;

  const overheads = expandOverheadToSplits(
    (forecasts as any[]).filter((f: any) => f.is_overhead) as any,
    events as any,
  );
  const adoptedMasterExpenseSlices = expandMasterAdoptedExpensesToSplits({
    events: events as any,
    forecasts: forecasts as any,
    transactions: (transactions as any[]).filter((t: any) => t.type === "expense"),
  });

  const hasTicketSales = ticketSales.length > 0;
  const ticketRevenueNet = ticketSales.reduce((s, t) => s + t.net, 0);

  const validTx = transactions.filter((t: any) => isValidFechoTransaction(t));
  const incomeTransactions = validTx.filter((t: any) => t.type === "income");
  const adoptedMasterSourceIds = new Set(
    adoptedMasterExpenseSlices.map((s: any) => s._master_transaction_id).filter(Boolean),
  );
  const expenseTransactions = [
    ...validTx.filter((t: any) => t.type === "expense" && !adoptedMasterSourceIds.has(t.id)),
    ...adoptedMasterExpenseSlices,
  ];

  const revenueTxForTotals = hasTicketSales
    ? incomeTransactions.filter((t: any) => !isTicketingRevenueTx(t))
    : incomeTransactions;

  const revenueNet =
    (hasTicketSales ? ticketRevenueNet : 0) +
    revenueTxForTotals.reduce((s: number, t: any) => s + Number(t.amount), 0);

  const operationalForecasts = (forecasts as any[]).filter(
    (f: any) =>
      f.type === "expense" &&
      f.status === "approved" &&
      !f.is_transitory &&
      !f.is_overhead &&
      !f.exclude_from_result,
  );
  const expenseSourceLines =
    basis.expenseSource === "committed" ? operationalForecasts : expenseTransactions;

  const overheadNet = basis.includeOverhead
    ? overheads.reduce((s: number, o: any) => s + Number(o.amount), 0)
    : 0;
  const overheadGross = basis.includeOverhead
    ? overheads.reduce((s: number, o: any) => s + calcTotalWithIva(Number(o.amount), Number(o.iva_rate)), 0)
    : 0;

  const outsideBpNet =
    basis.expenseSource === "committed"
      ? computeOutsideBpExcess(operationalForecasts, expenseTransactions, false)
      : 0;
  const outsideBpGross =
    basis.expenseSource === "committed"
      ? computeOutsideBpExcess(operationalForecasts, expenseTransactions, true)
      : 0;

  return {
    revenueNet,
    expensesNet: sumLines(expenseSourceLines, false) + overheadNet + outsideBpNet,
    expensesGross: sumLines(expenseSourceLines, true) + overheadGross + outsideBpGross,
    hasTicketSales,
  };
}
