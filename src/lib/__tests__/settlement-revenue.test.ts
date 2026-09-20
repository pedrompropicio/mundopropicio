import { describe, it, expect } from "vitest";
import { computeSettlementRevenue } from "../settlement-revenue";
import { computeEventSettlementTotals } from "../event-settlement-inputs";

const tx = (code: string, amount: number, iva = 0) => ({
  id: `tx-${code}-${amount}`,
  type: "income",
  status: "paid",
  amount,
  iva_rate: iva,
  description: "TX",
  account_categories: { code, name: code },
});

const bp = (code: string, amount: number, iva = 0) => ({
  id: `bp-${code}-${amount}`,
  type: "income",
  status: "approved",
  amount,
  iva_rate: iva,
  description: "BP",
  account_categories: { code, name: code },
});

describe("computeSettlementRevenue (#226)", () => {
  it("(a) sem bilheteira real nem transações, a linha de BP alimenta", () => {
    const r = computeSettlementRevenue({ incomeForecasts: [bp("1.1.01", 318102.83)] });
    expect(r.revenueNet).toBeCloseTo(318102.83, 2);
    expect(r.buckets.bilheteira.source).toBe("bp");
    expect(r.bpBucketsUsed).toEqual(["bilheteira"]);
  });

  it("(b) com ticket_sales, o BP de bilheteira é ignorado", () => {
    const r = computeSettlementRevenue({
      ticketSales: [{ gross: 100, net: 100 }],
      incomeForecasts: [bp("1.1.01", 318102.83)],
    });
    expect(r.buckets.bilheteira.net).toBe(100);
    expect(r.buckets.bilheteira.source).toBe("real");
    expect(r.revenueNet).toBe(100);
    expect(r.bpBucketsUsed).toEqual([]);
  });

  it("(c) real só na bilheteira → patrocínio vem do BP", () => {
    const r = computeSettlementRevenue({
      ticketSales: [{ gross: 100, net: 100 }],
      incomeForecasts: [bp("1.2.01", 31000)],
    });
    expect(r.buckets.patrocinio.net).toBe(31000);
    expect(r.buckets.patrocinio.source).toBe("bp");
    expect(r.revenueNet).toBe(31100);
  });

  it("(d) transação de patrocínio substitui a linha de BP do mesmo bucket", () => {
    const r = computeSettlementRevenue({
      incomeTransactions: [tx("1.2.01", 50)],
      incomeForecasts: [bp("1.2.01", 31000)],
    });
    expect(r.buckets.patrocinio.net).toBe(50);
    expect(r.buckets.patrocinio.source).toBe("real");
    expect(r.revenueNet).toBe(50);
    expect(r.bpLinesUsed).toEqual([]);
  });

  it("linhas de BP inelegíveis nunca alimentam", () => {
    const r = computeSettlementRevenue({
      incomeForecasts: [
        { ...bp("1.1.01", 1000), is_overhead: true },
        { ...bp("1.1.01", 2000), exclude_from_result: true },
        { ...bp("1.1.01", 3000), is_transitory: true },
        { ...bp("1.1.01", 4000), status: "pending" },
      ],
    });
    expect(r.revenueNet).toBe(0);
  });
});

describe("computeEventSettlementTotals (#226) — FestVybbe reduzido", () => {
  it("evento só com BP: receita do BP e despesa c/IVA", () => {
    const totals = computeEventSettlementTotals({
      events: [{ id: "e1", parent_event_id: null }],
      transactions: [],
      forecasts: [
        bp("1.1.01", 318102.83),
        {
          id: "bp-exp",
          event_id: "e1",
          type: "expense",
          status: "approved",
          amount: 100000,
          iva_rate: 23,
          account_categories: { code: "2.1.01", name: "Produção" },
        },
      ],
      ticketSales: [],
      basis: { includeOverhead: true, expenseSource: "committed" },
    });
    expect(totals.revenueNet).toBeCloseTo(318102.83, 2);
    expect(totals.expensesNet).toBeCloseTo(100000, 2);
    expect(totals.expensesGross).toBeCloseTo(123000, 2);
  });
});
