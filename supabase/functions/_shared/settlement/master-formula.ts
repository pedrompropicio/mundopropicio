/** #339 B3: aggregate the canonical city engine; never recalculate ticketing here. */
import { computeBpFormula, isFormulaType, type BpFormulaInput, type BpFormulaResult } from "./bp-formula.ts";
import { roundCents } from "./iva.ts";

export interface MasterFormulaCity extends Omit<BpFormulaInput, "formulaType" | "params"> { eventId: string }
export function computeMasterBpFormula(input: Pick<BpFormulaInput, "formulaType" | "params"> & { cities: MasterFormulaCity[] }): BpFormulaResult & { cityBases: Record<string, number> } {
  const results = input.cities.map(city => ({ id: city.eventId, result: computeBpFormula({ ...city, formulaType: input.formulaType, params: { ...input.params, min: null, max: null } }) }));
  const cityBases = Object.fromEntries(results.map(({ id, result: { composition: c } }) => [id, c.revenue ?? (c.sold + c.courtesies)]));
  const first = results[0]?.result ?? computeBpFormula({ formulaType: input.formulaType, params: input.params, sales: [], courtesies: [], realized: true });
  const composition = { ...first.composition,
    source: results.some(r => r.result.composition.source === "simulador") ? "simulador" as const : "real" as const,
    revenue: input.formulaType === "pct_ticket_revenue" ? results.reduce((s,r) => s + (r.result.composition.revenue ?? 0), 0) : null,
    sold: results.reduce((s,r) => s + r.result.composition.sold, 0),
    courtesies: results.reduce((s,r) => s + r.result.composition.courtesies, 0),
    courtesiesSource: first.composition.courtesiesSource,
    pendingFinalCourtesies: results.some(r => r.result.composition.pendingFinalCourtesies),
    zoneFilterUsesReal: results.some(r => r.result.composition.zoneFilterUsesReal),
    clamped: null as BpFormulaResult["composition"]["clamped"],
  };
  const sources = new Set(results.map(r => r.result.composition.courtesiesSource).filter(Boolean));
  if (sources.size > 1) composition.courtesiesSource = "misto";
  else composition.courtesiesSource = results.find(r => r.result.composition.courtesiesSource)?.result.composition.courtesiesSource ?? null;
  let amount = roundCents(results.reduce((sum, city) => sum + city.result.amount, 0));
  if (input.params.min != null && amount < input.params.min) { amount = roundCents(input.params.min); composition.clamped = "min"; }
  if (input.params.max != null && amount > input.params.max) { amount = roundCents(input.params.max); composition.clamped = "max"; }
  return { amount, composition, cityBases };
}

/** Persisted canonical composition travels with the BP line to every reader. */
export interface MasterFormulaWarning {
  code: "composition_pending" | "zero_city_bases" | "city_outside_family";
  message: string;
}
export interface MasterFormulaAllocation {
  amounts: number[];
  shares: number[];
  warning?: MasterFormulaWarning;
}
const pendingWarning: MasterFormulaWarning = {
  code: "composition_pending",
  message: "Fórmula do Master: composição por cidade por recalcular — repartido em partes iguais",
};
const zeroWarning: MasterFormulaWarning = {
  code: "zero_city_bases",
  message: "Fórmula do Master: base das cidades zero — repartido em partes iguais",
};
function equalFormulaShares(childIds: string[], amount: number, warning: MasterFormulaWarning): MasterFormulaAllocation {
  const share = childIds.length ? 1 / childIds.length : 0;
  let assigned = 0;
  const amounts = childIds.map((_, index) => {
    const value = index === childIds.length - 1 ? roundCents(amount - assigned) : roundCents(amount * share);
    assigned = roundCents(assigned + value);
    return value;
  });
  return { amounts, shares: childIds.map(() => share), warning };
}
export function masterFormulaShares(line: { formula_type?: string | null; formula_params?: any }, childIds: string[], amount: number): MasterFormulaAllocation | null {
  if (!isFormulaType(line.formula_type)) return null;
  const bases = line.formula_params?.master_city_bases;
  if (!childIds.length) {
    const warning: MasterFormulaWarning = { code: "city_outside_family", message: "Fórmula do Master: cidade fora da família — repartido em partes iguais" };
    console.error(warning.message);
    return equalFormulaShares(childIds, amount, warning);
  }
  if (!bases || typeof bases !== "object" || Array.isArray(bases) || childIds.some(id => bases[id] == null || !Number.isFinite(Number(bases[id])) || Number(bases[id]) < 0)) return equalFormulaShares(childIds, amount, pendingWarning);
  if (Object.keys(bases).some(id => !childIds.includes(id))) {
    const warning: MasterFormulaWarning = { code: "city_outside_family", message: "Fórmula do Master: cidade fora da família — repartido em partes iguais" };
    console.error(warning.message);
    return equalFormulaShares(childIds, amount, warning);
  }
  const total = childIds.reduce((s,id) => s + Number(bases[id]), 0);
  if (total === 0 && amount !== 0) return equalFormulaShares(childIds, amount, zeroWarning);
  const shares = childIds.map(id => total ? Number(bases[id]) / total : 0);
  let assigned = 0;
  const allocation = new Map<string, number>();
  const ordered = Object.keys(bases).filter(id => childIds.includes(id));
  ordered.forEach((id,i) => {
    const share = shares[childIds.indexOf(id)];
    const value = i === ordered.length - 1 ? roundCents(amount - assigned) : roundCents(amount * share);
    assigned = roundCents(assigned + value); allocation.set(id, value);
  });
  const amounts = childIds.map(id => allocation.get(id) ?? 0);
  return { amounts, shares };
}

/** Canonical formula override for an existing legacy quota; no formula means exact legacy value. */
export function masterFormulaAmountForCity(line: { formula_type?: string | null; formula_params?: any }, childIds: string[], cityId: string, amount: number, legacy: number, warnings?: MasterFormulaWarning[]): number {
  const index = childIds.indexOf(cityId);
  if (index < 0) {
    const warning: MasterFormulaWarning = { code: "city_outside_family", message: "Fórmula do Master: cidade fora da família — repartido em partes iguais" };
    console.error(warning.message);
    warnings?.push(warning);
    return roundCents(amount / (childIds.length || 1));
  }
  const allocation = masterFormulaShares(line, childIds, amount);
  if (allocation?.warning) warnings?.push(allocation.warning);
  return allocation?.amounts[index] ?? legacy;
}

/** Scale inputs before the canonical cost engine, preserving the exact legacy path without formulas. */
export function masterFormulaCostInputsForCity(forecasts: any[], transactions: any[], childIds: string[], cityId: string) {
  if (!forecasts.some(f => isFormulaType(f.formula_type))) return null;
  const n = childIds.length || 1;
  const warnings: MasterFormulaWarning[] = [];
  const scale = (row: any, line: any) => {
    const rowWarnings: MasterFormulaWarning[] = [];
    const amount = masterFormulaAmountForCity(line ?? {}, childIds, cityId, Number(row.amount), Number(row.amount) / n, rowWarnings);
    warnings.push(...rowWarnings);
    return { ...row, amount, ...(rowWarnings.length ? { _master_formula_warning: rowWarnings[0] } : {}) };
  };
  return {
    forecasts: forecasts.map(f => scale(f, f)),
    transactions: transactions.map(t => scale(t,
      forecasts.find(f => f.transaction_id === t.id || f.id === t.forecast_id)
      ?? (forecasts.filter(f => f.category_id && f.category_id === t.category_id).length === 1 ? forecasts.find(f => f.category_id === t.category_id) : null))),
    warnings,
  };
}