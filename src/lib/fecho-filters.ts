/**
 * Filtros canónicos das vistas de Fecho (Fecho do Evento / Fecho com Parceiros).
 *
 * Ver `.lovable/memory/features/fecho-filter-parity.md`.
 *
 * Universo de transações válidas (igual ao RPC `get_partner_bp_realized` do portal do sócio):
 *   • status ∈ {approved, paid}
 *   • !is_transitory
 *   • !exclude_from_result
 *   • reversed_at IS NULL     (estornadas ficam fora)
 *   • is_hidden = false       (escondidas ficam fora)
 */

/** Colunas mínimas que qualquer select de Fecho tem que trazer. */
export const FECHO_TX_FILTER_COLUMNS = "is_transitory, exclude_from_result, reversed_at, is_hidden, status";

export function isValidFechoTransaction(t: any): boolean {
  return (
    (t.status === "approved" || t.status === "paid") &&
    !t.is_transitory &&
    !t.exclude_from_result &&
    t.reversed_at == null &&
    t.is_hidden !== true
  );
}

/**
 * Rubrica de bilheteira (1.1.01) e descendentes.
 *
 * REGRA CRÍTICA: quando o evento tem `ticket_sales`, a receita de bilheteira já vem
 * dessa fonte. As transações de receita nesta rubrica são o MESMO dinheiro registado
 * no ERP — somar as duas duplica a bilheteira (Coala 2026: 1,19 M€).
 * A exclusão é feita por rubrica, nunca por heurística sobre a descrição.
 */
export const BILHETEIRA_CODE = "1.1.01";

export function isBilheteiraCategoryCode(code?: string | null): boolean {
  if (!code) return false;
  return code === BILHETEIRA_CODE || code.startsWith(`${BILHETEIRA_CODE}.`);
}

/** Transação de receita que representa bilheteira (a excluir se houver ticket_sales). */
export function isTicketingRevenueTx(t: any): boolean {
  return isBilheteiraCategoryCode(t?.account_categories?.code);
}
