import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeEventCardCost } from "@/lib/event-card-cost";
import { type EventCostMode } from "@/lib/event-cost-basis";
import { computeEventSettlementTotals, type SettlementTotalsInput } from "@/lib/event-settlement-inputs";
import { computeContractBasisResult, computeCoverContractBasisResult, computeEventContractResult } from "@/lib/event-contract-result";
import { useEventFinancialCardData, type UseEventFinancialCardDataArgs } from "@/hooks/useEventFinancialCardData";
import { useEventContractResult } from "@/hooks/useEventContractResult";
import { expandMasterAdoptedExpensesToSplits } from "@/lib/master-adopted-expense-proration";
import { isValidFechoTransaction } from "@/lib/fecho-filters";
import { keepRootPerimeter } from "@/lib/settlement-perimeter";

const reads = vi.hoisted(() => ({
  forecasts: [] as any[], transactions: [] as any[],
  masterForecasts: [] as any[], masterTransactions: [] as any[],
  settlement: undefined as SettlementTotalsInput | undefined,
  rootIds: undefined as Set<string> | undefined,
}));

// Only fixture reads: no queryFn or MP service can execute.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ isPending: false, data: ({
    "efc-tx": reads.transactions,
    "efc-forecasts": reads.forecasts,
    "efc-master-tx": reads.masterTransactions,
    "efc-master-forecasts": reads.masterForecasts,
    "event-settlement-engine-event": { partner_calc_basis: "net_result_gross_expenses" },
    "event-settlement-engine-events": reads.settlement?.events,
    "event-settlement-engine-tx": reads.settlement?.transactions,
    "event-settlement-engine-bp": reads.settlement?.forecasts,
    "event-settlement-engine-tickets": reads.settlement?.ticketSales,
  } as Record<string, unknown>)[queryKey[0]] }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: () => { throw new Error("#223: serviço MP proibido neste teste"); } }),
}));
vi.mock("@/hooks/useEventRevenueBasis", () => ({ useEventRevenueBasis: () => ({ data: undefined }) }));
vi.mock("@/hooks/useEventRootSettlements", () => ({
  useEventRootSettlements: () => ({ data: reads.rootIds ? { rootIds: reads.rootIds } : undefined }),
}));
vi.mock("@/hooks/useEbitdaClassMap", () => ({ useEbitdaClassMap: () => ({ data: undefined }) }));
vi.mock("@/hooks/useFechoBasis", () => ({
  useFechoBasis: () => ({ ...reads.settlement?.basis, isLoading: false }),
}));
vi.mock("@/hooks/useCompanyLocale", () => ({ useCompanyLocale: () => ({ status: "available", capabilities: { iva: true } }) }));
vi.mock("@/hooks/useMasterRevenueSplit", () => ({
  useMasterRevenueSlicesFor: () => ({ slices: { transactionSlices: [], forecastSlices: [] }, isPending: false }),
}));

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
  reads.settlement = undefined;
  reads.rootIds = undefined;
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

const smFixture: SettlementTotalsInput = {
  events: fixture.events,
  forecasts: [],
  transactions: [
    ...[4200.75, 5278.87].map((amount, index) => ({
      ...transaction, id: `revenue-share-${index}`, type: "income", amount,
      category_id: "revenue-share", account_categories: { code: "1.3.04" },
      iva_rate: 23, status: "paid", excluded_from_partner_settlement: true,
    })),
    { ...transaction, id: "sm-expense", amount: 488388.55, iva_rate: 0, status: "paid" },
  ],
  ticketSales: [{ net: 439051.89, gross: 439051.89 }],
  basis: { expenseSource: "realized", includeOverhead: false },
};

describe("#223 — base do contrato da capa usa a receita do acerto", () => {
  it("SM reduzido: exclui 9.479,62 da base do contrato e preserva o resultado da vista", () => {
    const totals = computeEventSettlementTotals(smFixture);
    expect(totals.houseOnlyRevenueNet).toBeCloseTo(9479.62, 2);
    expect(totals.revenueNet).toBeCloseTo(448531.51, 2);
    expect(totals.settlementRevenueNet).toBeCloseTo(439051.89, 2);
    const previous = computeContractBasisResult(totals, "net_result_gross_expenses");
    const cover = computeCoverContractBasisResult(totals, 0, "net_result_gross_expenses");
    expect(previous).toBeCloseTo(-39857.04, 2);
    expect(cover).toBeCloseTo(-49336.66, 2);
    expect(previous - cover).toBeCloseTo(9479.62, 2);
    const view = computeEventContractResult(totals, { revenue: false, expense: true },
      { revenue: "realized", expense: "realized" }, cover, "net_result_gross_expenses");
    expect(view.revenueBase).toBe(totals.revenueNet);
    expect(view.result).toBe(previous);
    expect(view.settlementResult).toBe(cover);
  });

  it.each([
    ["net_result", 0, 519.6],
    ["net_result_gross_expenses", 0, 197.6],
    ["net_result", 17.25, 502.35],
    ["net_result_gross_expenses", 17.25, 180.35],
    ["gross_revenue", 17.25, 2500],
  ] as const)("sem receitas marcadas: mantém %s, cachê=%s, resultado=%s", (basis, cacheOnTop, expected) => {
    const totals = computeEventSettlementTotals({ ...fixture,
      basis: { expenseSource: "committed", includeOverhead: true } });
    const previous = computeContractBasisResult({ ...totals,
      expensesNet: totals.expensesNet + cacheOnTop,
      expensesGross: totals.expensesGross + cacheOnTop,
    }, basis);
    expect(computeCoverContractBasisResult(totals, cacheOnTop, basis)).toBe(previous);
    expect(previous).toBeCloseTo(expected, 2);
  });

  it("o hook real separa a base do fecho dos cards e reage à marcação da receita", () => {
    reads.settlement = smFixture;
    const totals = computeEventSettlementTotals(smFixture);
    const { result, rerender } = renderHook(() => useEventContractResult(
      "ev1", "net_result_gross_expenses",
      { net: totals.revenueNet, gross: totals.revenueGross, mode: "realized" },
      { net: totals.expensesNet, gross: totals.expensesGross, mode: "realized" },
      0, { revenue: false, expense: true },
    ));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.contract?.settlementResult).toBeCloseTo(-49336.66, 2);
    expect(result.current.contract?.result).toBeCloseTo(-39857.04, 2);
    expect(result.current.contract?.revenueBase).toBe(totals.revenueNet);
    reads.settlement = { ...smFixture, transactions: smFixture.transactions.map(t =>
      ({ ...t, excluded_from_partner_settlement: false })) };
    rerender();
    expect(result.current.contract?.settlementResult).toBeCloseTo(-39857.04, 2);
    expect(result.current.contract?.result).toBeCloseTo(-39857.04, 2);
  });
});

const family = [
  { id: "M", parent_event_id: null },
  { id: "L", parent_event_id: "M" },
  { id: "P", parent_event_id: "M" },
];
const familyFixture: SettlementTotalsInput = {
  events: family,
  forecasts: [
    ...["L", "P"].map(event_id => ({ ...forecast, id: `bp-${event_id}`,
      event_id, category_id: "X", amount: 100, iva_rate: 23 })),
    { ...forecast, id: "oh-M", event_id: "M", category_id: "OH", amount: 200,
      iva_rate: 23, is_overhead: true, exclude_from_result: true },
  ],
  transactions: [
    { ...transaction, id: "tx-L", event_id: "L", category_id: "X", amount: 119.27, iva_rate: 23, status: "paid" },
    { ...transaction, id: "tx-P", event_id: "P", category_id: "X", amount: 80.73, iva_rate: 23, status: "paid" },
  ],
  ticketSales: [],
  basis: { expenseSource: "committed", includeOverhead: true },
};

/** Card com o filtro de tipo da query; Encontro com as mesmas linhas de origem. */
function compareCosts(input: SettlementTotalsInput) {
  const totals = computeEventSettlementTotals(input);
  const card = (withVat: boolean) => computeEventCardCost({
    eventId: input.events[0].id,
    forecasts: input.forecasts.filter(f => f.type === "expense"),
    transactions: input.transactions,
    mode: input.basis.expenseSource, includeOverhead: input.basis.includeOverhead, withVat,
  }).total;
  return {
    cardNet: card(false), cardGross: card(true),
    encontroNet: totals.expensesNet, encontroGross: totals.expensesGross,
    deltaNet: card(false) - totals.expensesNet,
    deltaGross: card(true) - totals.expensesGross,
  };
}

describe("#223 — medições sintéticas, sem corrigir o card nem o motor", () => {
  it("divergência conhecida 23,70 — decisão do Pedro pendente (#223)", () => {
    const measured = compareCosts(familyFixture);
    expect(measured.cardNet).toBeCloseTo(419.27, 2);
    expect(measured.encontroNet).toBeCloseTo(400, 2);
    expect(measured.cardGross).toBeCloseTo(515.7, 2);
    expect(measured.encontroGross).toBeCloseTo(492, 2);
    expect(measured.deltaNet).toBeCloseTo(19.27, 2);
    expect(measured.deltaGross).toBeCloseTo(23.7, 2);
    expect(computeEventCardCost({ ...familyFixture, eventId: "M", mode: "committed",
      includeOverhead: true, withVat: true }).excess).toBeCloseTo(23.7, 2);
  });

  it("na mesma família, realized e Forecast medem diferença zero nas duas bases", () => {
    const realized = compareCosts({ ...familyFixture,
      basis: { expenseSource: "realized", includeOverhead: true } });
    expect(realized).toEqual({ cardNet: 400, cardGross: 492,
      encontroNet: 400, encontroGross: 492, deltaNet: 0, deltaGross: 0 });
    reads.forecasts = familyFixture.forecasts;
    reads.transactions = familyFixture.transactions;
    const encontro = computeEventSettlementTotals(familyFixture);
    // Forecast só existe no card; compara-se aqui com o Encontro em committed.
    for (const withVat of [false, true]) {
      const { result, unmount } = renderHook(() => useEventFinancialCardData({
        eventId: "M", eventIds: ["M", "L", "P"], kind: "expense", mode: "forecast",
        includeOverhead: true, withVat,
      }));
      expect(result.current.displayValue).toBe(withVat ? 492 : 400);
      expect(result.current.displayValue - (withVat ? encontro.expensesGross : encontro.expensesNet)).toBe(0);
      unmount();
    }
  });

  // Sem fórmula: divisão amount/N no adaptador, como na hipótese H2.
  function adoptedFixture(amount: number): SettlementTotalsInput {
    return { events: family, ticketSales: [], basis: familyFixture.basis,
      forecasts: [
        { ...forecast, id: "bp-M", event_id: "M", category_id: "X", amount: 0, iva_rate: 23 },
        ...["L", "P"].map(event_id => ({ ...forecast, id: `adopt-${event_id}`, event_id,
          category_id: "X", amount: 0, iva_rate: 23,
          master_forecast_id: "bp-M", transaction_id: "tx-M" })),
      ],
      transactions: [{ ...transaction, id: "tx-M", event_id: "M", category_id: "X",
        amount, iva_rate: 23, status: "paid" }],
    };
  }

  it.each(["committed", "realized"] as const)("H2 — %s: IVA das fatias pode inverter o sinal (card − Encontro = −0,01)", expenseSource => {
    const input = adoptedFixture(0.06);
    input.basis = { ...input.basis, expenseSource };
    const slices = expandMasterAdoptedExpensesToSplits(input);
    expect(slices.map(s => s.amount)).toEqual([0.03, 0.03]);
    const measured = compareCosts(input);
    expect(measured.cardNet).toBeCloseTo(0.06, 2);
    expect(measured.encontroNet).toBeCloseTo(0.06, 2);
    expect(measured.cardGross).toBeCloseTo(0.07, 2);
    expect(measured.encontroGross).toBeCloseTo(0.08, 2);
    expect(measured.deltaNet).toBeCloseTo(0, 2);
    expect(measured.deltaGross).toBeCloseTo(-0.01, 2);
  });

  it.each([
    { status: "pending" }, { is_transitory: true }, { exclude_from_result: true },
    { reversed_at: "2026-11-04T00:00:00Z" }, { is_hidden: true },
  ])("H3 — fatias adoptadas contornam isValidFechoTransaction: %j", flags => {
    for (const expenseSource of ["realized", "committed"] as const) {
      const input = adoptedFixture(100);
      input.basis = { ...input.basis, expenseSource };
      // Controlo: sem bloqueio nem arredondamento, os consumidores coincidem.
      expect(compareCosts(input).deltaGross).toBe(0);
      input.transactions = input.transactions.map(t => ({ ...t, ...flags }));
      expect(isValidFechoTransaction(input.transactions[0])).toBe(false);
      const measured = compareCosts(input);
      expect(measured.cardNet).toBe(0);
      expect(measured.cardGross).toBe(0);
      expect(measured.encontroNet).toBe(100);
      expect(measured.encontroGross).toBe(123);
      expect(measured.deltaNet).toBe(-100);
      expect(measured.deltaGross).toBe(-123);
    }
  });

  it.each([{ is_transitory: true }, { type: "income" }])("H4 — overhead sem filtro no motor: %j", flags => {
    for (const expenseSource of ["realized", "committed"] as const) {
      const input: SettlementTotalsInput = { events: fixture.events, ticketSales: [], transactions: [],
        forecasts: [{ ...forecast, id: "oh", amount: 100, iva_rate: 23, is_overhead: true,
          exclude_from_result: true }],
        basis: { expenseSource, includeOverhead: true } };
      expect(compareCosts(input).deltaGross).toBe(0);
      input.forecasts = input.forecasts.map(f => ({ ...f, ...flags }));
      const measured = compareCosts(input);
      expect(measured.cardNet).toBe(0);
      expect(measured.cardGross).toBe(0);
      expect(measured.encontroNet).toBe(100);
      expect(measured.encontroGross).toBe(123);
      expect(measured.deltaNet).toBe(-100);
      expect(measured.deltaGross).toBe(-123);
    }
  });

  it("H5 — o hook do card filtra a raiz; os totais do motor dependem do perímetro recebido", () => {
    const roots = new Set(["root"]);
    const transactions = [
      { ...transaction, id: "untagged", amount: 10, iva_rate: 23, status: "paid", event_settlement_id: null },
      { ...transaction, id: "root", amount: 20, iva_rate: 23, status: "paid", event_settlement_id: "root" },
      { ...transaction, id: "child", amount: 100, iva_rate: 23, status: "paid", event_settlement_id: "child" },
    ];
    const forecasts = transactions.map(t => ({ ...forecast, id: `bp-${t.id}`, amount: t.amount,
      iva_rate: 23, event_settlement_id: t.event_settlement_id }));
    reads.rootIds = roots;
    reads.transactions = transactions;
    reads.forecasts = forecasts;
    for (const expenseSource of ["realized", "committed"] as const) {
      const input: SettlementTotalsInput = { ...fixture, transactions, forecasts,
        basis: { expenseSource, includeOverhead: false } };
      const raw = computeEventSettlementTotals(input);
      const scoped = computeEventSettlementTotals({ ...input,
        transactions: keepRootPerimeter(transactions, roots),
        forecasts: keepRootPerimeter(forecasts, roots) });
      for (const withVat of [false, true]) {
        const { result, unmount } = renderHook(() => useEventFinancialCardData({
          eventId: "ev1", eventIds: ["ev1"], kind: "expense", mode: expenseSource, withVat,
        }));
        const card = result.current.displayValue;
        expect(card).toBeCloseTo(withVat ? 36.9 : 30, 2);
        expect(card - (withVat ? raw.expensesGross : raw.expensesNet)).toBeCloseTo(withVat ? -123 : -100, 2);
        expect(card - (withVat ? scoped.expensesGross : scoped.expensesNet)).toBeCloseTo(0, 2);
        unmount();
      }
    }
  });
});
