/**
 * Ramo 10.1 · Capital — trânsito de capital da Associação em Participação
 * (aporte, devolução de aporte, distribuição de resultado).
 *
 * Estas rubricas NUNCA fazem parte do BP de um evento: não são custo nem
 * receita operacional, são movimentos de capital. Por isso:
 *  - ficam sempre disponíveis no seletor de categoria (mesmo em modo "Do BP");
 *  - estão isentas da justificação obrigatória de "categoria fora do BP";
 *  - as transações resultantes são órfãs (sem vínculo a event_forecasts) e o
 *    trigger `trg_force_transitory_capital` marca-as is_transitory=true.
 *
 * Identificação sempre pelo PREFIXO do código — nunca por UUID.
 */
export const CAPITAL_BRANCH_PREFIX = "10.1.";

export function isCapitalCategoryCode(code: string | null | undefined): boolean {
  return String(code ?? "").startsWith(CAPITAL_BRANCH_PREFIX);
}

/** True se o id corresponde a uma categoria do ramo Capital. */
export function isCapitalCategoryId(
  categoryId: string | null | undefined,
  categories: { id: string; code?: string | null }[] | null | undefined,
): boolean {
  if (!categoryId) return false;
  const cat = (categories ?? []).find((c) => c.id === categoryId);
  return isCapitalCategoryCode(cat?.code);
}
