import { describe, it, expect } from "vitest";
import { computeRealCacheResults } from "@/lib/real-cache-calc";
import { computeCacheTabAmount } from "@/lib/cache-tab-total";
import { groupEventsForCacheSelector, resolveReportBlocks, buildArtistCacheReport, formatEventDate } from "@/lib/cache-report";

const events = [
  { id: "T", name: "Turnê SM", date: "2026-03-19", parent_event_id: null }, // multi_day: nunca se usa event_type
  { id: "P", name: "SM - Porto", date: "2026-10-03", parent_event_id: "T" },
  { id: "L", name: "SM - Lisboa", date: "2026-10-02", parent_event_id: "T" },
  { id: "S", name: "Solto", date: "2026-05-01", parent_event_id: null },
];

describe("relatório Cachê do Artista — seletor", () => {
  it("agrupa cidades por parent_event_id, ordenadas por data", () => {
    const o = groupEventsForCacheSelector(events, { L: "Lisboa", P: "Porto" });
    expect(o.map((x) => x.value)).toEqual(["tour:T", "L", "P", "S"]);
    expect(o[0].label).toBe("Turnê SM — todas as cidades");
    expect(o[1]).toMatchObject({ kind: "city", indent: true, label: "SM - Lisboa — 02/10/2026 · Lisboa" });
    expect(o[3]).toMatchObject({ kind: "single", label: "Solto — 01/05/2026" });
  });
  it("data sem fuso: 2026-10-02 → 02/10/2026", () => {
    expect(formatEventDate("2026-10-02")).toBe("02/10/2026");
    expect(formatEventDate("2026-10-03T00:00:00+00:00")).toBe("03/10/2026");
  });
});

describe("relatório — âmbito D-ERP265", () => {
  it("cidade com cachê no Master usa a configuração do Master", () => {
    const r = resolveReportBlocks({ selection: { kind: "city", eventId: "L" }, events, configCounts: { T: 1 } });
    expect(r.scope).toBe("master");
    expect(r.blocks).toEqual([{ holderId: "T", childIds: ["L", "P"], onlyCityId: "L" }]);
  });
  it("turnê com cachê nos subeventos → um bloco por cidade", () => {
    const r = resolveReportBlocks({ selection: { kind: "tour", eventId: "T" }, events, configCounts: { L: 1 } });
    expect(r.scope).toBe("children");
    expect(r.blocks.map((b) => b.holderId)).toEqual(["L", "P"]);
  });
  it("turnê com cachê no Master → bloco único com as cidades", () => {
    const r = resolveReportBlocks({ selection: { kind: "tour", eventId: "T" }, events, configCounts: { T: 1 } });
    expect(r.blocks).toEqual([{ holderId: "T", childIds: ["L", "P"] }]);
  });
});

describe("relatório — igualdade com a aba Cachê", () => {
  const config = { id: "C", artist_name: "X", cache_type: "variable", percentage: 40, minimum_guaranteed: 4000, tiers: [] };
  const city = (net: number, ded: number) => computeRealCacheResults({
    configs: [config], deductions: [{ cache_config_id: "C", category_id: "K" }], categoryMap: new Map(), expenses: [],
    sources: [{ forecasts: [{ type: "expense", category_id: "K", amount: ded, iva_rate: 0, status: "approved" }], expenses: [], weight: 1 }],
    revenue: { net, gross: net * 1.06 }, occupancyPct: 50,
  });
  const resultsByCity = { L: city(39042.45, 0), P: city(19489.62, 15000) };
  const settlements = [{ cache_config_id: "C", event_id: "P", adjusted_amount: 5000.5 }];
  const extras = [{ cache_config_id: "C", event_id: "T", amount: 100 }, { cache_config_id: "C", event_id: "L", amount: 50 }];

  it("turnê: bruto = computeCacheTabAmount ao cêntimo; Σ cidades; líquido = bruto − extras", () => {
    const rep = buildArtistCacheReport({ config, spec: { holderId: "T", childIds: ["L", "P"] }, realResult: null, resultsByCity, citySettlements: settlements, extras });
    const tab = computeCacheTabAmount({ config, resultsByCity, childEventIds: ["L", "P"], citySettlements: settlements as any });
    expect(rep.grossTotal).toBe(tab);
    expect(rep.cities.reduce((s, c) => s + c.amount, 0)).toBeCloseTo(tab, 2);
    expect(rep.cities.find((c) => c.cityId === "P")!.amount).toBe(5000.5);
    expect(rep.netTotal).toBeCloseTo(tab - 150, 2);
  });
  it("cidade isolada = valor dessa cidade na aba", () => {
    const rep = buildArtistCacheReport({ config, spec: { holderId: "T", childIds: ["L", "P"], onlyCityId: "L" }, realResult: null, resultsByCity, citySettlements: settlements, extras });
    expect(rep.cities.map((c) => c.cityId)).toEqual(["L"]);
    expect(rep.grossTotal).toBe(resultsByCity.L[0].finalAmount);
    expect(rep.extrasTotal).toBe(50);
  });
  it("evento simples = computeCacheTabAmount com o resultado real", () => {
    const real = city(10000, 0)[0];
    const rep = buildArtistCacheReport({ config, spec: { holderId: "S", childIds: [] }, realResult: real, resultsByCity: {}, citySettlements: [], extras: [] });
    expect(rep.grossTotal).toBe(computeCacheTabAmount({ config, realResult: real }));
  });
});

import { tierReferenceRows, capacityRevenueByEvent } from "@/lib/cache-report";
describe("relatório — escalões com receita máxima da sala", () => {
  const cfg = { cache_type: "variable", cache_revenue_basis: "net", tiers: [{ occupancy_threshold: 85, percentage: 45 }, { occupancy_threshold: 70, percentage: 40 }] };
  it("receita máxima = Σ lotes × preço por evento (s/ IVA)", () => {
    const cap = capacityRevenueByEvent([{ id: "z", event_id: "L" }], [{ zone_id: "z", quantity: 100, price: 106, iva_rate: 6 }]);
    expect(cap.L.gross).toBe(10600);
    expect(cap.L.net).toBeCloseTo(10000, 6);
  });
  it("cada escalão mostra a receita equivalente e marca o aplicado", () => {
    const rows = tierReferenceRows(cfg, { gross: 10600, net: 10000 }, 40);
    const n = (x: string[]) => x.map((v) => v.replace(/\s/g, " "));
    expect(n(rows[0])[1]).toBe("10.000,00 €");
    expect(n(rows[1])).toEqual(["  ≥ 70% de ocupação (receita ≥ 7.000,00 €)", "40% · aplicado"]);
    expect(n(rows[2])).toEqual(["  ≥ 85% de ocupação (receita ≥ 8.500,00 €)", "45%"]);
  });
  it("sem escalões não acrescenta nada", () => expect(tierReferenceRows({ cache_type: "variable", tiers: [] }, null, 40)).toEqual([]));
});

describe("relatório — escalões por bilhetes / bilheteira / ambos", () => {
  const cfg = { cache_type: "variable", cache_revenue_basis: "net", tiers: [{ occupancy_threshold: 70, percentage: 40 }] };
  const cap = { gross: 10600, net: 10000, seats: 1000, sold: 694 };
  const n = (r: string[][]) => r.map((x) => x.map((v) => v.replace(/\s/g, " ")));
  it("bilhetes: lotação e limiar em bilhetes, sem receita", () => {
    const rows = n(tierReferenceRows(cfg, cap, 40, "tickets", 6500));
    expect(rows[0][1]).toBe("1.000");
    expect(rows.at(-1)).toEqual(["  ≥ 70% de ocupação (≥ 700 bilhetes)", "40% · aplicado"]);
    expect(rows.some((r) => r[0].includes("receita"))).toBe(false);
  });
  it("ambos: mostra os dois e marca o atingido pela receita", () => {
    const rows = n(tierReferenceRows(cfg, cap, 40, "both", 7200));
    expect(rows.at(-1)).toEqual(["  ≥ 70% de ocupação (≥ 700 bilhetes · receita ≥ 7.000,00 €)", "40% · aplicado · atingido pela receita"]);
  });
});
