import { describe, expect, it } from "vitest";
import { distributeInstallmentOriginal as split, installmentOriginals } from "../installment-original";

describe("#471 exact informed originals", () => {
  it.each([
    ["100.02", [1, 1, 1], [33.34, 33.34, 33.34]],
    ["100.01", [1, 1, 1], [33.34, 33.34, 33.33]],
    ["100.01", [1, 2, 3], [16.67, 33.34, 50]],
    ["0.01", [1, 1, 1, 1], [0.01, 0, 0, 0]],
    ["0", [0, 0], [0, 0]], ["0", [1, 2], [0, 0]],
    ["100.02", [6.8089], [100.02]],
    ["1.00", [0, 1, 0], [0, 1, 0]],
  ])("allocates %s by %j", (original, bases, expected) => {
    const actual = split(original as string, bases as number[]);
    expect(actual).toEqual(expected);
    expect(actual.reduce((s, n) => s + Math.round(n * 100), 0)).toBe(Math.round(Number(original) * 100));
    expect(actual.every((n) => n >= 0)).toBe(true);
  });
  it.each([undefined, null, "", " ", "1.001", "1.000", "NaN", "Infinity", NaN, Infinity, "-1", "900719925474099.99", "90071992547409.91"])("rejects original %s", (original) => {
    expect(() => split(original, [1])).toThrow();
  });
  it.each([[], [0, 0], [-1, 2], [NaN], [Infinity], [1.00001], [Number.MAX_SAFE_INTEGER], [900719925474, 900719925474]].map(bases => ({ bases })))("rejects invalid weights $bases", ({ bases }) => {
    expect(() => split("1", bases)).toThrow();
  });
  it.each(["EUR", "BRL", "USD", "GBP"])("supports %s", (currency) => {
    expect(installmentOriginals(currency, "100.01", "0.17", [1, 1, 1])).toEqual(currency === "EUR" ? [null, null, null] : [33.34, 33.34, 33.33]);
  });
  it("preserves the EUR optional-null contract without FX validation", () => {
    expect(installmentOriginals("EUR", "", "", [6.8089])).toEqual([null]);
  });
});


describe("#498 P2f native currency originals", () => {
  it.each(["BRL", "EUR", "USD", "GBP"])("returns null originals for native %s without FX", currency => {
    expect(installmentOriginals(currency, "", "", [6.8089, 10], currency)).toEqual([null, null]);
  });
  it.each(["BRL", "USD", "GBP"])("still requires FX for foreign %s under the EUR default", currency => {
    expect(() => installmentOriginals(currency, "100", "", [1, 1])).toThrow("câmbio");
  });
});
