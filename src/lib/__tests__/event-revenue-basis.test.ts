/**
 * #225 — receita de patrocínio do BP não pode ser descartada sem sintética.
 * Testa o núcleo puro `computeRevenueBasisFromRows` (sem queries).
 */
import { describe, expect, it } from "vitest";
import { computeRevenueBasisFromRows } from "@/lib/event-revenue-basis";
import type { SponsorshipSyntheticResult } from "@/lib/bp-sponsorship-synthetic";

const EMPTY_SPONSORSHIP: SponsorshipSyntheticResult = {
  hasTargets: false,
  closedAt: null,
  baselineNet: null,
  currentNet: null,
  realNet: 0,
  currentGross: null,
  realGross: 0,
  segments: [],
  excludedForecastIds: [],
};

const bpLineSponsor = {
  id: "f-1",
  amount: 31000,
  iva_rate: 0,
  status: "approved",
  is_transitory: false,
  exclude_from_result: false,
  is_overhead: false,
  account_categories: { code: "1.2.01" },
};

const baseRows = {
  ticket: { net: 0, gross: 0 },
  incomeTx: [] as any[],
  incomeForecasts: [bpLineSponsor] as any[],
  ticketForecast: null,
  abForecastNet: null,
};

describe("computeRevenueBasisFromRows — bucket patrocínio (#225)", () => {
  it("sem verbas nem cards (sponsorship EMPTY): a linha 1.2.01 aprovada alimenta o previsto e o committed", () => {
    const r = computeRevenueBasisFromRows({ ...baseRows, sponsorship: EMPTY_SPONSORSHIP });
    expect(r.currentForecast.buckets.patrocinio).not.toBeNull();
    expect(r.currentForecast.buckets.patrocinio!.net).toBe(31000);
    expect(r.committed.buckets.patrocinio.net).toBe(31000);
    expect(r.committed.total.net).toBe(31000);
  });

  it("com verbas (hasTargets, currentNet 50000): a sintética substitui, a linha de BP não soma", () => {
    const r = computeRevenueBasisFromRows({
      ...baseRows,
      sponsorship: { ...EMPTY_SPONSORSHIP, hasTargets: true, currentNet: 50000, currentGross: 50000 },
    });
    expect(r.currentForecast.buckets.patrocinio!.net).toBe(50000);
    expect(r.committed.buckets.patrocinio.net).toBe(50000);
  });

  it("sem verbas mas com real (realNet 31000) e a linha em excludedForecastIds: bucket 31000 sem duplicar", () => {
    const r = computeRevenueBasisFromRows({
      ...baseRows,
      sponsorship: {
        ...EMPTY_SPONSORSHIP,
        realNet: 31000,
        realGross: 31000,
        excludedForecastIds: ["f-1"],
      },
    });
    expect(r.currentForecast.buckets.patrocinio!.net).toBe(31000);
    expect(r.committed.buckets.patrocinio.net).toBe(31000);
  });
});
