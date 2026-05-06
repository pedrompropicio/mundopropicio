import { describe, it, expect } from "vitest";
import { scaleABFromReal, scaleABCostFromReal } from "@/lib/event-simulator-ab-scale";

const realRev = {
  drinkRevenue: 17215 * 3.68,   // 63.351,20
  foodRevenue: 17215 * 1.35,    // 23.240,25
  totalRevenue: 17215 * 5.03 + 100000, // base + outras receitas (irrelevante p/ escalamento)
  attendanceQty: 17215,
  attendanceCourtesyQty: 0,
};

const fcRevSeed = {
  drinkRevenue: 17215 * 3.68,   // veio congelado igual ao Real (caso reportado)
  foodRevenue: 17215 * 1.35,
  totalRevenue: 17215 * 5.03 + 100000,
  attendanceQty: 21881,
  attendanceCourtesyQty: 0,
};

describe("scaleABFromReal — escalamento por per-capita", () => {
  it("Forecast 21.881 com per-capita 5,03 → ≈ 110.065 €", () => {
    const out = scaleABFromReal(
      fcRevSeed,
      realRev,
      realRev.drinkRevenue,
      realRev.foodRevenue,
    );
    const totalAB = out.drinkRevenue + out.foodRevenue;
    expect(Math.round(totalAB)).toBeCloseTo(Math.round(21881 * 5.03), -1);
  });

  it("Real (mesmo público) → mantém valor", () => {
    const out = scaleABFromReal(
      realRev,
      realRev,
      realRev.drinkRevenue,
      realRev.foodRevenue,
    );
    expect(out.drinkRevenue).toBeCloseTo(realRev.drinkRevenue, 2);
    expect(out.foodRevenue).toBeCloseTo(realRev.foodRevenue, 2);
  });

  it("Sem público real → fallback aos valores recebidos", () => {
    const out = scaleABFromReal(
      fcRevSeed,
      { ...realRev, attendanceQty: 0, attendanceCourtesyQty: 0 },
      0,
      0,
    );
    expect(out.drinkRevenue).toBe(fcRevSeed.drinkRevenue);
    expect(out.foodRevenue).toBe(fcRevSeed.foodRevenue);
  });

  it("BE/Forecast NÃO devem ficar iguais ao Real quando o público muda", () => {
    const out = scaleABFromReal(
      fcRevSeed,
      realRev,
      realRev.drinkRevenue,
      realRev.foodRevenue,
    );
    expect(out.drinkRevenue + out.foodRevenue).toBeGreaterThan(
      realRev.drinkRevenue + realRev.foodRevenue,
    );
  });
});

describe("scaleABCostFromReal — escalamento de custo A&B", () => {
  it("Custo escala proporcionalmente ao público", () => {
    const cost = scaleABCostFromReal(50000, realRev, fcRevSeed);
    expect(cost).toBeCloseTo(50000 * (21881 / 17215), 2);
  });

  it("Custo zero (terceirização) mantém-se 0", () => {
    const cost = scaleABCostFromReal(0, realRev, fcRevSeed);
    expect(cost).toBe(0);
  });
});
