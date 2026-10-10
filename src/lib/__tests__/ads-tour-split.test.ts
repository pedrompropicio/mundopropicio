import { describe, it, expect } from "vitest";
import { classifyAdset, suggestTourSplit, splitSumMatches } from "@/lib/ads-tour-split";

const master = { id: "M", name: "Turnê SM" };
const cities = [
  { id: "L", name: "SM - Lisboa", city: "Lisboa" },
  { id: "P", name: "SM - Porto", city: "Porto" },
];

describe("ads-tour-split (#293)", () => {
  it("classifica pela geografia do nome do conjunto", () => {
    expect(classifyAdset("01. [IG] [Lisboa 80Km] [M - 25a44]", cities)).toBe("L");
    expect(classifyAdset("00. [IG] [Porto 40Km] - VV 50%", cities)).toBe("P");
    expect(classifyAdset("01. [IG] [Portugal] [M - 25a44]", cities)).toBeNull();
    expect(classifyAdset("[Lisboa + Porto] Advantage", cities)).toBeNull();
    expect(classifyAdset("Remarketing geral", cities)).toBeNull();
  });

  it("reparte na proporção e fecha ao cêntimo com o resto na maior", () => {
    const parts = suggestTourSplit(100, master, cities, [
      { adset_name: "[Lisboa]", spend: 1 },
      { adset_name: "[Porto]", spend: 1 },
      { adset_name: "[Portugal]", spend: 1 },
    ]);
    expect(parts.map((p) => p.amount).sort()).toEqual([33.33, 33.33, 33.34]);
    expect(splitSumMatches(parts, 100)).toBe(true);
  });

  it("conjuntos sem geografia vão ao Master; sem gasto tudo no Master", () => {
    const a = suggestTourSplit(10, master, cities, [{ adset_name: "Sem cidade", spend: 5 }]);
    expect(a.find((p) => p.event_id === "M")!.amount).toBe(10);
    const b = suggestTourSplit(10, master, cities, []);
    expect(b.find((p) => p.event_id === "M")!.amount).toBe(10);
    expect(b.filter((p) => p.event_id !== "M").every((p) => p.amount === 0)).toBe(true);
  });

  it("caso real SM 06/2026: 1.067,24 sobre 479,95 / 319,32 / 267,97", () => {
    const parts = suggestTourSplit(1067.24, master, cities, [
      { adset_name: "01. [IG] [Lisboa 80Km]", spend: 479.95 },
      { adset_name: "01. [IG] [Porto 80Km]", spend: 319.32 },
      { adset_name: "01. [IG] [Portugal]", spend: 267.97 },
    ]);
    expect(splitSumMatches(parts, 1067.24)).toBe(true);
    expect(parts.find((p) => p.event_id === "L")!.amount).toBeCloseTo(479.95, 1);
  });
});
