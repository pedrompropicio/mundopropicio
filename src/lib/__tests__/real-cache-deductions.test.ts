import { describe, it, expect } from "vitest";
import { computeRealCacheResults, cityDeductionSources } from "@/lib/real-cache-calc";

const AEREO = "c0000015-0000-0000-0000-000000000001";
const COMISSAO = "e033d7d7-4da6-4dc7-94c5-c9d2c5aff686";
const config = { id: "cfg", artist_name: "SM", cache_type: "variable", cache_revenue_basis: "net", cache_deduction_basis: "net", tiers: [], percentage: 50 };
const deductions = [{ cache_config_id: "cfg", category_id: AEREO }, { cache_config_id: "cfg", category_id: COMISSAO }];
const categoryMap = new Map([[AEREO, { code: "2.2.01", name: "Aéreo" }], [COMISSAO, { code: "2.6.07", name: "Comissão" }]]);
const fc = (category_id: string, amount: number, extra: any = {}) => ({ type: "expense", status: "approved", version_id: null, category_id, amount, iva_rate: 0, ...extra });
const tx = (category_id: string, amount: number) => ({ category_id, amount, iva_rate: 0 });

// Dados reais Turnê Simone Mendes 2026 (Live, 29/09/2026)
const masterForecasts = [fc(AEREO, 40876.71), fc(AEREO, 843.64)];
const masterExpenses = [tx(AEREO, 1166.99), tx(AEREO, 17536.72), tx(AEREO, 22173), tx(AEREO, 843.64)];
const comissao = (v: number) => fc(COMISSAO, v, { iva_rate: 23, is_overhead: true, exclude_from_result: true });

function city(cityForecasts: any[], cityExpenses: any[] = []) {
  const [r] = computeRealCacheResults({
    configs: [config], deductions, categoryMap, expenses: cityExpenses,
    sources: cityDeductionSources({ cityForecasts, cityExpenses, masterForecasts, masterExpenses, cityCount: 2 }),
    revenue: { gross: 0, net: 0 }, occupancyPct: 0,
  });
  return r;
}

describe("deduções do cachê — BP prioritário + rateio igual do Master", () => {
  it("SM - Lisboa = 24.582,28 (20.860,18 aéreo rateado + 3.722,10 comissão do BP)", () => {
    const r = city([comissao(3722.1)]);
    expect(r.deductionDetails.find((d) => d.categoryId === AEREO)!.amount).toBe(20860.18);
    const c = r.deductionDetails.find((d) => d.categoryId === COMISSAO)!;
    expect(c.amount).toBe(3722.1);
    expect(c.origin).toBe("bp");
    expect(Math.round(r.realDeductionAmount * 100) / 100).toBe(24582.28);
  });

  it("SM - Porto = 25.423,68", () => {
    const r = city([comissao(4563.5)]);
    expect(Math.round(r.realDeductionAmount * 100) / 100).toBe(25423.68);
  });

  it("rateio do Master é igual por cidade (independente das vendas)", () => {
    const a = city([]);
    expect(a.deductionDetails[0].amount).toBe(20860.18);
  });

  it("previsto + excedido: nunca soma BP e transação", () => {
    const within = city([fc(COMISSAO, 1000)], [tx(COMISSAO, 800)]);
    expect(within.deductionDetails[1].amount).toBe(1000);
    expect(within.deductionDetails[1].origin).toBe("bp");
    const over = city([fc(COMISSAO, 1000)], [tx(COMISSAO, 1300)]);
    expect(over.deductionDetails[1].amount).toBe(1300);
    expect(over.deductionDetails[1].origin).toBe("bp_excess");
    const onlyTx = city([], [tx(COMISSAO, 500)]);
    expect(onlyTx.deductionDetails[1].amount).toBe(500);
    expect(onlyTx.deductionDetails[1].origin).toBe("transaction");
  });

  it("BP não aprovado não conta", () => {
    const r = city([fc(COMISSAO, 1000, { status: "pending" })]);
    expect(r.deductionDetails[1].origin).toBe("none");
  });
});

import { cacheImpactOnTopOfCost } from "@/lib/event-cost-basis";
describe("#259 — cachê uma vez só no custo", () => {
  const op = { type: "expense", status: "approved", version_id: null, amount: 100 };
  it("BP com linhas do módulo de cachê: cachê não soma por cima", () => {
    expect(cacheImpactOnTopOfCost(154950.94, [op, { ...op, cache_config_id: "cfg", amount: 69477.36 }], "committed")).toBe(0);
  });
  it("BP sem linhas do módulo: cachê soma", () => {
    expect(cacheImpactOnTopOfCost(1000, [op], "committed")).toBe(1000);
  });
  it("realizado: cachê ainda não lançado soma", () => {
    expect(cacheImpactOnTopOfCost(1000, [{ ...op, cache_config_id: "cfg" }], "realized")).toBe(1000);
  });
});
