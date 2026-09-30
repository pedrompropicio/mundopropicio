/**
 * Vista EBITDA (D-ERP151 / #266) — helper PARTILHADO e puro.
 *
 * EBITDA = resultado + gastos(financeiro + imposto_rendimento + amortizacao)
 *                     − rendimentos dessas classes.
 *
 * Nunca recalcula o resultado: recebe o resultado que o ecrã já mostra e só
 * isola as parcelas classificadas, sobre a MESMA base de linhas que o ecrã usa.
 * A classe lê-se na conta onde a linha está lançada (último nível; não herda).
 * É vista de análise — acerto com sócios, cachê e cascata do Fecho não usam isto.
 */

import {
  computeEventCostOnBasis,
  lineValue,
  type EventCostOnBasisArgs,
} from "./event-cost-basis.ts";

export type EbitdaClass = "financeiro" | "imposto_rendimento" | "amortizacao";
export const EBITDA_CLASSES: EbitdaClass[] = ["financeiro", "imposto_rendimento", "amortizacao"];

export const EBITDA_CLASS_LABEL: Record<EbitdaClass, string> = {
  financeiro: "Resultado financeiro",
  imposto_rendimento: "Imposto sobre o rendimento",
  amortizacao: "Amortizações",
};

/** category_id → classe (só contas classificadas; ausência = operacional). */
export type EbitdaClassMap = Record<string, EbitdaClass | null | undefined>;

/** Parcelas a SOMAR ao resultado (gasto − rendimento), por classe. */
export type EbitdaParcels = Record<EbitdaClass, number>;

export function emptyParcels(): EbitdaParcels {
  return { financeiro: 0, imposto_rendimento: 0, amortizacao: 0 };
}

export function isEbitdaClass(v: unknown): v is EbitdaClass {
  return v === "financeiro" || v === "imposto_rendimento" || v === "amortizacao";
}

export function classOf(categoryId: string | null | undefined, map: EbitdaClassMap): EbitdaClass | null {
  if (!categoryId) return null;
  const c = map[categoryId];
  return isEbitdaClass(c) ? c : null;
}

export function addParcels(a: EbitdaParcels, b: EbitdaParcels, sign = 1): EbitdaParcels {
  return {
    financeiro: a.financeiro + sign * b.financeiro,
    imposto_rendimento: a.imposto_rendimento + sign * b.imposto_rendimento,
    amortizacao: a.amortizacao + sign * b.amortizacao,
  };
}

export function scaleParcels(a: EbitdaParcels, k: number): EbitdaParcels {
  return { financeiro: a.financeiro * k, imposto_rendimento: a.imposto_rendimento * k, amortizacao: a.amortizacao * k };
}

/**
 * Parcela de CUSTO por classe sobre a base do card (`computeEventCostOnBasis`).
 * O critério é aditivo por rubrica (BP + excesso por category_id), por isso
 * aplicá-lo às linhas de cada classe dá exactamente a parte do total dessa classe.
 */
export function costParcelsOnBasis(
  args: EventCostOnBasisArgs & { classMap: EbitdaClassMap },
): EbitdaParcels {
  const out = emptyParcels();
  for (const cls of EBITDA_CLASSES) {
    const f = (args.forecasts ?? []).filter((l) => classOf(l?.category_id, args.classMap) === cls);
    const t = (args.transactions ?? []).filter((l) => classOf(l?.category_id, args.classMap) === cls);
    if (f.length === 0 && t.length === 0) continue;
    out[cls] = computeEventCostOnBasis({ ...args, forecasts: f, transactions: t }).total;
  }
  return out;
}

/**
 * Soma com sinal de linhas já filtradas pelo ecrã (DRE, receitas do card):
 * despesa soma, receita subtrai. `sign` por linha vem de `type`.
 */
export function signedParcelsFromLines(
  lines: Array<{ amount: any; iva_rate?: any; category_id?: string | null; type?: string | null }>,
  classMap: EbitdaClassMap,
  withVat: boolean,
): EbitdaParcels {
  const out = emptyParcels();
  for (const l of lines ?? []) {
    const cls = classOf(l.category_id, classMap);
    if (!cls) continue;
    const v = lineValue(l.amount, l.iva_rate, withVat);
    out[cls] += l.type === "income" ? -v : v;
  }
  return out;
}

export interface EbitdaBridgeLine {
  key: EbitdaClass;
  label: string;
  value: number;
}

export interface EbitdaResult {
  result: number;
  ebitda: number;
  /** Só linhas ≠ 0 (a ponte esconde as linhas a zero). */
  bridge: EbitdaBridgeLine[];
}

const ZERO = 0.005;

export function computeEbitda(result: number, parcels: EbitdaParcels): EbitdaResult {
  const r = Number(result || 0);
  const bridge = EBITDA_CLASSES
    .map((k) => ({ key: k, label: EBITDA_CLASS_LABEL[k], value: Number(parcels[k] || 0) }))
    .filter((l) => Math.abs(l.value) > ZERO);
  const ebitda = r + EBITDA_CLASSES.reduce((s, k) => s + Number(parcels[k] || 0), 0);
  return { result: r, ebitda, bridge };
}
