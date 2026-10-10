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
