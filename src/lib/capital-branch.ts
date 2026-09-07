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

export type CapitalKind =
  | "aporte"
  | "devolucao"
  | "distribuicao"
  /** 10.1.04 — empréstimo à sociedade da empresa (não a um sócio de evento). */
  | "emprestimo"
  /** 10.1.05 — reembolso desse empréstimo. */
  | "reembolso_emprestimo";

export function isCapitalCategoryCode(code: string | null | undefined): boolean {
  return String(code ?? "").startsWith(CAPITAL_BRANCH_PREFIX);
}

/** Deriva o tipo de movimento a partir do CÓDIGO da categoria (nunca por UUID). */
export function capitalKindFromCode(code: string | null | undefined): CapitalKind | null {
  const c = String(code ?? "");
  if (c.startsWith("10.1.01")) return "aporte";
  if (c.startsWith("10.1.02")) return "devolucao";
  if (c.startsWith("10.1.03")) return "distribuicao";
  if (c.startsWith("10.1.04")) return "emprestimo";
  if (c.startsWith("10.1.05")) return "reembolso_emprestimo";
  return null;
}

/**
 * Exige sócio de EVENTO (`event_partners`)?
 *
 * 10.1.01/02/03 (aporte / devolução / distribuição) são movimentos da
 * Associação em Participação → sim, exigem sócio (e portanto evento).
 * 10.1.04/05 (empréstimo a sócio e respetivo reembolso) são com a sociedade da
 * empresa — a Mundo Propício é sempre a casa e nunca está em `event_partners`
 * → não exigem sócio, nem evento, nem linha em `partner_capital_moves`.
 */
export function capitalNeedsPartner(code: string | null | undefined): boolean {
  const kind = capitalKindFromCode(code);
  return kind === "aporte" || kind === "devolucao" || kind === "distribuicao";
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
