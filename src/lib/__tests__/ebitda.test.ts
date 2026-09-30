import { describe, it, expect } from "vitest";
import {
  computeEbitda,
  signedParcelsFromLines,
  costParcelsOnBasis,
  emptyParcels,
  type EbitdaClassMap,
} from "../ebitda";
import { computeEventCostOnBasis } from "../event-cost-basis";

const map: EbitdaClassMap = { juros: "financeiro", irc: "imposto_rendimento", amort: "amortizacao" };

describe("computeEbitda", () => {
  it("soma as parcelas ao resultado e esconde linhas a zero", () => {
    const r = computeEbitda(-1000, { financeiro: 120, imposto_rendimento: 0, amortizacao: 30 });
    expect(r.result).toBe(-1000);
    expect(r.ebitda).toBeCloseTo(-850, 2);
    expect(r.bridge.map((b) => b.key)).toEqual(["financeiro", "amortizacao"]);
  });
  it("sem parcelas: EBITDA = resultado e ponte vazia", () => {
    const r = computeEbitda(500, emptyParcels());
    expect(r.ebitda).toBe(500);
    expect(r.bridge).toEqual([]);
  });
});

describe("signedParcelsFromLines", () => {
  it("juros pagos somam e juros recebidos subtraem (mesma classe)", () => {
    const p = signedParcelsFromLines(
      [
        { amount: 200, iva_rate: 0, category_id: "juros", type: "expense" },
        { amount: 50, iva_rate: 0, category_id: "juros", type: "income" },
        { amount: 300, iva_rate: 0, category_id: "irc", type: "expense" },
      ],
      map,
      false,
    );
    expect(p.financeiro).toBeCloseTo(150, 2);
    expect(p.imposto_rendimento).toBeCloseTo(300, 2);
    expect(p.amortizacao).toBe(0);
  });
  it("conta sem classe fica fora", () => {
    const p = signedParcelsFromLines(
      [
        { amount: 999, iva_rate: 23, category_id: "operacional", type: "expense" },
        { amount: 10, iva_rate: 23, category_id: null, type: "expense" },
      ],
      map,
      true,
    );
    expect(p).toEqual(emptyParcels());
  });
});

describe("costParcelsOnBasis", () => {
  const forecasts = [
    { amount: 100, iva_rate: 0, category_id: "juros", status: "approved", type: "expense" },
    { amount: 400, iva_rate: 23, category_id: "palco", status: "approved", type: "expense" },
  ];
  const transactions = [
    { amount: 130, iva_rate: 0, category_id: "juros", status: "paid", type: "expense" }, // excede 30
    { amount: 350, iva_rate: 23, category_id: "palco", status: "approved", type: "expense" },
    { amount: 20, iva_rate: 0, category_id: "amort", status: "paid", type: "expense" }, // sem BP → inteiro
  ];

  it("bate com computeEventCostOnBasis restrito às linhas de cada classe", () => {
    for (const withVat of [false, true]) {
      const base = { mode: "committed" as const, withVat, includeOverhead: false };
      const p = costParcelsOnBasis({ ...base, forecasts, transactions, classMap: map });
      const only = (cid: string) =>
        computeEventCostOnBasis({
          ...base,
          forecasts: forecasts.filter((l) => l.category_id === cid),
          transactions: transactions.filter((l) => l.category_id === cid),
        }).total;
      expect(p.financeiro).toBeCloseTo(only("juros"), 2);
      expect(p.financeiro).toBeCloseTo(130, 2);
      expect(p.amortizacao).toBeCloseTo(only("amort"), 2);
      expect(p.imposto_rendimento).toBe(0);
    }
  });

  it("conta operacional (palco) não entra nas parcelas", () => {
    const p = costParcelsOnBasis({
      mode: "committed", withVat: false, includeOverhead: false,
      forecasts: forecasts.filter((l) => l.category_id === "palco"),
      transactions: transactions.filter((l) => l.category_id === "palco"),
      classMap: map,
    });
    expect(p).toEqual(emptyParcels());
  });
});
