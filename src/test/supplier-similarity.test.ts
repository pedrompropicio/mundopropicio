import { describe, it, expect } from "vitest";
import { isSimilarSupplierName, normalizeSupplierName, normalizeNif, trigramSimilarity } from "@/lib/supplier-similarity";

describe("supplier similarity (D-ERP199)", () => {
  it.each([
    ["Pixel Light", "PIXEL LIGHT UNIPESSOAL LDA"],
    ["Expert Numbers", "Expert Numbers Lda"],
    ["Cloudscape", "Çloudscape"],
    ["Elos Estrondodos", "Elos Estrondosos"],
  ])("%s ≈ %s", (a, b) => expect(isSimilarSupplierName(a, b)).toBe(true));

  it("Bolt não é Volt Lisboa", () => expect(isSimilarSupplierName("Bolt", "Volt Lisboa")).toBe(false));

  it("normaliza como a base", () => {
    expect(normalizeSupplierName("PIXEL LIGHT UNIPESSOAL LDA")).toBe("pixel light");
    expect(normalizeSupplierName("ACME S.A.")).toBe("acme");
    expect(trigramSimilarity("elos estrondodos", "elos estrondosos")).toBeCloseTo(0.764706, 5);
    expect(trigramSimilarity("bolt", "volt lisboa")).toBeCloseTo(0.133333, 5);
    expect(normalizeNif("PT 123.456.789")).toBe("PT123456789");
  });
});

describe("normalizeNif — prefixo do país (D-ERP199 adenda)", () => {
  it.each([
    ["PT123456789", "123456789"],
    ["pt 123.456.789", "123456789"],
    ["123456789", "123456789"],
    ["ESB12345678", "ESB12345678"],
    ["", ""],
  ])("%s → %s", (a, b) => expect(normalizeNif(a)).toBe(b));
});
