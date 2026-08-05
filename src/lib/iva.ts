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

export type IvaRate = 0 | 4 | 6 | 10 | 13 | 21 | 23;

/** Taxas de Portugal Continental — comportamento padrão (retrocompatível). */
export const STANDARD_IVA_RATES: IvaRate[] = [0, 6, 13, 23];

/**
 * Taxas aplicáveis por país (chaves = nomes completos, como em `cities.country`).
 * As taxas aplicáveis a uma transação/linha de BP são as do país da CIDADE DO
 * EVENTO — a empresa continua PT e `amount` continua BASE sem IVA em EUR.
 */
export const IVA_RATES_BY_COUNTRY: Record<string, IvaRate[]> = {
  Portugal: [0, 6, 13, 23],
  Espanha: [0, 4, 10, 21],
};

export const DEFAULT_IVA_COUNTRY = "Portugal";

/** Taxas do país indicado; fallback Portugal para país desconhecido/nulo. */
export function getIvaRatesForCountry(countryName: string | null | undefined): IvaRate[] {
  if (!countryName) return IVA_RATES_BY_COUNTRY[DEFAULT_IVA_COUNTRY];
  return IVA_RATES_BY_COUNTRY[countryName] ?? IVA_RATES_BY_COUNTRY[DEFAULT_IVA_COUNTRY];
}

/** Taxa normal do país (a mais alta) — usada como default nos seletores. */
export function getDefaultIvaRateForCountry(countryName: string | null | undefined): IvaRate {
  const rates = getIvaRatesForCountry(countryName);
  return rates.reduce((a, b) => (b > a ? b : a), rates[0]);
}

/**
 * Conjunto de taxas para um ou mais países (caso de turnês multi-país: o master
 * não tem cidade própria e os sub-eventos podem estar em países diferentes).
 * - 0 países conhecidos → PT
 * - 1 país → taxas desse país
 * - >1 país → UNIÃO ordenada crescente das taxas envolvidas
 */
export function getIvaRatesForCountries(countries: (string | null | undefined)[]): IvaRate[] {
  const known = Array.from(new Set(countries.filter((c): c is string => !!c && !!IVA_RATES_BY_COUNTRY[c])));
  if (known.length === 0) return getIvaRatesForCountry(null);
  if (known.length === 1) return getIvaRatesForCountry(known[0]);
  const union = new Set<IvaRate>();
  for (const c of known) for (const r of getIvaRatesForCountry(c)) union.add(r);
  return Array.from(union).sort((a, b) => a - b);
}

/**
 * Default para um conjunto de países: um só país → taxa normal desse país;
 * vários países → 23 (PT), por convenção (a empresa é PT).
 */
export function getDefaultIvaRateForCountries(countries: (string | null | undefined)[]): IvaRate {
  const known = Array.from(new Set(countries.filter((c): c is string => !!c && !!IVA_RATES_BY_COUNTRY[c])));
  if (known.length === 1) return getDefaultIvaRateForCountry(known[0]);
  return getDefaultIvaRateForCountry(DEFAULT_IVA_COUNTRY);
}

/** Etiquetas por taxa (PT + ES). */
export const IVA_RATE_LABELS: Record<number, string> = {
  23: "23% - Normal",
  13: "13% - Intermédia",
  6: "6% - Reduzida",
  21: "21% - Normal (ES)",
  10: "10% - Reduzida (ES)",
  4: "4% - Super-reduzida (ES)",
  0: "0% - Isento",
};

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

/**
 * "Snap" para a taxa-padrão mais próxima.
 * Sem `rates`, comporta-se exatamente como antes: taxas PT (0/6/13/23%).
 * Com `rates` (ex.: taxas do país da cidade do evento), faz snap nesse conjunto.
 */
export function snapToStandardRate(rate: number, rates: IvaRate[] = STANDARD_IVA_RATES): IvaRate {
  const pool = rates.length ? rates : STANDARD_IVA_RATES;
  let best: IvaRate = pool[0];
  let minDiff = Math.abs(rate - best);
  for (const r of pool) {
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
