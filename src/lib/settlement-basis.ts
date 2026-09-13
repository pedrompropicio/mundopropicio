/**
 * (g10) BASE EFETIVA DE DESPESA DE UM FECHAMENTO — rótulo único e derivado.
 *
 * Regra: num fechamento com `returns_parent_deductible_vat = true` a quota vem
 * do resultado c/IVA do fechamento acima E o IVA dedutível desse perímetro é
 * devolvido por inteiro — o que equivale, para quem lê, a apurar sobre despesas
 * s/IVA. Logo a base EFETIVA desse nó (e de todos os seus participantes) é
 * "Despesas s/IVA", mesmo que a base de cálculo do nó seja c/IVA.
 *
 * Nada muda no cálculo: isto é só apresentação. Módulo puro, sem dependências,
 * para poder ser usado pelo motor, pelos ecrãs e pelos documentos.
 */

export interface EffectiveBasisInput {
  /** Base de cálculo do nó: true = despesas c/IVA. */
  usesGrossExpenses: boolean;
  /** O nó recebe o IVA dedutível do fechamento acima. */
  returnsParentDeductibleVat?: boolean | null;
}

/** Base efetiva: c/IVA só quando o nó calcula em bruto E não devolve o IVA. */
export function effectiveUsesGrossExpenses(input: EffectiveBasisInput): boolean {
  return input.usesGrossExpenses === true && input.returnsParentDeductibleVat !== true;
}

/** "Despesas c/IVA" | "Despesas s/IVA" — rótulo longo (colunas "Base"). */
export function effectiveExpenseBasisLabel(input: EffectiveBasisInput): string {
  return effectiveUsesGrossExpenses(input) ? "Despesas c/IVA" : "Despesas s/IVA";
}

/** "c/IVA" | "s/IVA" — rótulo curto (exports e cabeçalhos apertados). */
export function effectiveBasisShortLabel(input: EffectiveBasisInput): string {
  return effectiveUsesGrossExpenses(input) ? "c/IVA" : "s/IVA";
}

/** "Resultado c/IVA" | "Resultado s/IVA". */
export function effectiveResultBasisLabel(input: EffectiveBasisInput): string {
  return `Resultado ${effectiveBasisShortLabel(input)}`;
}
