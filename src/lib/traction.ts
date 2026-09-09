/**
 * Tração (variação do período vs. período anterior) com guarda de base.
 *
 * Uma percentagem de variação só tem leitura quando o período anterior tem
 * base suficiente. Com base quase nula (ex.: cidade que acabou de abrir
 * vendas, 253 bilhetes contra 8) a conta está certa mas amplifica ruído e
 * empurra para o topo dos ecrãs exactamente as linhas com menos informação.
 * Nesses casos mostram-se os dois números em bruto e a nota "base curta".
 */
export interface Traction {
  /** Percentagem só quando a base aguenta; senão null. */
  pct: number | null;
  /** Base curta: há período anterior, mas demasiado pequeno para julgar. */
  shortBase: boolean;
  qty: number;
  prevQty: number;
}

/** Mínimo de bilhetes no período anterior para a percentagem ter leitura. */
export const TRACTION_MIN_PREV_QTY = 30;

export function traction(qty: number, prevQty: number, days: number): Traction {
  const q = Number(qty || 0);
  const p = Number(prevQty || 0);
  if (p <= 0) return { pct: null, shortBase: false, qty: q, prevQty: p };
  if (p < TRACTION_MIN_PREV_QTY || (days > 0 && p / days < 1)) {
    return { pct: null, shortBase: true, qty: q, prevQty: p };
  }
  return { pct: ((q - p) / p) * 100, shortBase: false, qty: q, prevQty: p };
}

/** Ordenação por tração: sem percentagem vai para o fim do bloco. */
export function tractionSortKey(t: Traction): number {
  return t.pct ?? Number.POSITIVE_INFINITY;
}

/** Texto de uma célula/indicador de tração (usado no PDF). */
export function tractionText(t: Traction, nf: Intl.NumberFormat): string {
  if (t.pct !== null) return `${t.pct > 0 ? "+" : ""}${nf.format(Math.round(t.pct))}%`;
  if (t.shortBase) return `${nf.format(t.qty)} vs ${nf.format(t.prevQty)}\nbase curta`;
  return "—";
}
