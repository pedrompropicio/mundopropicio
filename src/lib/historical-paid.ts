export const HISTORICAL_PAID_LABEL = "pago (histórico importado)";

type HistoricalPaidTransaction = {
  id: string;
  status: string;
  events?: { historical_at?: string | null } | null;
};

/** Só o carimbo próprio e a ausência confirmada de qualquer linha permitem o selo. */
export function isHistoricalImportedPaid(
  t: HistoricalPaidTransaction,
  idsWithPayments?: ReadonlySet<string>,
): boolean {
  return t.status === "paid" && !!t.events?.historical_at
    && idsWithPayments !== undefined && !idsWithPayments.has(t.id);
}
