import { describe, it, expect } from "vitest";
import {
  calcIvaAmount,
  calcTotalWithIva,
  checkIvaConsistency,
  snapToStandardRate,
  inferIvaRateFromTotal,
  getIvaRatesForCountry,
  getDefaultIvaRateForCountry,
  getIvaRatesForCountries,
  getDefaultIvaRateForCountries,
  roundCents,
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

// ---------------------------------------------------------------------------
// Espanha (21/10/4/0) — taxas pelo país da cidade do evento.
// Ver .lovable/memory/features/iva-espanha.md
// ---------------------------------------------------------------------------
describe("IVA Espanha", () => {
  it("calcula IVA às taxas espanholas", () => {
    expect(calcIvaAmount(100, 21)).toBe(21);
    expect(calcIvaAmount(100, 10)).toBe(10);
    expect(calcIvaAmount(100, 4)).toBe(4);
    expect(calcIvaAmount(4846.2, 21)).toBe(1017.7);
  });

  it("calcula total c/IVA às taxas espanholas", () => {
    expect(calcTotalWithIva(100, 21)).toBe(121);
    expect(calcTotalWithIva(33.33, 21)).toBe(40.33); // 6.9993 → 7.00
  });

  it("getIvaRatesForCountry devolve o conjunto certo (fallback PT)", () => {
    expect(getIvaRatesForCountry("Espanha")).toEqual([0, 4, 10, 21]);
    expect(getIvaRatesForCountry("Portugal")).toEqual([0, 6, 13, 23]);
    expect(getIvaRatesForCountry(null)).toEqual([0, 6, 13, 23]);
    expect(getIvaRatesForCountry("Narnia")).toEqual([0, 6, 13, 23]);
  });

  it("getDefaultIvaRateForCountry devolve a taxa normal", () => {
    expect(getDefaultIvaRateForCountry("Espanha")).toBe(21);
    expect(getDefaultIvaRateForCountry("Portugal")).toBe(23);
    expect(getDefaultIvaRateForCountry(undefined)).toBe(23);
  });

  it("snap com conjunto ES não 'corrige' 21% para 23%", () => {
    const es = getIvaRatesForCountry("Espanha");
    expect(snapToStandardRate(21, es)).toBe(21);
    expect(snapToStandardRate(20.8, es)).toBe(21);
    expect(snapToStandardRate(9.6, es)).toBe(10);
    expect(snapToStandardRate(4.2, es)).toBe(4);
    // Sem conjunto → comportamento PT inalterado
    expect(snapToStandardRate(21)).toBe(23);
  });

  it("checkIvaConsistency funciona com taxas ES", () => {
    expect(checkIvaConsistency(100, 21, 21).ok).toBe(true);
    expect(checkIvaConsistency(100, 21, 23).ok).toBe(false);
  });
});

// Turnês: master sem cidade resolve pelos países dos sub-eventos.
describe("IVA por conjunto de países (turnês)", () => {
  it("master com 1 sub em Espanha → taxas ES, default 21", () => {
    expect(getIvaRatesForCountries(["Espanha"])).toEqual([0, 4, 10, 21]);
    expect(getDefaultIvaRateForCountries(["Espanha"])).toBe(21);
  });

  it("master sem subs/cidades → PT", () => {
    expect(getIvaRatesForCountries([])).toEqual([0, 6, 13, 23]);
    expect(getIvaRatesForCountries([null, undefined])).toEqual([0, 6, 13, 23]);
    expect(getDefaultIvaRateForCountries([])).toBe(23);
  });

  it("turnê mista PT+ES → união ordenada, default 23", () => {
    expect(getIvaRatesForCountries(["Portugal", "Espanha"])).toEqual([0, 4, 6, 10, 13, 21, 23]);
    expect(getDefaultIvaRateForCountries(["Portugal", "Espanha"])).toBe(23);
  });

  it("ignora países desconhecidos", () => {
    expect(getIvaRatesForCountries(["Narnia", "Espanha"])).toEqual([0, 4, 10, 21]);
  });
});

// ---------------------------------------------------------------------------
// (g17-d) Regra ÚNICA de arredondamento ao cêntimo — motor, ERP, edge function
// e Portal usam roundCents. Nunca toFixed nem truncatura.
// ---------------------------------------------------------------------------
describe("roundCents (g17-d)", () => {
  it("arredonda .415 para cima mesmo com erro de vírgula flutuante", () => {
    // 596.133,45 × 70% = 417293.4149999999 em binário → tem de dar 417.293,42
    expect(roundCents(596133.45 * 0.7)).toBe(417293.42);
    expect(roundCents(417293.415)).toBe(417293.42);
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(2.675)).toBe(2.68);
  });

  it("arredonda simetricamente valores negativos", () => {
    expect(roundCents(-(596133.45 * 0.7))).toBe(-417293.42);
    expect(roundCents(-1.005)).toBe(-1.01);
  });

  it("mantém os números de referência da Anitta EDA 2026", () => {
    const root = 596133.45;
    const anitta = roundCents(root * 0.7);
    const society = roundCents(root - anitta);
    const lobo = roundCents(society * 0.2);
    expect(anitta).toBe(417293.42);
    expect(lobo).toBe(35768.01);
    const level3 = 547906.69;
    const ein = roundCents(level3 * 0.5);
    expect(roundCents(ein + roundCents(level3 - ein))).toBe(level3);
    expect(ein).toBe(273953.35);
  });

  it("é estável e não usa truncatura", () => {
    expect(roundCents(0)).toBe(0);
    expect(roundCents(Number.NaN)).toBe(0);
    expect(roundCents(0.004)).toBe(0);
    expect(roundCents(0.005)).toBe(0.01);
  });
});
