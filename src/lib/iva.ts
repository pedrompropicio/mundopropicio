/**
 * Single Source of Truth para cálculos de IVA (Portugal).
 *
 * Regra (CIVA Art.º 18.º + Art.º 36.º/37.º): o IVA é calculado linha a linha
 * sobre o valor tributável (base sem IVA) com arredondamento comercial a 2
 * casas decimais ("round half away from zero", que em JS é o comportamento
 * padrão de Math.round para valores positivos).
 *
 * **Todas** as componentes (UI, exports, relatórios, edge functions) devem
 * usar estas funções para garantir consistência ao cêntimo. Não usar
 * cálculos inline como `amount * rate / 100` — em vez disso importar daqui.
 */

export type IvaRate = 0 | 6 | 13 | 23;
export const STANDARD_IVA_RATES: IvaRate[] = [0, 6, 13, 23];

/** Tolerância padrão de arredondamento (1 cêntimo). */
export const IVA_TOLERANCE = 0.01;

/** Arredonda a 2 casas decimais (cêntimo). */
export function roundCents(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Calcula o montante de IVA sobre uma base sem IVA. */
export function calcIvaAmount(baseAmount: number, ivaRate: number): number {
  if (!baseAmount || !ivaRate) return 0;
  return roundCents(baseAmount * (ivaRate / 100));
}

/** Calcula o total com IVA (base + IVA), arredondado ao cêntimo. */
export function calcTotalWithIva(baseAmount: number, ivaRate: number): number {
  return roundCents((Number(baseAmount) || 0) + calcIvaAmount(baseAmount, ivaRate));
}

/** Dada uma base e o total c/IVA, infere a taxa de IVA aproximada. */
export function inferIvaRateFromTotal(baseAmount: number, totalWithIva: number): number {
  if (!baseAmount) return 0;
  return ((totalWithIva - baseAmount) / baseAmount) * 100;
}

/** "Snap" para a taxa-padrão portuguesa mais próxima (0/6/13/23%). */
export function snapToStandardRate(rate: number): IvaRate {
  let best: IvaRate = STANDARD_IVA_RATES[0];
  let minDiff = Math.abs(rate - best);
  for (const r of STANDARD_IVA_RATES) {
    const d = Math.abs(rate - r);
    if (d < minDiff) { minDiff = d; best = r; }
  }
  return best;
}

export interface IvaConsistencyResult {
  ok: boolean;
  expectedIva: number;
  diff: number;
  /** Diferença em valor absoluto, em euros. */
  absDiff: number;
}

/**
 * Verifica se um IVA registado bate com o valor calculado a partir de
 * (base, rate) dentro da tolerância. Devolve sempre o valor esperado para
 * que o chamador possa decidir se corrige automaticamente ou avisa.
 */
export function checkIvaConsistency(
  baseAmount: number,
  ivaRate: number,
  recordedIva: number,
  tolerance: number = IVA_TOLERANCE,
): IvaConsistencyResult {
  const expectedIva = calcIvaAmount(baseAmount, ivaRate);
  const diff = roundCents(recordedIva - expectedIva);
  const absDiff = Math.abs(diff);
  return { ok: absDiff <= tolerance, expectedIva, diff, absDiff };
}
