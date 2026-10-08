/**
 * Regra única de "liquidação" (D-ERP86 / D-ERP157, issue #200).
 *
 * Só conta como liquidação uma linha de `transaction_payments` com
 * `status = 'paid'` e `reversed_at IS NULL` — a mesma regra que
 * `_derive_paid_amount` usa no servidor. Linhas `planned`, `cancelled` ou
 * estornadas NÃO liquidam: um pagamento cancelado não pode fazer um item
 * contar como "Liquidada".
 */

export interface PaymentRowLike {
  transaction_id?: string | null;
  status?: string | null;
  reversed_at?: string | null;
}

export function isSettlingPayment(row: PaymentRowLike | null | undefined): boolean {
  return !!row && row.status === "paid" && (row.reversed_at ?? null) === null;
}

/** Ids de transação com pelo menos uma liquidação válida. */
export function settledTxIdsFrom(rows: readonly PaymentRowLike[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const r of rows ?? []) {
    if (r?.transaction_id && isSettlingPayment(r)) out.add(String(r.transaction_id));
  }
  return out;
}

/** Aplica a regra a uma query PostgREST de `transaction_payments`. */
export function onlySettlingPayments<Q extends { eq: (c: string, v: any) => any }>(query: Q): Q {
  return (query as any).eq("status", "paid").is("reversed_at", null);
}

/** Colunas mínimas para aplicar a regra no cliente. */
export const SETTLEMENT_COLUMNS = "transaction_id, status, reversed_at";

export type ListItemPhase = "settled" | "markedPaid" | "legacy" | "unpaid";

/**
 * Fase de um item ATIVO de uma lista de pagamento (issue #200). Liquidada
 * ganha sobre "paga"; "paga" é o toggle visual; legado = transação 'paid'
 * sem linha de liquidação válida. Usado pelo ecrã das listas e pelo aviso
 * "Pagamentos aprovados por liquidar" para contarem da mesma forma.
 */
export function listItemPhase(args: {
  txId: string;
  txStatus?: string | null;
  manuallyMarkedPaid?: boolean | null;
  settledTxIds: Set<string>;
}): ListItemPhase {
  if (args.settledTxIds.has(String(args.txId))) return "settled";
  if (args.manuallyMarkedPaid) return "markedPaid";
  if (args.txStatus === "paid") return "legacy";
  return "unpaid";
}
