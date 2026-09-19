import { describe, it, expect } from "vitest";
import { computeEventCostOnBasis, computeMasterQuota } from "../event-cost-basis";

/**
 * Issue #217 — Σ custo(cidades) = custo(turnê) por construção.
 *
 * O custo de um evento numa base é SEMPRE `computeEventCostOnBasis` de UM evento.
 * A vista de cidade acrescenta `computeMasterQuota(custo(master), n)`.
 */

const fc = (over: Partial<any>) => ({
  status: "approved",
  is_transitory: false,
  is_overhead: false,
  exclude_from_result: false,
  version_id: null,
  iva_rate: 23,
  ...over,
});

const tx = (over: Partial<any>) => ({
  status: "paid",
  is_transitory: false,
  exclude_from_result: false,
  reversed_at: null,
  is_hidden: false,
  iva_rate: 23,
  ...over,
});

// Master com BP operacional, overhead e uma transação que excede a rubrica "m1".
const master = {
  forecasts: [
    fc({ category_id: "m1", amount: 1000 }),
    fc({ category_id: "m2", amount: 500, iva_rate: 6 }),
    fc({ category_id: "oh", amount: 300, is_overhead: true, exclude_from_result: true }),
  ],
  transactions: [tx({ category_id: "m1", amount: 1200 })],
};

// Filho A excede a rubrica "a"; filho B tem folga na MESMA rubrica.
const filhoA = {
  forecasts: [fc({ category_id: "a", amount: 100 })],
  transactions: [tx({ category_id: "a", amount: 130 })],
};
const filhoB = {
  forecasts: [fc({ category_id: "a", amount: 100 })],
  transactions: [tx({ category_id: "a", amount: 50 })],
};

const combos = [
  { mode: "committed" as const, withVat: false, includeOverhead: false },
  { mode: "committed" as const, withVat: false, includeOverhead: true },
  { mode: "committed" as const, withVat: true, includeOverhead: false },
  { mode: "committed" as const, withVat: true, includeOverhead: true },
  { mode: "realized" as const, withVat: false, includeOverhead: false },
  { mode: "realized" as const, withVat: false, includeOverhead: true },
  { mode: "realized" as const, withVat: true, includeOverhead: false },
  { mode: "realized" as const, withVat: true, includeOverhead: true },
];

describe("invariante da turnê", () => {
  it.each(combos)("Σ cidades = turnê (%o)", (opts) => {
    const global =
      computeEventCostOnBasis({ ...master, ...opts }).total +
      computeEventCostOnBasis({ ...filhoA, ...opts }).total +
      computeEventCostOnBasis({ ...filhoB, ...opts }).total;

    const masterCost = computeEventCostOnBasis({ ...master, ...opts }).total;
    const quota = computeMasterQuota(masterCost, 2);
    const somaCidades =
      computeEventCostOnBasis({ ...filhoA, ...opts }).total + quota +
      computeEventCostOnBasis({ ...filhoB, ...opts }).total + quota;

    expect(somaCidades).toBeCloseTo(global, 6);
  });
});

describe("excesso por rubrica não é absorvido entre eventos", () => {
  const opts = { mode: "committed" as const, withVat: false, includeOverhead: false };

  it("filho que excede conta o excesso; folga do irmão não o compensa", () => {
    const a = computeEventCostOnBasis({ ...filhoA, ...opts });
    const b = computeEventCostOnBasis({ ...filhoB, ...opts });
    expect(a.excess).toBeCloseTo(30, 2);
    expect(a.total).toBeCloseTo(130, 2);
    expect(b.excess).toBeCloseTo(0, 2);
    expect(b.total).toBeCloseTo(100, 2);
    expect(a.total + b.total).toBeCloseTo(230, 2);
  });

  it("um pool dos dois eventos daria 200 — é isso que não se pode fazer", () => {
    const pooled = computeEventCostOnBasis({
      forecasts: [...filhoA.forecasts, ...filhoB.forecasts],
      transactions: [...filhoA.transactions, ...filhoB.transactions],
      ...opts,
    });
    expect(pooled.total).toBeCloseTo(200, 2);
    expect(pooled.total).not.toBeCloseTo(230, 2);
  });
});

describe("universo canónico do Fecho", () => {
  const opts = { mode: "committed" as const, withVat: false, includeOverhead: false };

  it("transação pending NÃO entra no excesso", () => {
    const semPending = computeEventCostOnBasis({ ...filhoA, ...opts });
    const comPending = computeEventCostOnBasis({
      forecasts: filhoA.forecasts,
      transactions: [...filhoA.transactions, tx({ category_id: "a", amount: 500, status: "pending" })],
      ...opts,
    });
    expect(comPending.excess).toBeCloseTo(semPending.excess, 2);
    expect(comPending.total).toBeCloseTo(130, 2);
  });

  it("estornada/escondida/transitória/excluída ficam fora do realizado", () => {
    const r = computeEventCostOnBasis({
      forecasts: [],
      transactions: [
        tx({ amount: 100, iva_rate: 0 }),
        tx({ amount: 999, iva_rate: 0, reversed_at: "2026-09-01" }),
        tx({ amount: 999, iva_rate: 0, is_hidden: true }),
        tx({ amount: 999, iva_rate: 0, is_transitory: true }),
        tx({ amount: 999, iva_rate: 0, exclude_from_result: true }),
        tx({ amount: 999, iva_rate: 0, status: "draft" }),
      ],
      mode: "realized",
      withVat: false,
      includeOverhead: false,
    });
    expect(r.total).toBeCloseTo(100, 2);
  });
});

describe("computeMasterQuota", () => {
  it("divisor mínimo 1", () => {
    expect(computeMasterQuota(100, 0)).toBe(100);
    expect(computeMasterQuota(100, 4)).toBe(25);
  });
});
