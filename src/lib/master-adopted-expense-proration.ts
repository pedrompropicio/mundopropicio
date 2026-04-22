export interface MasterAdoptedExpenseEventLike {
  id: string;
  parent_event_id?: string | null;
}

export interface MasterAdoptedExpenseForecastLike {
  id: string;
  event_id: string;
  master_forecast_id?: string | null;
  transaction_id?: string | null;
}

export interface MasterAdoptedExpenseTransactionLike {
  id: string;
  event_id: string;
  amount: number | string;
  iva_rate?: number | string | null;
  type?: string | null;
  [key: string]: any;
}

export type MasterAdoptedExpenseSlice<T extends MasterAdoptedExpenseTransactionLike = MasterAdoptedExpenseTransactionLike> =
  T & {
    _adopted_via_master?: boolean;
    _master_event_id?: string;
    _master_transaction_id?: string;
    _master_forecast_id?: string;
    _split_share?: number;
  };

/**
 * Expande virtualmente despesas lançadas no Master quando existe adoção no BP
 * para os sub-eventos via `master_forecast_id + transaction_id`.
 *
 * Não altera os registos originais. Serve apenas para relatórios que precisam
 * ler essas despesas como rateio/adopção, mantendo os números globais intactos.
 */
export function expandMasterAdoptedExpensesToSplits<T extends MasterAdoptedExpenseTransactionLike>(input: {
  events: MasterAdoptedExpenseEventLike[];
  forecasts: MasterAdoptedExpenseForecastLike[];
  transactions: T[];
}): MasterAdoptedExpenseSlice<T>[] {
  const { events, forecasts, transactions } = input;

  const childIdsByMaster = new Map<string, string[]>();
  for (const event of events) {
    if (!event.parent_event_id) continue;
    const current = childIdsByMaster.get(event.parent_event_id) ?? [];
    current.push(event.id);
    childIdsByMaster.set(event.parent_event_id, current);
  }

  const adoptedChildrenByMasterTx = new Map<string, Set<string>>();
  for (const forecast of forecasts) {
    if (!forecast.master_forecast_id || !forecast.transaction_id) continue;
    const childEvent = events.find((event) => event.id === forecast.event_id);
    const masterEventId = childEvent?.parent_event_id;
    if (!masterEventId) continue;
    const key = `${masterEventId}::${forecast.transaction_id}`;
    const set = adoptedChildrenByMasterTx.get(key) ?? new Set<string>();
    set.add(forecast.event_id);
    adoptedChildrenByMasterTx.set(key, set);
  }

  const slices: MasterAdoptedExpenseSlice<T>[] = [];

  for (const transaction of transactions) {
    const childIds = childIdsByMaster.get(transaction.event_id);
    if (!childIds || childIds.length === 0) continue;
    const adoptedChildren = adoptedChildrenByMasterTx.get(`${transaction.event_id}::${transaction.id}`);
    if (!adoptedChildren || adoptedChildren.size === 0) continue;
    if (adoptedChildren.size !== childIds.length) continue;

    const share = Number(transaction.amount || 0) / childIds.length;
    for (const childId of childIds) {
      if (!adoptedChildren.has(childId)) continue;
      slices.push({
        ...transaction,
        id: `${transaction.id}::adopted::${childId}`,
        event_id: childId,
        amount: share,
        _adopted_via_master: true,
        _master_event_id: transaction.event_id,
        _master_transaction_id: transaction.id,
        _split_share: 1 / childIds.length,
      });
    }
  }

  return slices;
}