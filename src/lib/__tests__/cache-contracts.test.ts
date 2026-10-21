import { describe, it, expect } from "vitest";
import { MAX_CACHE_CONTRACTS, previewContract, remainingToContract, splitPostContractAdvance } from "@/lib/cache-contracts";

const LP = [
  { event_id: "L", name: "Lisboa", cap: 20000, is_absorber: true },
  { event_id: "P", name: "Porto", cap: 10000, is_absorber: false },
];

describe("contratos de cachê", () => {
  it("máximo de quatro contratos", () => {
    expect(MAX_CACHE_CONTRACTS).toBe(4);
  });

  it("contrato 12.000 sem retenção reparte 8.000 / 4.000", () => {
    const p = previewContract({ cities: LP, gross: 12000, withholdingRate: null, advancesByCity: {} });
    expect(p.cities.map((c) => c.artistBalance)).toEqual([8000, 4000]);
    expect(p.withholding).toBe(0);
  });

  it("contrato 18.000 com 25% e adiantamento 5.000 em Lisboa", () => {
    const p = previewContract({ cities: LP, gross: 18000, withholdingRate: 25, advancesByCity: { L: 5000 } });
    expect(p.cities.map((c) => c.withholding)).toEqual([3000, 1500]);
    expect(p.cities.map((c) => c.artistBalance)).toEqual([4000, 4500]);
    expect(p.artistBalance).toBe(8500);
    expect(p.withholding).toBe(4500);
    expect(p.negative).toHaveLength(0);
  });

  it("totais por cidade dos dois contratos dão 20.000 / 10.000", () => {
    const a = previewContract({ cities: LP, gross: 12000, withholdingRate: null, advancesByCity: {} });
    const b = previewContract({ cities: LP, gross: 18000, withholdingRate: 25, advancesByCity: { L: 5000 } });
    const total = (i: number) => a.cities[i].quota + b.cities[i].quota;
    expect([total(0), total(1)]).toEqual([20000, 10000]);
  });

  it("adiantamento 10.000 em Lisboa deixa saldo −1.000 e bloqueia", () => {
    const p = previewContract({ cities: LP, gross: 18000, withholdingRate: 25, advancesByCity: { L: 10000 } });
    expect(p.negative.map((c) => [c.name, c.artistBalance])).toEqual([["Lisboa", -1000]]);
  });

  it("turnê de 3 cidades 20k/10k/5k, contrato 30.000 a 25%", () => {
    const cities = [
      { event_id: "A", name: "A", cap: 20000, is_absorber: true },
      { event_id: "B", name: "B", cap: 10000, is_absorber: false },
      { event_id: "C", name: "C", cap: 5000, is_absorber: false },
    ];
    const p = previewContract({ cities, gross: 30000, withholdingRate: 25, advancesByCity: {} });
    expect(p.cities.map((c) => c.quota)).toEqual([17142.86, 8571.43, 4285.71]);
    expect(p.cities.map((c) => c.withholding)).toEqual([4285.71, 2142.86, 1071.43]);
    expect(p.cities.map((c) => c.artistBalance)).toEqual([12857.15, 6428.57, 3214.28]);
  });

  it("evento simples 10.000 com retenção e adiantamento 2.000", () => {
    const p = previewContract({
      cities: [{ event_id: "E", name: "E", cap: 10000, is_absorber: true }],
      gross: 10000, withholdingRate: 25, advancesByCity: { E: 2000 },
    });
    expect(p.artistBalance).toBe(5500);
    expect(p.withholding).toBe(2500);
  });

  it("evento simples sem retenção", () => {
    const p = previewContract({
      cities: [{ event_id: "E", name: "E", cap: 10000, is_absorber: true }],
      gross: 10000, withholdingRate: null, advancesByCity: {},
    });
    expect(p.artistBalance).toBe(10000);
  });

  it("adiantamento pós-fecho 2.000 sobre saldos 8.000/4.000", () => {
    expect(splitPostContractAdvance(2000, [8000, 4000])).toEqual([1333.33, 666.67]);
  });

  it("restante por contratar", () => {
    expect(remainingToContract({ totalCap: 30000, otherContractsGross: 12000, freeAdvancesNotChosen: 0 })).toBe(18000);
    expect(remainingToContract({ totalCap: 30000, otherContractsGross: 30000, freeAdvancesNotChosen: 0 })).toBe(0);
  });
});

import { cacheErrorMessage, cachePaymentGates } from "@/lib/cache-contracts";

describe("ajuste D-ERP288: congelar e linha de BP", () => {
  const city = (o: any = {}) => ({ event_id: "L", name: "Lisboa", forecast_id: "f", cap: 1000, source: "config", frozen: false, candidates: null, ...o });
  it("cachê configurado por congelar bloqueia contrato e permite adiantamento livre", () => {
    const g = cachePaymentGates({ has_config: true, frozen: false, cities: [city()] as any });
    expect([g.canCreateContract, g.canFreeAdvance, g.needsFreeze]).toEqual([false, true, true]);
  });
  it("cachê congelado permite contrato e bloqueia adiantamento livre", () => {
    const g = cachePaymentGates({ has_config: true, frozen: true, cities: [city({ frozen: true })] as any });
    expect([g.canCreateContract, g.canFreeAdvance]).toEqual([true, false]);
  });
  it("sem configuração: contrato pela linha de BP sem congelar", () => {
    const g = cachePaymentGates({ has_config: false, frozen: false, cities: [city({ source: "bp" })] as any });
    expect([g.canCreateContract, g.canFreeAdvance]).toEqual([true, true]);
  });
  it("várias linhas 2.1.01 sem escolha bloqueiam até escolher", () => {
    const cands = [{ forecast_id: "a", description: "A", amount: 1 }, { forecast_id: "b", description: "B", amount: 2 }];
    const g = cachePaymentGates({ has_config: false, frozen: false, cities: [city({ source: "bp", forecast_id: null, candidates: cands })] as any });
    expect(g.pending).toHaveLength(1);
    expect(g.canCreateContract).toBe(false);
  });
  it("códigos novos com mensagem pt-PT", () => {
    expect(cacheErrorMessage({ message: "cache_nao_congelado: x" })).toBe("Congele primeiro o cachê no modal; só depois pode criar o contrato de pagamento.");
    expect(cacheErrorMessage({ message: "cache_ja_congelado: x" })).toBe("O cachê já está congelado: lance o adiantamento dentro de um contrato.");
    expect(cacheErrorMessage({ message: "teto_excedido: bruto 5" })).toBe("bruto 5");
  });
});

import { inputToEuros } from "@/lib/cache-contracts";

describe("valor em € ou % (grava sempre €)", () => {
  it("40% de um cachê efetivo de 30.000 dá 12.000 €", () => {
    expect(inputToEuros("40", "pct", 30000)).toBe(12000);
  });
  it("arredonda a 2 casas: 33,333% de 10.000 dá 3.333,30 €", () => {
    expect(inputToEuros("33,333", "pct", 10000)).toBe(3333.3);
    expect(inputToEuros("1", "pct", 333.33)).toBe(3.33);
  });
  it("adiantamento dentro de contrato: 10% do saldo disponível 8.500 dá 850 €", () => {
    expect(inputToEuros("10", "pct", 8500)).toBe(850);
  });
  it("€ passa tal e qual; vírgula aceite", () => {
    expect(inputToEuros("1234,56", "eur", 0)).toBe(1234.56);
  });
  it("inválidos: vazio, negativo, % acima de 100", () => {
    expect(inputToEuros("", "pct", 100)).toBeNaN();
    expect(inputToEuros("-1", "eur", 100)).toBeNaN();
    expect(inputToEuros("101", "pct", 100)).toBeNaN();
  });
  it("100% do cachê efetivo excede o restante quando já há contratos", () => {
    const remaining = remainingToContract({ totalCap: 30000, otherContractsGross: 12000, freeAdvancesNotChosen: 0 });
    expect(inputToEuros("100", "pct", 30000) > remaining).toBe(true);
  });
});
