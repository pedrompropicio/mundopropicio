/**
 * Base de cálculo do custo de um evento — helper partilhado entre o card de
 * Custos da capa do evento, o Encontro de Contas e o Fecho (ecrã + PDF).
 *
 * Regras (decisões do Pedro):
 *  • IVA é sempre calculado LINHA A LINHA via `@/lib/iva` (Art.º 18 CIVA).
 *    Nunca `amount * (1 + rate/100)` no agregado — dava desvios de cêntimos.
 *  • EXCESSO POR RUBRICA (entra SEMPRE na base "Previsto + excedido" — não é opção;
 *    um total dependente de um clique produz erro de fecho):
 *        Σ por category_id de max(realizado − previsto, 0)
 *    Rubricas sem linha no BP contam por inteiro (previsto = 0); transações
 *    sem categoria formam um bucket próprio. Esta é a definição já usada no
 *    "Previsto + excedido à realidade" do portal do sócio (bpL3Overrun).
 *  • Overhead (is_overhead) é opcional e nunca se mistura com o baseline do
 *    excesso — o excesso compara só rubricas operacionais.
 */

import { calcTotalWithIva } from "@/lib/iva";

/** Tolerância do "ultrapassou o previsto" (meio cêntimo). */
export const EXCESS_EPSILON = 0.005;

export interface CostBasisOptions {
  /** Incluir linhas de overhead (is_overhead) no total. Default OFF no card, ON no Fecho. */
  includeOverhead: boolean;
  /** true = valores c/IVA (bruto); false = base líquida. */
  withVat: boolean;
}

export interface AmountLine {
  amount: number | string | null | undefined;
  iva_rate?: number | string | null;
  category_id?: string | null;
}

/** Valor de uma linha, c/ ou s/IVA, com arredondamento ao cêntimo linha a linha. */
export function lineValue(
  amount: number | string | null | undefined,
  ivaRate: number | string | null | undefined,
  withVat: boolean,
): number {
  const base = Number(amount || 0);
  if (!withVat) return base;
  return calcTotalWithIva(base, Number(ivaRate || 0));
}

/** Soma de linhas com IVA aplicado linha a linha. */
export function sumLines(lines: AmountLine[], withVat: boolean): number {
  return lines.reduce((s, l) => s + lineValue(l.amount, l.iva_rate, withVat), 0);
}

const NO_CATEGORY = "__no_category__";

const bucketKey = (categoryId?: string | null) => categoryId ?? NO_CATEGORY;

/**
 * Excesso por rubrica: Σ max(realizado − previsto, 0), agrupado por category_id.
 * `forecasts` deve conter apenas as linhas operacionais do BP (sem overhead).
 */
export function computeOutsideBpExcess(
  forecasts: AmountLine[],
  transactions: AmountLine[],
  withVat: boolean,
): number {
  const fc = new Map<string, number>();
  for (const f of forecasts) {
    const k = bucketKey(f.category_id);
    fc.set(k, (fc.get(k) ?? 0) + lineValue(f.amount, f.iva_rate, withVat));
  }
  const real = new Map<string, number>();
  for (const t of transactions) {
    const k = bucketKey(t.category_id);
    real.set(k, (real.get(k) ?? 0) + lineValue(t.amount, t.iva_rate, withVat));
  }
  let excess = 0;
  for (const [k, r] of real) {
    const diff = r - (fc.get(k) ?? 0);
    if (diff > EXCESS_EPSILON) excess += diff;
  }
  return excess;
}

export interface OverrunEntry {
  key: string;
  forecast: number;
  realized: number;
}

export interface OverrunInfo {
  forecast: number;
  realized: number;
  excess: number;
}

/**
 * Mapa de rubricas ultrapassadas (usado pelo "Previsto + excedido à realidade").
 * Mesma definição de excesso de `computeOutsideBpExcess`, mas devolve detalhe
 * por chave para o UI poder destacar a linha.
 */
export function computeOverrunMap(entries: OverrunEntry[]): Record<string, OverrunInfo> {
  const m: Record<string, OverrunInfo> = {};
  for (const e of entries) {
    if (e.realized > e.forecast + EXCESS_EPSILON) {
      m[e.key] = { forecast: e.forecast, realized: e.realized, excess: e.realized - e.forecast };
    }
  }
  return m;
}

export function sumExcess(map: Record<string, OverrunInfo>): number {
  return Object.values(map).reduce((s, r) => s + r.excess, 0);
}

/** Rótulo curto do critério de IVA — usado em ecrã e nos PDFs. */
export function vatLabel(withVat: boolean): string {
  return withVat ? "c/IVA" : "s/IVA";
}
