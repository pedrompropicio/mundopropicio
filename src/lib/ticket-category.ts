/**
 * Rubrica de bilheteira nos relatórios de DRE.
 *
 * A exclusão de transações de receita quando a fonte é `ticket_sales` depende de
 * identificar a rubrica de bilheteira. Isso é feito PELO CÓDIGO EXATO `1.1.01`,
 * nunca pelo nome: `find` por nome devolve a primeira categoria cujo nome contém
 * "bilhete"/"bilheteira" e qualquer rubrica nova com esse nome passava a ser
 * escolhida em vez da 1.1.01 — a receita de bilhetes contava-se duas vezes.
 *
 * Mesma base do card financeiro do evento (`useEventFinancialCardData`, que
 * compara `account_categories?.code !== "1.1.01"`) e do filtro canónico do Fecho
 * (`isBilheteiraCategoryCode` em `supabase/functions/_shared/settlement/fecho-filters.ts`).
 */

export const TICKET_CATEGORY_CODE = "1.1.01";

/**
 * Devolve o id da categoria cujo `code` é exatamente `TICKET_CATEGORY_CODE`,
 * ou `null` se não existir. Sem fallback por nome — o fallback é o bug.
 */
export function findTicketCategoryId(
  categories: { id: string; code?: string | null }[] | null | undefined,
): string | null {
  if (!categories?.length) return null;
  return categories.find((c) => (c?.code ?? "").trim() === TICKET_CATEGORY_CODE)?.id ?? null;
}
