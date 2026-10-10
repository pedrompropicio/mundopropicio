/**
 * #233 — modo "link" da conciliação: a data de pagamento no sistema tem de
 * bater com coalesce(value_date, booking_date) da linha do banco. Se não bater,
 * a RPC reconcile_bank_line recusa com P0410 e devolve as divergências no
 * `details`; a pessoa escolhe "align" (escreve a data do banco) ou "keep"
 * (fica registado em bank_statement_lines.date_divergence). Nunca em silêncio.
 */
export type DateAction = "align" | "keep";

export interface DateConflict {
  transaction_id: string;
  system_date: string | null;
  bank_date: string;
  amount: number;
}

export function parseDateConflicts(error: { code?: string; details?: string | null } | null | undefined): DateConflict[] | null {
  if (!error || error.code !== "P0410") return null;
  try {
    const arr = JSON.parse(error.details ?? "[]");
    return Array.isArray(arr) ? (arr as DateConflict[]) : [];
  } catch {
    return [];
  }
}

export interface ReconcileItem { transaction_id: string; mode: "link" | "settle"; amount: number; date_action?: DateAction }

export function withDateActions(
  items: Array<{ id: string; mode: "link" | "settle"; amount: number }>,
  actions: Record<string, DateAction> = {},
): ReconcileItem[] {
  return items.map((i) => ({
    transaction_id: i.id,
    mode: i.mode,
    amount: i.amount,
    ...(i.mode === "link" && actions[i.id] ? { date_action: actions[i.id] } : {}),
  }));
}

/** Data do banco para pré-preencher a liquidação (value_date tem prioridade). */
export function bankDateOf(line: { value_date?: string | null; booking_date?: string | null } | null | undefined): string | null {
  return line?.value_date ?? line?.booking_date ?? null;
}

/**
 * Data do banco das linhas já ligadas a estas transações (directa ou multi).
 * Só devolve data se TODAS as transações tiverem linha e a data for a mesma.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchKnownBankDate(client: any, txIds: string[]): Promise<string | null> {
  const ids = [...new Set(txIds.filter(Boolean))];
  if (ids.length === 0) return null;
  const [direct, multi] = await Promise.all([
    client.from("bank_statement_lines").select("matched_transaction_id, value_date, booking_date").in("matched_transaction_id", ids).limit(1000),
    client.from("bank_line_transactions").select("transaction_id, bank_statement_lines(value_date, booking_date)").in("transaction_id", ids).limit(1000),
  ]);
  const byTx = new Map<string, string | null>();
  for (const r of direct.data ?? []) byTx.set(r.matched_transaction_id, bankDateOf(r));
  for (const r of multi.data ?? []) if (!byTx.has(r.transaction_id)) byTx.set(r.transaction_id, bankDateOf(r.bank_statement_lines));
  const dates = ids.map((id) => byTx.get(id) ?? null);
  if (dates.some((d) => !d)) return null;
  return new Set(dates).size === 1 ? dates[0] : null;
}
