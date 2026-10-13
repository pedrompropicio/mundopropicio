import { describe, expect, it } from "vitest";
import { computeRealCacheResults } from "@/lib/real-cache-calc";
import { computeTourCityCacheAmount } from "@/lib/tour-cache-sync";
import { computeCacheTabAmount, cacheTabRevenue, cacheTabDeductionBreakdown } from "@/lib/cache-tab-total";

// Caso Deive Leonardo (13/10/2026): 40%, mínimo 4.000 €, vendas reais por cidade.
const config = { id: "C", artist_name: "Deive", cache_type: "variable", percentage: 40, minimum_guaranteed: 4000, fixed_deduction_percentage: 0, tiers: [] };
const cities = {
  LIS: { net: 39042.45, gross: 41385, dedBp: 0 },
  BRA: { net: 19489.62, gross: 20659, dedBp: 15000 }, // força o mínimo cidade a cidade
};
const city = (id: keyof typeof cities) =>
  computeRealCacheResults({
    configs: [config], deductions: [{ cache_config_id: "C", category_id: "K" }], categoryMap: new Map(), expenses: [],
    sources: [{ forecasts: [{ type: "expense", category_id: "K", amount: cities[id].dedBp, iva_rate: 0, status: "approved" }], expenses: [], weight: 1 }],
    revenue: { net: cities[id].net, gross: cities[id].gross }, occupancyPct: 50,
  });
const resultsByCity = { LIS: city("LIS"), BRA: city("BRA") };

describe("separador Cachê — total sobre vendas reais", () => {
  it("Master de turnê: total = Σ linhas de BP cache_module das cidades (mínimo por cidade)", () => {
    const bpLines = (["LIS", "BRA"] as const).map((id) =>
      computeTourCityCacheAmount({
        config, deductions: [{ cache_config_id: "C", category_id: "K" }],
        revenue: { net: cities[id].net, gross: cities[id].gross }, occupancyPct: 50,
        cityForecasts: [{ type: "expense", category_id: "K", amount: cities[id].dedBp, iva_rate: 0, status: "approved" }],
        cityExpenses: [], masterForecasts: [], masterExpenses: [], cityCount: 2,
      }));
    const tab = computeCacheTabAmount({ config, resultsByCity, childEventIds: ["LIS", "BRA"] });
    expect(tab).toBeCloseTo(bpLines[0] + bpLines[1], 2);
    expect(bpLines[1]).toBe(4000); // Braga no mínimo
  });

  it("receita do cabeçalho ≤ receita do cartão Receitas (vendas reais)", () => {
    const { revenue } = cacheTabRevenue(config, null, resultsByCity, ["LIS", "BRA"]);
    expect(revenue).toBeCloseTo(58532.07, 1);
    expect(revenue).toBeLessThanOrEqual(39042.45 + 19489.62 + 0.01);
  });

  it("settlement da cidade tem prioridade; evento simples usa o resultado real", () => {
    const st = [{ cache_config_id: "C", event_id: "BRA", adjusted_amount: 5000 }];
    expect(computeCacheTabAmount({ config, resultsByCity, childEventIds: ["LIS", "BRA"], citySettlements: st }))
      .toBeCloseTo(resultsByCity.LIS[0].finalAmount + 5000, 2);
    expect(computeCacheTabAmount({ config, realResult: resultsByCity.LIS[0] })).toBe(resultsByCity.LIS[0].finalAmount);
    expect(computeCacheTabAmount({ config: { ...config, cache_type: "fixed", fixed_amount: 1234 } })).toBe(1234);
  });
});

describe("separador Cachê — descontos do detalhe", () => {
  it("descontos mostrados = Σ descontos usados no cálculo por cidade", () => {
    const b = cacheTabDeductionBreakdown(config, null, resultsByCity, ["LIS", "BRA"]);
    const used = resultsByCity.LIS[0].totalDeduction + resultsByCity.BRA[0].totalDeduction;
    expect(b.totalDeduction).toBeCloseTo(used, 2);
    expect(b.totalDeduction).toBeCloseTo(15000, 2);
    expect(b.cities.map((c) => c.cityId)).toEqual(["LIS", "BRA"]);
    expect(b.byCategory.K).toBeCloseTo(used, 2);
  });
});
