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

import { calcTotalWithIva } from "./iva.ts";
import { isValidFechoTransaction } from "./fecho-filters.ts";

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

/** Agrupamento por rubrica (`category_id`), com IVA aplicado linha a linha. */
function groupByCategory(lines: AmountLine[], withVat: boolean): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    const k = bucketKey(l.category_id);
    m.set(k, (m.get(k) ?? 0) + lineValue(l.amount, l.iva_rate, withVat));
  }
  return m;
}

/**
 * Excesso por rubrica: Σ max(realizado − previsto, 0), agrupado por category_id.
 * `forecasts` deve conter apenas as linhas operacionais do BP (sem overhead).
 */
export function computeOutsideBpExcess(
  forecasts: AmountLine[],
  transactions: AmountLine[],
  withVat: boolean,
): number {
  const fc = groupByCategory(forecasts, withVat);
  const real = groupByCategory(transactions, withVat);
  let excess = 0;
  for (const [k, r] of real) {
    const diff = r - (fc.get(k) ?? 0);
    if (diff > EXCESS_EPSILON) excess += diff;
  }
  return excess;
}

/**
 * (g13) O MESMO excesso, mas itemizado por rubrica, para os documentos poderem
 * apresentar as linhas que compõem o total sem recalcular nada por fora.
 * Σ dos `net` iguala `computeOutsideBpExcess(..., false)` e Σ dos `gross`
 * iguala `computeOutsideBpExcess(..., true)`.
 */
export function computeOutsideBpExcessLines(
  forecasts: AmountLine[],
  transactions: AmountLine[],
): Array<{ categoryId: string | null; net: number; gross: number }> {
  const fcNet = groupByCategory(forecasts, false);
  const fcGross = groupByCategory(forecasts, true);
  const realNet = groupByCategory(transactions, false);
  const realGross = groupByCategory(transactions, true);
  const out: Array<{ categoryId: string | null; net: number; gross: number }> = [];
  for (const k of new Set([...realNet.keys(), ...realGross.keys()])) {
    const diffNet = (realNet.get(k) ?? 0) - (fcNet.get(k) ?? 0);
    const diffGross = (realGross.get(k) ?? 0) - (fcGross.get(k) ?? 0);
    const net = diffNet > EXCESS_EPSILON ? diffNet : 0;
    const gross = diffGross > EXCESS_EPSILON ? diffGross : 0;
    if (net === 0 && gross === 0) continue;
    out.push({ categoryId: k === NO_CATEGORY ? null : k, net, gross });
  }
  return out;
}


export interface UnusedBudgetEntry {
  key: string;
  forecast: number;
  realized: number;
  unused: number;
}

/**
 * Espelho de `computeOutsideBpExcess`: verba de BP por usar, por rubrica.
 * Σ max(previsto − realizado, 0), ordenada por `unused` decrescente.
 */
export function computeUnusedBudget(
  forecasts: AmountLine[],
  transactions: AmountLine[],
  withVat: boolean,
): UnusedBudgetEntry[] {
  const fc = groupByCategory(forecasts, withVat);
  const real = groupByCategory(transactions, withVat);
  const out: UnusedBudgetEntry[] = [];
  for (const [k, f] of fc) {
    const r = real.get(k) ?? 0;
    const unused = f - r;
    if (unused > EXCESS_EPSILON) out.push({ key: k, forecast: f, realized: r, unused });
  }
  return out.sort((a, b) => b.unused - a.unused);
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

/* ──────────────────────────────────────────────────────────────────────────
 * CUSTO DE UM EVENTO NUMA BASE — critério ÚNICO (issue #217)
 *
 * A cidade, a quota do Master e a turnê passam a usar EXACTAMENTE esta função,
 * um evento de cada vez. Assim `Σ custo(cidades) = custo(turnê)` é verdadeiro
 * por construção: o que a turnê conta como custo-mãe é o mesmo que se reparte.
 *
 * Nunca usar um "pool" de vários eventos: o excesso por rubrica de uma cidade
 * seria absorvido pela folga de outra na mesma rubrica.
 * ────────────────────────────────────────────────────────────────────────── */

export type EventCostMode = "realized" | "committed";

export interface EventCostOnBasisArgs {
  /** `event_forecasts` do evento (type='expense', `version_id IS NULL`). */
  forecasts: any[];
  /** `transactions` do evento (type='expense'), sem pré-filtro de estado. */
  transactions: any[];
  mode: EventCostMode;
  withVat: boolean;
  includeOverhead: boolean;
}

export interface EventCostOnBasisResult {
  total: number;
  /** Σ das linhas de overhead incluídas no total (0 se includeOverhead=false). */
  overhead: number;
  /** Excesso por rubrica (só em `committed`). */
  excess: number;
  /** Σ das linhas aprovadas do BP incluídas no total (só em `committed`). */
  bp: number;
  /** Nº de linhas de BP contadas (o card usa para "sem linhas aprovadas"). */
  approvedCount: number;
}

/** Linha de BP operacional aprovada (entra no resultado e consome verba). */
export function isApprovedOperationalForecast(f: any): boolean {
  return (
    f?.status === "approved" &&
    !f?.is_transitory &&
    !f?.is_overhead &&
    !f?.exclude_from_result &&
    (f?.version_id == null)
  );
}

/** Linha de BP de overhead aprovada (tem `exclude_from_result = true` por desenho). */
export function isApprovedOverheadForecast(f: any): boolean {
  return (
    f?.status === "approved" &&
    !f?.is_transitory &&
    f?.is_overhead === true &&
    (f?.version_id == null)
  );
}

export function computeEventCostOnBasis(args: EventCostOnBasisArgs): EventCostOnBasisResult {
  const { forecasts, transactions, mode, withVat, includeOverhead } = args;

  const validTx = (transactions ?? []).filter((t) => isValidFechoTransaction(t));

  if (mode === "realized") {
    return {
      total: sumLines(validTx, withVat),
      overhead: 0,
      excess: 0,
      bp: 0,
      approvedCount: 0,
    };
  }

  const operational = (forecasts ?? []).filter(isApprovedOperationalForecast);
  const overheadLines = (forecasts ?? []).filter(isApprovedOverheadForecast);

  const operationalSum = sumLines(operational, withVat);
  const overheadSum = includeOverhead ? sumLines(overheadLines, withVat) : 0;
  // O excesso compara SÓ rubricas operacionais — nunca o baseline do overhead.
  const excess = computeOutsideBpExcess(operational, validTx, withVat);

  return {
    total: operationalSum + overheadSum + excess,
    overhead: overheadSum,
    excess,
    bp: operationalSum + overheadSum,
    approvedCount: operational.length + (includeOverhead ? overheadLines.length : 0),
  };
}

/** Quota igualitária do custo do Master para cada sub-evento (mínimo 1 divisor). */
export function computeMasterQuota(masterCost: number, n: number): number {
  const divisor = Math.max(1, Math.trunc(Number(n) || 0));
  return Number(masterCost || 0) / divisor;
}
