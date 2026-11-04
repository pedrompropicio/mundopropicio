import { describe, expect, it } from "vitest";
import { computeEventCostOnBasis, type EventCostMode } from "@/lib/event-cost-basis";
import { computeEventSettlementTotals, type SettlementTotalsInput } from "@/lib/event-settlement-inputs";
import { computeContractBasisResult } from "@/lib/event-contract-result";

// One synthetic event, without tour inheritance, master quotas or cache extras.
// Both consumers receive the same unfiltered transactions (including pending).
const forecast = {
  event_id: "ev1", type: "expense", status: "approved", version_id: null,
  is_transitory: false, is_overhead: false, exclude_from_result: false,
};
const transaction = {
  event_id: "ev1", type: "expense", is_transitory: false,
  exclude_from_result: false, reversed_at: null, is_hidden: false,
};
const fixture = {
  events: [{ id: "ev1", parent_event_id: null, event_type: "simple" }],
  forecasts: [
    { ...forecast, id: "bp-a", category_id: "A", amount: 1000, iva_rate: 23 },
    { ...forecast, id: "bp-b", category_id: "B", amount: 500, iva_rate: 0 },
    { ...forecast, id: "bp-oh", category_id: "OH", amount: 200, iva_rate: 23,
      is_overhead: true, exclude_from_result: true },
  ],
  transactions: [
    { ...transaction, id: "tx-a", category_id: "A", forecast_id: "bp-a", amount: 1200, iva_rate: 23, status: "paid" },
    { ...transaction, id: "tx-b", category_id: "B", forecast_id: "bp-b", amount: 300, iva_rate: 0, status: "approved" },
    { ...transaction, id: "tx-c", category_id: "C", forecast_id: null, amount: 80.4, iva_rate: 0, status: "paid" },
    { ...transaction, id: "tx-pending", category_id: "A", forecast_id: "bp-a", amount: 999, iva_rate: 23, status: "pending" },
  ],
  ticketSales: [{ gross: 3075, net: 2500 }],
} satisfies Omit<SettlementTotalsInput, "basis">;

function cardTotal(mode: EventCostMode, includeOverhead: boolean, withVat: boolean) {
  // Same per-event sum as useEventFinancialCardData.costForMode, using the
  // production helper, never a second implementation of the cost formula.
  return fixture.events.reduce((sum, event) => sum + computeEventCostOnBasis({
    forecasts: fixture.forecasts.filter((f) => f.event_id === event.id),
    transactions: fixture.transactions.filter((t) => t.event_id === event.id),
    mode, includeOverhead, withVat,
  }).total, 0);
}

describe("#223 — invariante card de Custos / Encontro de Contas (mesmo motor)", () => {
  it.each([
    ["committed", true, false, 1980.4],
    ["committed", true, true, 2302.4],
    ["committed", false, false, 1780.4],
    ["committed", false, true, 2056.4],
    ["realized", false, false, 1580.4],
    ["realized", false, true, 1856.4],
  ] as const)("%s, OH=%s, c/IVA=%s: card = Encontro a meio cêntimo", (mode, includeOverhead, withVat, expected) => {
    const totals = computeEventSettlementTotals({ ...fixture, basis: { expenseSource: mode, includeOverhead } });
    const card = cardTotal(mode, includeOverhead, withVat);
    const encontro = withVat ? totals.expensesGross : totals.expensesNet;
    expect(Math.abs(card - encontro)).toBeLessThanOrEqual(0.005);
    expect(card).toBeCloseTo(expected, 2);
    expect(encontro).toBeCloseTo(expected, 2);
    if (mode === "committed") {
      const cost = computeEventCostOnBasis({ ...fixture, mode, includeOverhead, withVat });
      expect(cost.excess).toBeCloseTo(withVat ? 326.4 : 280.4, 2);
    }
  });

  it("calcula a base do contrato com os totais committed + OH do Encontro", () => {
    const totals = computeEventSettlementTotals({
      ...fixture, basis: { expenseSource: "committed", includeOverhead: true },
    });
    expect(totals.revenueNet).toBe(2500);
    expect(totals.revenueGross).toBe(3075);
    expect(computeContractBasisResult(totals, "net_result")).toBeCloseTo(519.6, 2);
    expect(computeContractBasisResult(totals, "net_result_gross_expenses")).toBeCloseTo(197.6, 2);
  });

  it("divergência conhecida — decisão do Pedro (#223)", () => {
    // Realizado + OH: the card ignores overhead; the Encontro includes it.
    // Record the measured difference without changing either production helper.
    const totals = computeEventSettlementTotals({
      ...fixture, basis: { expenseSource: "realized", includeOverhead: true },
    });
    expect(totals.expensesNet).toBeCloseTo(1780.4, 2);
    expect(totals.expensesGross).toBeCloseTo(2102.4, 2);
    for (const [withVat, encontro, expectedCard, overhead] of [
      [false, totals.expensesNet, 1580.4, 200],
      [true, totals.expensesGross, 1856.4, 246],
    ] as const) {
      const card = cardTotal("realized", true, withVat);
      expect(card).toBeCloseTo(expectedCard, 2);
      expect(encontro - card).toBeCloseTo(overhead, 2);
    }
  });
});
