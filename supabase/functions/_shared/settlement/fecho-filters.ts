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

/**
 * Flags que bloqueiam a contabilização de uma transação no resultado,
 * independentemente do status. Reutilizado em todas as vistas que precisam
 * de um universo de transações real (Card, Fecho, DRE, Acerto, etc.).
 */
export function hasResultBlockingFlags(t: any): boolean {
  return (
    t?.is_transitory === true ||
    t?.exclude_from_result === true ||
    t?.reversed_at != null ||
    t?.is_hidden === true
  );
}

export function isValidFechoTransaction(t: any): boolean {
  return (
    (t.status === "approved" || t.status === "paid") &&
    !hasResultBlockingFlags(t)
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

/**
 * IRC FORA DO RESULTADO DO EVENTO (adenda D-ERP151, 10/10/2026) — REGRA ÚNICA.
 *
 * Linha de BP ou transação cuja conta de lançamento tem
 * `account_categories.ebitda_class = 'imposto_rendimento'` NÃO é custo do
 * evento: o resultado do evento é "antes de impostos". Aplica-se em
 * `computeEventCostOnBasis` e no motor do fecho (totais + linhas do documento),
 * que é o que cards, lista de eventos, fechos, Portal e PDFs consomem.
 * Financeiro e amortizações continuam dentro. O DRE (`eventCostLines`/buildDRE)
 * NÃO usa esta regra: mostra o IRC abaixo do resultado com a ponte EBITDA.
 *
 * A classe lê-se no embed `account_categories(ebitda_class)` da linha — quem
 * alimenta estes cálculos TEM de o trazer no select (ver INCOME_TAX_EMBED_COLUMN).
 */
export const INCOME_TAX_CLASS = "imposto_rendimento";
export const INCOME_TAX_EMBED_COLUMN = "ebitda_class";

export function isIncomeTaxLine(l: any): boolean {
  const c = l?.account_categories;
  const cls = Array.isArray(c) ? c[0]?.ebitda_class : c?.ebitda_class;
  return cls === INCOME_TAX_CLASS || l?.ebitda_class === INCOME_TAX_CLASS;
}

export function withoutIncomeTax<T>(lines: T[] | null | undefined): T[] {
  return (lines ?? []).filter((l) => !isIncomeTaxLine(l));
}
