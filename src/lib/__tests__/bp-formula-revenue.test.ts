/** #339 A1 — fórmula em linhas de RECEITA. */
import { describe, it, expect } from "vitest";
import { computeBpFormula } from "@/lib/bp-formula";
import {
  applyRevenueFloor, buildFormulaRecalcPatch, canRecalculateFormulas, formulaForbiddenReason, formulaLineNoun, incomeRealizedFromTx,
} from "@/lib/bp-formula-line-rules";
import { computeRevenueBasisFromRows } from "@/lib/event-revenue-basis";
import { computeRealCacheResults } from "@/lib/real-cache-calc";

// Duas zonas; IVA 6%. Z1: 1.060 bruto (1.000 líq.), Z2: 2.120 bruto (2.000 líq.).
const sales = [
  { zone_id: "z1", lot_id: "l1", quantity: 10, unit_price: 106, total_value: 1060, iva_rate: 6 },
  { zone_id: "z2", lot_id: "l2", quantity: 20, unit_price: 106, total_value: 2120, iva_rate: 6 },
] as any[];
const base = { sales, courtesies: [] as any[], realized: true, liveForecast: null };

describe("#339 A1 — cálculo em linha income", () => {
  it("pct bruta, evento todo: 2,5% × 3.180 = 79,50", () => {
    expect(computeBpFormula({ ...base, formulaType: "pct_ticket_revenue", params: { rate: 2.5, basis: "gross", zone_ids: null } }).amount).toBe(79.5);
  });
  it("pct líquida só Z2: 2% × 2.000 = 40,00", () => {
    expect(computeBpFormula({ ...base, formulaType: "pct_ticket_revenue", params: { rate: 2, basis: "net", zone_ids: ["z2"] } }).amount).toBe(40);
  });
  it("pct com mínimo e máximo", () => {
    const p = { rate: 2, basis: "net" as const, zone_ids: ["z1"] };
    expect(computeBpFormula({ ...base, formulaType: "pct_ticket_revenue", params: { ...p, min: 50 } }).amount).toBe(50);
    expect(computeBpFormula({ ...base, formulaType: "pct_ticket_revenue", params: { ...p, rate: 10, max: 60 } }).amount).toBe(60);
  });
  it("per_head em receita: 30 vendidos × 1,50 = 45,00", () => {
    expect(computeBpFormula({ ...base, formulaType: "per_head", params: { unit_amount: 1.5, include_courtesies: false, zone_ids: null } }).amount).toBe(45);
  });
  it("rótulo receita/custo pelo tipo", () => {
    expect(formulaLineNoun("income")).toBe("receita");
    expect(formulaLineNoun("expense")).toBe("custo");
  });
});

describe("#339 A1 — recusa em 1.1.01 e 1.1.03", () => {
  it("recusa receita de bilheteira e A&B (e descendentes)", () => {
    expect(formulaForbiddenReason("income", "1.1.01")).toMatch(/bilheteira/);
    expect(formulaForbiddenReason("income", "1.1.01.02")).toMatch(/bilheteira/);
    expect(formulaForbiddenReason("income", "1.1.03")).toMatch(/A&B/);
  });
  it("aceita outras receitas e qualquer despesa", () => {
    expect(formulaForbiddenReason("income", "1.3.04")).toBeNull();
    expect(formulaForbiddenReason("income", "1.1.010")).toBeNull();
    expect(formulaForbiddenReason("expense", "1.1.01")).toBeNull();
  });
});

describe("#339 A1 — chão #240 em receita", () => {
  const tx = (amount: number, extra: any = {}) => ({ type: "income", status: "paid", amount, ...extra });
  it("realizado só com income válidas", () => {
    expect(incomeRealizedFromTx([tx(100), tx(50, { status: "pending" }), tx(30, { is_transitory: true }), tx(20, { reversed_at: "x" }), { type: "expense", status: "paid", amount: 999 }])).toBe(100);
  });
  it("calculado abaixo do realizado grava o realizado", () => {
    expect(applyRevenueFloor(79.5, 100)).toEqual({ amount: 100, floorHit: true });
    expect(applyRevenueFloor(120, 100)).toEqual({ amount: 120, floorHit: false });
  });
});

describe("#339 A1 — só eventos abertos", () => {
  it("concluído ou selado não recalcula", () => {
    expect(canRecalculateFormulas({ status: "completed", hasSealedSettlement: false })).toBe(false);
    expect(canRecalculateFormulas({ status: "active", hasSealedSettlement: true })).toBe(false);
    expect(canRecalculateFormulas({ status: "active", hasSealedSettlement: false })).toBe(true);
  });
});

describe("#339 A1 — patch do recálculo", () => {
  it("só formula_value e formula_params; preserva parâmetros", () => {
    const patch = buildFormulaRecalcPatch({ rate: 2.5, basis: "gross", zone_ids: null }, { text: "t", amount: 79.5 }, 79.5, false, "2026-10-23T00:00:00Z");
    expect(Object.keys(patch).sort()).toEqual(["formula_params", "formula_value"]);
    for (const k of ["event_settlement_id", "is_overhead", "exclude_from_result", "is_transitory", "category_id", "amount"]) expect(patch).not.toHaveProperty(k);
    expect(patch.formula_params).toMatchObject({ rate: 2.5, basis: "gross", last_calculated: 79.5, floor_hit: false });
  });
});

describe("#339 A1 — cachê inalterado", () => {
  it("a base do cachê é só ticket_sales; uma receita de fórmula não entra", () => {
    const config = { id: "cfg", artist_name: "X", cache_type: "variable", cache_revenue_basis: "net", cache_deduction_basis: "net", tiers: [], percentage: 50 };
    const run = (expenses: any[]) => computeRealCacheResults({
      configs: [config] as any, deductions: [], categoryMap: new Map(), expenses,
      revenue: { gross: 3180, net: 3000 }, occupancyPct: 0,
    } as any)[0];
    const without = run([]);
    const withIncome = run([{ type: "income", category_id: "c-1304", amount: 79.5, iva_rate: 23, formula_type: "pct_ticket_revenue" }]);
    expect(withIncome.revenueBasis).toBe(3000);
    expect(withIncome.revenueBasis).toBe(without.revenueBasis);
  });
});

describe("#339 A1 — receita da linha conta uma vez (outros)", () => {
  it("linha 1.3.04 com fórmula soma uma vez ao bucket outros", () => {
    const line = { id: "f-rs", amount: 79.5, iva_rate: 0, status: "approved", is_transitory: false, exclude_from_result: false, is_overhead: false, formula_type: "pct_ticket_revenue", account_categories: { code: "1.3.04" } };
    const r = computeRevenueBasisFromRows({
      ticket: { net: 0, gross: 0 }, incomeTx: [], incomeForecasts: [line], ticketForecast: null, abForecastNet: null,
      sponsorship: { hasTargets: false, closedAt: null, baselineNet: null, currentNet: null, realNet: 0, currentGross: null, realGross: 0, segments: [], excludedForecastIds: [] },
    } as any);
    expect(r.currentForecast.buckets.outros?.net).toBe(79.5);
    expect(r.currentForecast.total?.net).toBe(79.5);
  });
});
