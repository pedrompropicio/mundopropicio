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
import { calcTotalWithIva } from "./iva.ts";
import { computeOutsideBpExcess, computeOutsideBpExcessLines, sumLines } from "./event-cost-basis.ts";
import { expandOverheadToSplits } from "./overhead-proration.ts";
import { expandMasterAdoptedExpensesToSplits } from "./master-adopted-expense-proration.ts";
import { isValidFechoTransaction, isTicketingRevenueTx } from "./fecho-filters.ts";

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

/** (g13) Linha de despesa tal como entra nos documentos do sócio. */
export interface SettlementExpenseDocLine {
  categoryId: string | null;
  description: string;
  base: number;
  ivaRate: number;
  event_settlement_id?: string | null;
}

/**
 * (g13) As MESMAS linhas que compõem `expensesNet`/`expensesGross` acima —
 * fonte única para o documento do sócio (secção 3 e Detalhamento B), incluindo
 * o overhead pelo critério e o excedido itemizado por rubrica.
 *
 * Não faz nenhum filtro por apuramento: quem chama aplica o perímetro da raiz
 * (`keepRootPerimeter`), porque a base do documento é sempre o evento.
 */
export function collectSettlementExpenseDocLines(input: SettlementTotalsInput): SettlementExpenseDocLine[] {
  const { events, transactions, forecasts, basis } = input;

  const overheads = expandOverheadToSplits(
    (forecasts as any[]).filter((f: any) => f.is_overhead) as any,
    events as any,
  );
  const adoptedMasterExpenseSlices = expandMasterAdoptedExpensesToSplits({
    events: events as any,
    forecasts: forecasts as any,
    transactions: (transactions as any[]).filter((t: any) => t.type === "expense"),
  });
  const validTx = transactions.filter((t: any) => isValidFechoTransaction(t));
  const adoptedMasterSourceIds = new Set(
    adoptedMasterExpenseSlices.map((s: any) => s._master_transaction_id).filter(Boolean),
  );
  const expenseTransactions = [
    ...validTx.filter((t: any) => t.type === "expense" && !adoptedMasterSourceIds.has(t.id)),
    ...adoptedMasterExpenseSlices,
  ];
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

  const toLine = (l: any, fallback: string): SettlementExpenseDocLine => ({
    categoryId: l.category_id ?? null,
    description: String(l.description || l.suppliers?.name || fallback),
    base: Number(l.amount || 0),
    ivaRate: Number(l.iva_rate || 0),
    event_settlement_id: l.event_settlement_id ?? null,
  });

  const lines: SettlementExpenseDocLine[] = expenseSourceLines.map((l: any) => toLine(l, "Despesa"));

  if (basis.includeOverhead) lines.push(...overheads.map((o: any) => toLine(o, "Rateio")));

  if (basis.expenseSource === "committed") {
    for (const x of computeOutsideBpExcessLines(operationalForecasts, expenseTransactions)) {
      const ivaRate = x.net > 0 ? ((x.gross / x.net) - 1) * 100 : 0;
      lines.push({
        categoryId: x.categoryId,
        description: "Excedido ao Business Plan",
        base: x.net,
        ivaRate,
      });
    }
  }

  return lines;
}
