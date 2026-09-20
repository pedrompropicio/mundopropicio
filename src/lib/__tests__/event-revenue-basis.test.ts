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

/**
 * #227 — depois do evento, as sintéticas de bilheteira e A&B são o real.
 */
describe("computeRevenueBasisFromRows — eventRealized (#227)", () => {
  const ticketFc = { net: 150, gross: 150, currentLoad: null, currentLoadOn: null, totalQty: 0 } as any;

  it("(a) antes do evento: real 100 + previsto 150 → committed bilheteira 150", () => {
    const r = computeRevenueBasisFromRows({
      ticket: { net: 100, gross: 100 },
      incomeTx: [],
      incomeForecasts: [],
      sponsorship: EMPTY_SPONSORSHIP,
      ticketForecast: ticketFc,
      eventRealized: false,
    });
    expect(r.committed.buckets.bilheteira.net).toBe(150);
  });

  it("(b) depois do evento: mesmos dados → 100", () => {
    const r = computeRevenueBasisFromRows({
      ticket: { net: 100, gross: 100 },
      incomeTx: [],
      incomeForecasts: [],
      sponsorship: EMPTY_SPONSORSHIP,
      ticketForecast: ticketFc,
      eventRealized: true,
    });
    expect(r.committed.buckets.bilheteira.net).toBe(100);
    expect(r.currentForecast.buckets.bilheteira).toBeNull();
  });

  it("(c) realizado sem ticket_sales: BP 1.1.01 alimenta, simulador ignorado", () => {
    const r = computeRevenueBasisFromRows({
      ticket: { net: 0, gross: 0 },
      incomeTx: [],
      incomeForecasts: [
        { ...bpLineSponsor, id: "f-t", amount: 318102.83, account_categories: { code: "1.1.01" } },
      ] as any[],
      sponsorship: EMPTY_SPONSORSHIP,
      ticketForecast: ticketFc,
      eventRealized: true,
    });
    expect(r.committed.buckets.bilheteira.net).toBe(318102.83);
  });

  it("(d) realizado: A&B real 10 e cenário 67.698,75 → 10", () => {
    const r = computeRevenueBasisFromRows({
      ticket: { net: 0, gross: 0 },
      incomeTx: [
        { amount: 10, iva_rate: 0, status: "paid", type: "income", account_categories: { code: "1.1.03" } },
      ] as any[],
      incomeForecasts: [],
      sponsorship: EMPTY_SPONSORSHIP,
      abForecastNet: 67698.75,
      eventRealized: true,
    });
    expect(r.committed.buckets.ab.net).toBe(10);
  });

  it("(e) patrocínio com verbas não muda com a flag", () => {
    const sp = { ...EMPTY_SPONSORSHIP, hasTargets: true, currentNet: 50000, currentGross: 50000 };
    const base = { ticket: { net: 0, gross: 0 }, incomeTx: [] as any[], incomeForecasts: [] as any[], sponsorship: sp };
    expect(computeRevenueBasisFromRows({ ...base, eventRealized: false }).committed.buckets.patrocinio.net).toBe(50000);
    expect(computeRevenueBasisFromRows({ ...base, eventRealized: true }).committed.buckets.patrocinio.net).toBe(50000);
  });
});

describe("bucket A&B — bruto próprio (#208)", () => {
  const abBpLine = {
    id: "f-ab", amount: 50000, iva_rate: 13, status: "approved",
    is_transitory: false, exclude_from_result: false, is_overhead: false,
    account_categories: { code: "1.1.03" },
  };

  it("taxa injectada: bruto = líquido × (1 + taxa)", () => {
    const r = computeRevenueBasisFromRows({
      ticket: { net: 0, gross: 0 }, incomeTx: [], incomeForecasts: [],
      sponsorship: EMPTY_SPONSORSHIP, abForecastNet: 67698.75, abForecastIvaRate: 13,
    });
    expect(r.currentForecast.buckets.ab!.net).toBeCloseTo(67698.75, 2);
    expect(r.currentForecast.buckets.ab!.gross).toBeCloseTo(67698.75 * 1.13, 2);
  });

  it("sem taxa injectada: usa a taxa das linhas de BP de A&B", () => {
    const r = computeRevenueBasisFromRows({
      ticket: { net: 0, gross: 0 }, incomeTx: [], incomeForecasts: [abBpLine] as any[],
      sponsorship: EMPTY_SPONSORSHIP, abForecastNet: 1000,
    });
    // a sintética substitui a linha de BP, mas herda a taxa dela
    expect(r.currentForecast.buckets.ab!.net).toBe(1000);
    expect(r.currentForecast.buckets.ab!.gross).toBeCloseTo(1130, 2);
  });

  it("s/IVA não muda e eventos sem A&B ficam iguais", () => {
    const semAb = computeRevenueBasisFromRows({
      ticket: { net: 0, gross: 0 }, incomeTx: [], incomeForecasts: [bpLineSponsor] as any[],
      sponsorship: EMPTY_SPONSORSHIP, abForecastNet: null,
    });
    expect(semAb.currentForecast.buckets.ab).toBeNull();
    const comAb = computeRevenueBasisFromRows({
      ticket: { net: 0, gross: 0 }, incomeTx: [], incomeForecasts: [abBpLine] as any[],
      sponsorship: EMPTY_SPONSORSHIP, abForecastNet: 2000,
    });
    expect(comAb.currentForecast.buckets.ab!.net).toBe(2000);
  });

  it("sem fonte de taxa: bruto = líquido (comportamento anterior)", () => {
    const r = computeRevenueBasisFromRows({
      ticket: { net: 0, gross: 0 }, incomeTx: [], incomeForecasts: [],
      sponsorship: EMPTY_SPONSORSHIP, abForecastNet: 500,
    });
    expect(r.currentForecast.buckets.ab!.gross).toBe(500);
  });
});
