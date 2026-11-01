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

/**
 * Apresentação (rótulo) da rubrica de bilheteira nos DRE da vista Brasil.
 * Reconhece a linha SÓ pelo código exato `TICKET_CATEGORY_CODE`, nunca pelo texto
 * do nome (2.6.07 e 2.6.13 têm "bilheteira" no nome e são despesa). Não entra no cálculo.
 */
export interface TicketLabelLine {
  label: string;
  code?: string | null;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  isDistribution?: boolean;
  isRetained?: boolean;
  isExpenseSide?: boolean;
  isPartnerExtra?: boolean;
  isPartnerNet?: boolean;
}

export function isTicketDreLine(line: TicketLabelLine): boolean {
  if (
    line.isTotal || line.isGrandTotal || line.isDistribution || line.isRetained ||
    line.isExpenseSide || line.isPartnerExtra || line.isPartnerNet
  ) return false;
  return (line.code ?? "").trim() === TICKET_CATEGORY_CODE;
}

export function ticketDreDisplayLabel(line: TicketLabelLine): string {
  return isTicketDreLine(line) ? `${line.label} (-6% IVA)` : line.label;
}
