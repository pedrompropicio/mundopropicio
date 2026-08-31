import { calcTotalWithIva } from "@/lib/iva";
import {
  getPartnerExpenseBase,
  getPartnerRevenueBase,
  ignoresOperationalExpenses,
  normalizePartnerCalcBasis,
  usesGrossExpenseAmounts,
} from "@/lib/partner-calc-basis";
import { expandOverheadToSplits } from "@/lib/overhead-proration";
import {
  HOUSE_PARTNER_ID,
  HOUSE_PARTNER_NAME,
  computeHousePercentage,
} from "@/lib/house-partner";

type NamedSupplier = { name?: string | null } | null | undefined;

export interface SettlementReportEvent {
  id: string;
  name: string;
  status?: string | null;
  parent_event_id?: string | null;
  partner_calc_basis?: string | null;
}

export interface SettlementReportPartner {
  id: string;
  event_id: string;
  percentage: number | string;
  loss_percentage?: number | string | null;
  expense_includes_iva?: boolean | null;
  suppliers?: NamedSupplier;
}

export interface SettlementReportTransaction {
  id: string;
  event_id: string;
  amount: number | string;
  iva_rate?: number | string | null;
  type: "income" | "expense" | string;
  status?: string | null;
  is_transitory?: boolean | null;
  exclude_from_result?: boolean | null;
}

export interface SettlementReportForecast {
  event_id: string;
  amount: number | string;
  status?: string | null;
  is_overhead?: boolean | null;
}

export interface SettlementReportPaidExpense {
  partner_id: string;
  event_id: string;
  transaction_id: string;
  transactions?: {
    amount?: number | string | null;
    iva_rate?: number | string | null;
    type?: string | null;
    is_transitory?: boolean | null;
    status?: string | null;
  } | null;
}

export interface SettlementReportAdvance {
  partner_id: string;
  event_id: string;
  transactions?: {
    amount?: number | string | null;
    iva_rate?: number | string | null;
  } | null;
}

export interface SettlementTicketSaleAggregate {
  eventId: string;
  gross: number;
  net: number;
}

export interface SettlementReportRow {
  rowId: string;
  partnerId: string;
  partnerName: string;
  eventId: string;
  eventName: string;
  eventStatus: string;
  percentage: number;
  effectivePercentage: number;
  result: number;
  overhead: number;
  partnerShare: number;
  paidExpenses: number;
  extras: number;
  transitoryCredit: number;
  transitoryOffset: number;
  resultRepasseNow: number;
  resultPendingByCash: number;
  equityContribution: number;
  operationalSettlement: number;
  settlement: number;
  isHouse: boolean;
}

export function buildPartnerSettlementReportData(input: {
  events: SettlementReportEvent[];
  partners: SettlementReportPartner[];
  transactions: SettlementReportTransaction[];
  forecasts: SettlementReportForecast[];
  paidExpenses: SettlementReportPaidExpense[];
  partnerAdvances: SettlementReportAdvance[];
  ticketSales: SettlementTicketSaleAggregate[];
}): SettlementReportRow[] {
  const { events, partners, transactions, forecasts, paidExpenses, partnerAdvances, ticketSales } = input;

  const childrenByParent = new Map<string, SettlementReportEvent[]>();
  events.forEach((event) => {
    if (!event.parent_event_id) return;
    const siblings = childrenByParent.get(event.parent_event_id) ?? [];
    siblings.push(event);
    childrenByParent.set(event.parent_event_id, siblings);
  });

  const partnerEventIds = new Set(partners.map((partner) => partner.event_id));
  const rootEvents = events.filter((event) => !event.parent_event_id && partnerEventIds.has(event.id));

  return rootEvents.flatMap((rootEvent) => {
    const familyEvents = [rootEvent, ...(childrenByParent.get(rootEvent.id) ?? [])];
    const familyEventIds = new Set(familyEvents.map((event) => event.id));
    const familyPartners = partners.filter((partner) => partner.event_id === rootEvent.id);
    if (familyPartners.length === 0) return [];

    const calcBasis = normalizePartnerCalcBasis(rootEvent.partner_calc_basis);
    const validTransactions = transactions.filter(
      (transaction) =>
        familyEventIds.has(transaction.event_id) &&
        (transaction.status === "approved" || transaction.status === "paid") &&
        !transaction.is_transitory &&
        !transaction.exclude_from_result,
    );

    const incomeTransactions = validTransactions.filter((transaction) => transaction.type === "income");
    const expenseTransactions = validTransactions.filter((transaction) => transaction.type === "expense");
    const familyTicketSales = ticketSales.filter((sale) => familyEventIds.has(sale.eventId));
    const hasTicketSales = familyTicketSales.length > 0;

    const totalRevenueNet = hasTicketSales
      ? familyTicketSales.reduce((sum, sale) => sum + sale.net, 0)
      : incomeTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

    const totalExpensesNet = expenseTransactions.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
    const totalExpensesGross = expenseTransactions.reduce(
      (sum, transaction) =>
        sum + calcTotalWithIva(Number(transaction.amount || 0), Number(transaction.iva_rate || 0)),
      0,
    );

    const overheads = expandOverheadToSplits(
      forecasts.filter(
        (forecast) =>
          familyEventIds.has(forecast.event_id) &&
          forecast.status === "approved" &&
          !!forecast.is_overhead,
      ) as any,
      familyEvents as any,
    );
    const totalOverhead = overheads.reduce((sum: number, forecast: any) => sum + Number(forecast.amount || 0), 0);

    const revenueBase = getPartnerRevenueBase(totalRevenueNet);
    const expenseBase = getPartnerExpenseBase(
      calcBasis,
      totalExpensesNet + totalOverhead,
      totalExpensesGross + totalOverhead,
    );
    const resultBase = revenueBase - expenseBase;

    const housePct = computeHousePercentage(
      familyPartners.map((partner) => ({ percentage: partner.percentage })),
    );

    const allPartners = [
      ...familyPartners,
      ...(housePct != null
        ? [{
            id: `${HOUSE_PARTNER_ID}-${rootEvent.id}`,
            event_id: rootEvent.id,
            percentage: housePct,
            loss_percentage: null,
            // A casa segue sempre a base contratual do evento.
            expense_includes_iva: null,
            suppliers: { name: HOUSE_PARTNER_NAME },
            isHouse: true,
          }]
        : []),
    ];

    const familyPaidExpenses = paidExpenses.filter((expense) => familyEventIds.has(expense.event_id));
    const familyPartnerAdvances = partnerAdvances.filter((advance) => familyEventIds.has(advance.event_id));
    const transitoryTransactions = transactions.filter(
      (transaction) =>
        familyEventIds.has(transaction.event_id) &&
        (transaction.status === "approved" || transaction.status === "paid") &&
        !!transaction.is_transitory,
    );
    const linkedTransitoryIds = new Set(familyPaidExpenses.map((expense) => expense.transaction_id));
    const houseTransitoryCredit = Math.max(
      0,
      transitoryTransactions.reduce((sum, transaction) => {
        if (linkedTransitoryIds.has(transaction.id)) return sum;
        if (transaction.type === "expense") return sum + Number(transaction.amount || 0);
        if (transaction.type === "income") return sum - Number(transaction.amount || 0);
        return sum;
      }, 0),
    );

    const rows = allPartners.map((partner: SettlementReportPartner & { isHouse?: boolean }) => {
      const isHouse = !!partner.isHouse;
      const effectivePercentage = resultBase < 0 && partner.loss_percentage != null
        ? Number(partner.loss_percentage)
        : Number(partner.percentage || 0);
      const partnerShare = (ignoresOperationalExpenses(calcBasis) ? revenueBase : resultBase) * (effectivePercentage / 100);

      const paidExpensesTotal = isHouse
        ? 0
        : familyPaidExpenses
            .filter((expense) => expense.partner_id === partner.id && !expense.transactions?.is_transitory)
            .reduce((sum, expense) => {
              const amount = Number(expense.transactions?.amount || 0);
              return sum + (usesGrossExpenseAmounts(calcBasis)
                ? calcTotalWithIva(amount, Number(expense.transactions?.iva_rate || 0))
                : amount);
            }, 0);

      const extrasTotal = isHouse
        ? 0
        : familyPartnerAdvances
            .filter((advance) => advance.partner_id === partner.id)
            .reduce((sum, advance) => {
              const amount = Number(advance.transactions?.amount || 0);
              return sum + (usesGrossExpenseAmounts(calcBasis)
                ? calcTotalWithIva(amount, Number(advance.transactions?.iva_rate || 0))
                : amount);
            }, 0);

      const transitoryCredit = isHouse
        ? houseTransitoryCredit
        : Math.max(
            0,
            familyPaidExpenses
              .filter((expense) => expense.partner_id === partner.id && expense.transactions?.is_transitory)
              .reduce((sum, expense) => {
                const signedAmount = Number(expense.transactions?.amount || 0);
                return sum + (expense.transactions?.type === "expense" ? signedAmount : -signedAmount);
              }, 0),
          );

      return {
        rowId: `${rootEvent.id}:${partner.id}`,
        partnerId: partner.id,
        partnerName: partner.suppliers?.name || "—",
        eventId: rootEvent.id,
        eventName: rootEvent.name,
        eventStatus: rootEvent.status || "—",
        percentage: Number(partner.percentage || 0),
        effectivePercentage,
        result: ignoresOperationalExpenses(calcBasis) ? revenueBase : resultBase,
        overhead: totalOverhead,
        partnerShare,
        paidExpenses: paidExpensesTotal,
        extras: extrasTotal,
        transitoryCredit,
        transitoryOffset: 0,
        resultRepasseNow: partnerShare,
        resultPendingByCash: 0,
        equityContribution: 0,
        operationalSettlement: 0,
        settlement: 0,
        isHouse,
      } satisfies SettlementReportRow;
    });

    const totalTransitoryCredit = rows.reduce((sum, row) => sum + row.transitoryCredit, 0);
    const resultPositivePool = Math.max(resultBase, 0);
    const resultLossPool = Math.max(-resultBase, 0);
    const pendingPool = Math.min(totalTransitoryCredit, resultPositivePool);
    const offsetPool = Math.min(totalTransitoryCredit, resultLossPool);
    const contributionPool = Math.max(0, resultLossPool - totalTransitoryCredit);

    return rows.map((row) => {
      const equityRatio = row.effectivePercentage / 100;
      const resultPendingByCash = resultBase > 0 ? pendingPool * equityRatio : 0;
      const transitoryOffset = resultBase < 0 ? offsetPool * equityRatio : 0;
      const equityContribution = resultBase < 0 ? contributionPool * equityRatio : 0;
      const resultRepasseNow = resultBase >= 0
        ? row.partnerShare - resultPendingByCash
        : -equityContribution;
      const operationalSettlement = resultRepasseNow + row.paidExpenses - row.extras;
      return {
        ...row,
        transitoryOffset,
        resultPendingByCash,
        resultRepasseNow,
        equityContribution,
        operationalSettlement,
        settlement: operationalSettlement + resultPendingByCash + row.transitoryCredit,
      };
    });
  });
}