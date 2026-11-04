import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeEventCardCost } from "@/lib/event-card-cost";
import { type EventCostMode } from "@/lib/event-cost-basis";
import { computeEventSettlementTotals, type SettlementTotalsInput } from "@/lib/event-settlement-inputs";
import { computeContractBasisResult } from "@/lib/event-contract-result";
import { useEventFinancialCardData, type UseEventFinancialCardDataArgs } from "@/hooks/useEventFinancialCardData";

const reads = vi.hoisted(() => ({
  forecasts: [] as any[], transactions: [] as any[],
  masterForecasts: [] as any[], masterTransactions: [] as any[],
}));

// Only fixture reads: no queryFn or MP service can execute.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: ({
    "efc-tx": reads.transactions,
    "efc-forecasts": reads.forecasts,
    "efc-master-tx": reads.masterTransactions,
    "efc-master-forecasts": reads.masterForecasts,
  } as Record<string, any[]>)[queryKey[0]] }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: () => { throw new Error("#223: serviço MP proibido neste teste"); } }),
}));
vi.mock("@/hooks/useEventRevenueBasis", () => ({ useEventRevenueBasis: () => ({ data: undefined }) }));
vi.mock("@/hooks/useEventRootSettlements", () => ({ useEventRootSettlements: () => ({ data: undefined }) }));
vi.mock("@/hooks/useEbitdaClassMap", () => ({ useEbitdaClassMap: () => ({ data: undefined }) }));

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
  return computeEventCardCost({
    eventId: "ev1", forecasts: fixture.forecasts, transactions: fixture.transactions,
    mode, includeOverhead, withVat,
  }).total;
}

beforeEach(() => {
  reads.forecasts = fixture.forecasts;
  reads.transactions = fixture.transactions;
  reads.masterForecasts = [];
  reads.masterTransactions = [];
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#223: rede proibida neste teste"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("#223 — invariante card de Custos / Encontro de Contas (helper do card)", () => {
  it.each([
    ["committed", true, false, 1980.4],
    ["committed", true, true, 2302.4],
    ["committed", false, false, 1780.4],
    ["committed", false, true, 2056.4],
    ["realized", false, false, 1580.4],
    ["realized", false, true, 1856.4],
    ["realized", true, false, 1780.4],
    ["realized", true, true, 2102.4],
  ] as const)("%s, OH=%s, c/IVA=%s: card = Encontro a meio cêntimo", (mode, includeOverhead, withVat, expected) => {
    const totals = computeEventSettlementTotals({ ...fixture, basis: { expenseSource: mode, includeOverhead } });
    const card = cardTotal(mode, includeOverhead, withVat);
    const encontro = withVat ? totals.expensesGross : totals.expensesNet;
    expect(Math.abs(card - encontro)).toBeLessThanOrEqual(0.005);
    expect(card).toBeCloseTo(expected, 2);
    expect(encontro).toBeCloseTo(expected, 2);
    if (mode === "committed") {
      const cost = computeEventCardCost({ ...fixture, eventId: "ev1", mode, includeOverhead, withVat });
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

  it("realized + OH: card = Encontro (#223, decisão A)", () => {
    const totals = computeEventSettlementTotals({
      ...fixture, basis: { expenseSource: "realized", includeOverhead: true },
    });
    expect(totals.expensesNet).toBeCloseTo(1780.4, 2);
    expect(totals.expensesGross).toBeCloseTo(2102.4, 2);
    for (const [withVat, encontro, expectedCard] of [
      [false, totals.expensesNet, 1780.4],
      [true, totals.expensesGross, 2102.4],
    ] as const) {
      const card = cardTotal("realized", true, withVat);
      expect(card).toBeCloseTo(expectedCard, 2);
      expect(Math.abs(encontro - card)).toBeLessThanOrEqual(0.005);
    }
  });
});

describe("#223 — perímetro e subtotais do hook real", () => {
  function useCard(overrides: Partial<UseEventFinancialCardDataArgs> = {}) {
    return useEventFinancialCardData({
      eventId: "ev1", eventIds: ["ev1"], kind: "expense", mode: "realized",
      ...overrides,
    });
  }

  it.each([
    ["realized", false, 1580.4, 1856.4],
    ["realized", true, 1780.4, 2102.4],
    ["committed", false, 1780.4, 2056.4],
    ["committed", true, 1980.4, 2302.4],
    ["forecast", false, 1580.4, 1810.4],
    ["forecast", true, 1780.4, 2056.4],
  ] as const)("%s, OH=%s: preserva total e perímetro nas duas bases", (mode, includeOverhead, net, gross) => {
    for (const withVat of [false, true]) {
      const { result, unmount } = renderHook(() => useCard({ mode, includeOverhead, withVat }));
      expect(result.current.displayValue).toBeCloseTo(withVat ? gross : net, 2);
      expect(result.current.perimeter?.net).toBeCloseTo(net, 2);
      expect(result.current.perimeter?.gross).toBeCloseTo(gross, 2);
      if (mode === "realized") {
        expect(result.current.subtotals).toEqual([
          { label: "Pago", value: withVat ? 1556.4 : 1280.4 },
          { label: "Comprometido (próprio)", value: 300 },
        ]);
        expect(result.current.meta?.overhead).toBe(includeOverhead ? withVat ? 246 : 200 : 0);
      }
      unmount();
    }
  });

  it("recalcula o overhead ao mudar os toggles sem alterar os subtotais", () => {
    const { result, rerender } = renderHook(
      ({ includeOverhead, withVat }) => useCard({ includeOverhead, withVat }),
      { initialProps: { includeOverhead: false, withVat: false } },
    );
    const originalSubtotals = result.current.subtotals;
    rerender({ includeOverhead: true, withVat: false });
    expect(result.current.displayValue).toBeCloseTo(1780.4, 2);
    expect(result.current.subtotals).toEqual(originalSubtotals);
    rerender({ includeOverhead: true, withVat: true });
    expect(result.current.displayValue).toBeCloseTo(2102.4, 2);
    expect(result.current.meta?.overhead).toBe(246);
    rerender({ includeOverhead: false, withVat: false });
    expect(result.current.displayValue).toBeCloseTo(1580.4, 2);
    expect(result.current.perimeter).toEqual({ net: 1580.4, gross: 1856.4 });
    expect(result.current.subtotals).toEqual(originalSubtotals);
    expect(result.current.meta?.overhead).toBe(0);
  });

  it.each([false, true])("preserva cachê e quota do Master existente, c/IVA=%s", (withVat) => {
    reads.masterTransactions = [{ ...transaction, event_id: "master", amount: 400, iva_rate: 23, status: "paid" }];
    reads.masterForecasts = [{ ...forecast, event_id: "master", amount: 600, iva_rate: 23, is_overhead: true }];
    const { result } = renderHook(() => useCard({
      includeOverhead: true, withVat, cacheImpact: 17,
      masterQuota: { masterEventId: "master", siblingCount: 2 },
    }));
    expect(result.current.displayValue).toBeCloseTo(withVat ? 2365.4 : 1997.4, 2);
    expect(result.current.perimeter?.net).toBeCloseTo(1997.4, 2);
    expect(result.current.perimeter?.gross).toBeCloseTo(2365.4, 2);
    expect(result.current.meta).toEqual({ overhead: withVat ? 246 : 200, masterQuota: withVat ? 246 : 200, cacheAdded: 17 });
  });
});

describe("#223 — seleção de overhead e soma por evento", () => {
  it.each([
    ["approved", false, null, true, 200],
    ["approved", false, undefined, false, 200],
    ["pending", false, null, true, 0],
    ["rejected", false, null, true, 0],
    ["approved", true, null, true, 0],
    ["approved", false, "snapshot", true, 0],
  ] as const)("OH %s, transitório=%s, versão=%s, excluído=%s: %s", (status, is_transitory, version_id, exclude_from_result, expected) => {
    const forecasts = [{ ...forecast, amount: 200, iva_rate: 23, is_overhead: true,
      status, is_transitory, version_id, exclude_from_result }];
    for (const withVat of [false, true]) {
      const cost = computeEventCardCost({ eventId: "ev1", forecasts, transactions: [],
        mode: "realized", includeOverhead: true, withVat });
      expect(cost.total).toBe(withVat && expected ? 246 : expected);
      expect(cost.overhead).toBe(cost.total);
    }
  });

  it("exclui IRC também do overhead realizado", () => {
    const cost = computeEventCardCost({ ...fixture, eventId: "ev1", mode: "realized",
      includeOverhead: true, withVat: true, forecasts: [{ ...fixture.forecasts[2],
        account_categories: { ebitda_class: "imposto_rendimento" } }] });
    expect(cost.total).toBeCloseTo(1856.4, 2);
    expect(cost.overhead).toBe(0);
  });

  it("arredonda IVA linha a linha como o Encontro", () => {
    const forecasts = ["oh1", "oh2"].map((id) => ({ ...fixture.forecasts[2], id, amount: 0.03 }));
    const cost = computeEventCardCost({ eventId: "ev1", forecasts, transactions: [],
      mode: "realized", includeOverhead: true, withVat: true });
    const encontro = computeEventSettlementTotals({ ...fixture, forecasts, transactions: [],
      basis: { expenseSource: "realized", includeOverhead: true } });
    expect(cost.total).toBe(0.08);
    expect(cost.total).toBe(encontro.expensesGross);
  });

  it("mantém o excesso por evento sem absorver a folga de outro evento", () => {
    const forecasts = ["ev1", "ev2"].map((event_id) => ({ ...forecast, event_id, category_id: "A", amount: 1000 }));
    const transactions = [
      { ...transaction, category_id: "A", amount: 1200, status: "paid" },
      { ...transaction, event_id: "ev2", category_id: "A", amount: 300, status: "approved" },
      { ...transaction, event_id: "ev1", type: "income", category_id: "A", amount: 9999, status: "paid" },
    ];
    const cost = computeEventCardCost({ eventId: "ev1", forecasts, transactions,
      mode: "committed", includeOverhead: false, withVat: false });
    expect(cost).toEqual({ total: 2200, overhead: 0, excess: 200, approvedCount: 2 });
  });
});
