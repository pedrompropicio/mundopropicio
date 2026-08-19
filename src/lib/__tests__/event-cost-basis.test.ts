import { describe, it, expect } from "vitest";
import { computeOutsideBpExcess, computeOverrunMap, sumExcess, lineValue } from "../event-cost-basis";

describe("lineValue", () => {
  it("aplica IVA linha a linha (Art.º 18 CIVA)", () => {
    expect(lineValue(33.33, 23, false)).toBe(33.33);
    expect(lineValue(33.33, 23, true)).toBe(41);
    expect(lineValue(null, 23, true)).toBe(0);
  });
});

describe("computeOutsideBpExcess", () => {
  const fc = [
    { amount: 100, iva_rate: 23, category_id: "a" },
    { amount: 50, iva_rate: 6, category_id: "b" },
  ];

  it("soma apenas o excesso por rubrica", () => {
    const tx = [
      { amount: 120, iva_rate: 23, category_id: "a" }, // +20
      { amount: 10, iva_rate: 6, category_id: "b" },   // abaixo do previsto → 0
    ];
    expect(computeOutsideBpExcess(fc, tx, false)).toBeCloseTo(20, 2);
  });

  it("rubricas sem linha no BP contam por inteiro", () => {
    const tx = [{ amount: 80, iva_rate: 23, category_id: "z" }];
    expect(computeOutsideBpExcess(fc, tx, false)).toBeCloseTo(80, 2);
    expect(computeOutsideBpExcess(fc, tx, true)).toBeCloseTo(98.4, 2);
  });

  it("transações sem categoria formam bucket próprio", () => {
    const tx = [{ amount: 30, iva_rate: 0, category_id: null }];
    expect(computeOutsideBpExcess(fc, tx, false)).toBeCloseTo(30, 2);
  });
});

describe("computeOverrunMap", () => {
  it("ignora desvios dentro da tolerância", () => {
    const m = computeOverrunMap([
      { key: "a", forecast: 100, realized: 100.004 },
      { key: "b", forecast: 100, realized: 130 },
    ]);
    expect(Object.keys(m)).toEqual(["b"]);
    expect(sumExcess(m)).toBeCloseTo(30, 2);
  });
});
