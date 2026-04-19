import { describe, it, expect } from "vitest";
import {
  calcIvaAmount,
  calcTotalWithIva,
  checkIvaConsistency,
  snapToStandardRate,
  inferIvaRateFromTotal,
} from "../iva";

describe("calcIvaAmount", () => {
  it("aplica regra do cêntimo (Art.º 18 CIVA)", () => {
    expect(calcIvaAmount(120, 23)).toBe(27.6);
    expect(calcIvaAmount(100, 23)).toBe(23);
    expect(calcIvaAmount(33.33, 23)).toBe(7.67); // 7.6659 → 7.67
  });
  it("retorna 0 para taxa 0 ou base 0", () => {
    expect(calcIvaAmount(100, 0)).toBe(0);
    expect(calcIvaAmount(0, 23)).toBe(0);
  });
});

describe("calcTotalWithIva", () => {
  it("soma base e IVA arredondados ao cêntimo", () => {
    expect(calcTotalWithIva(120, 23)).toBe(147.6);
    expect(calcTotalWithIva(100, 6)).toBe(106);
  });
});

describe("checkIvaConsistency", () => {
  it("aceita IVA correto", () => {
    expect(checkIvaConsistency(120, 23, 27.6).ok).toBe(true);
  });
  it("rejeita IVA incorreto fora da tolerância", () => {
    const r = checkIvaConsistency(120, 23, 27.2);
    expect(r.ok).toBe(false);
    expect(r.expectedIva).toBe(27.6);
    expect(r.diff).toBeCloseTo(-0.4, 2);
  });
  it("aceita pequenos desvios dentro da tolerância", () => {
    expect(checkIvaConsistency(120, 23, 27.61, 0.01).ok).toBe(true);
    expect(checkIvaConsistency(120, 23, 27.62, 0.01).ok).toBe(false);
  });
});

describe("snapToStandardRate", () => {
  it("escolhe a taxa portuguesa mais próxima", () => {
    expect(snapToStandardRate(22.5)).toBe(23);
    expect(snapToStandardRate(7)).toBe(6);
    expect(snapToStandardRate(11)).toBe(13);
    expect(snapToStandardRate(0.4)).toBe(0);
  });
});

describe("inferIvaRateFromTotal", () => {
  it("infere taxa a partir de base e total", () => {
    expect(inferIvaRateFromTotal(100, 123)).toBeCloseTo(23, 2);
    expect(inferIvaRateFromTotal(100, 106)).toBeCloseTo(6, 2);
  });
});
