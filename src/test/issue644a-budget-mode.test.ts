import { createElement, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedModes, defaultModeForPhase, resolveMode, type CardMode, type Phase } from "@/lib/event-financial-card";
import { computeEventCostOnBasis } from "@/lib/event-cost-basis";
import { computeEventCardCost } from "@/lib/event-card-cost";
import { computeRevenueBasisFromRows } from "@/lib/event-revenue-basis";
import { useEventBudgetMode } from "@/hooks/useEventBudgetMode";
import { useEventCostBasis } from "@/hooks/useEventCostBasis";
import { usePartnerFinancialCardData } from "@/hooks/usePartnerFinancialCardData";

const f = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), row: {} as Record<string, unknown> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: f.rpc,
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: f.row, error: null }) }) }),
    update: f.update,
  }),
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: true, isManager: false, hasPermission: () => true }) }));

const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#644a: rede proibida"); }));
  f.rpc.mockResolvedValue({ data: "with_bp", error: null });
  f.update.mockReturnValue({ eq: async () => ({ error: null }) });
  f.row = { cost_expense_source: "committed", cost_include_overhead: true, partner_calc_basis: "gross" };
});
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const modes: CardMode[] = ["auto", "realized", "committed", "forecast"];
const phases: Phase[] = ["planning", "development", "completed"];
const kinds = ["income", "expense"] as const;

describe("#644a critério 1 — resolução pura", () => {
  for (const phase of phases) for (const kind of kinds) {
    it(`without_bp: ${phase}/${kind} só admite realizado`, () => {
      expect(allowedModes(phase, kind, "without_bp")).toEqual(["realized"]);
      expect(defaultModeForPhase(phase, "without_bp")).toBe("realized");
      for (const mode of modes) expect(resolveMode(mode, phase, kind, "without_bp")).toBe("realized");
    });
  }
  // Tabela capturada das regras anteriores: colunas auto, realized, committed, forecast.
  const legacy = [
    ["planning", "income", ["forecast", "realized", "committed", "forecast"]],
    ["planning", "expense", ["forecast", "realized", "committed", "forecast"]],
    ["development", "income", ["committed", "realized", "committed", "forecast"]],
    ["development", "expense", ["committed", "realized", "committed", "forecast"]],
    ["completed", "income", ["realized", "realized", "committed", "forecast"]],
    ["completed", "expense", ["realized", "realized", "committed", "realized"]],
  ] as const;
  it.each(legacy)("with_bp conserva a tabela %s/%s", (phase, kind, expected) => {
    expect(modes.map((mode) => resolveMode(mode, phase, kind, "with_bp"))).toEqual(expected);
    expect(modes.map((mode) => resolveMode(mode, phase, kind))).toEqual(expected);
    const allowed = phase === "completed" && kind === "expense" ? ["realized", "committed"] : ["realized", "committed", "forecast"];
    expect(allowedModes(phase, kind, "with_bp")).toEqual(allowed);
    expect(allowedModes(phase, kind)).toEqual(allowed);
    const auto = phase === "planning" ? "forecast" : phase === "development" ? "committed" : "realized";
    expect(defaultModeForPhase(phase, "with_bp")).toBe(auto);
    expect(defaultModeForPhase(phase)).toBe(auto);
  });
});

const transactions = [
  { id: "paid", event_id: "event", type: "expense", status: "paid", category_id: "travel", amount: 33.33, iva_rate: 23 },
  { id: "approved", event_id: "event", type: "expense", status: "approved", category_id: "travel", amount: 24.7, iva_rate: 6 },
  { id: "uncategorized", event_id: "event", type: "expense", status: "paid", category_id: null, amount: 15, iva_rate: 13 },
  { id: "pending", event_id: "event", type: "expense", status: "pending", amount: 999, iva_rate: 23 },
  { id: "transitory", event_id: "event", type: "expense", status: "paid", amount: 888, is_transitory: true },
];
const legacyForecasts = [{ id: "bp", event_id: "event", type: "expense", status: "approved", category_id: "travel", amount: 1000, iva_rate: 23 }];
const sponsorship = { hasTargets: false, closedAt: null, baselineNet: null, currentNet: null, realNet: 0, currentGross: null, realGross: 0, segments: [], excludedForecastIds: [] };

describe("#644a critério 2 — sem BP ⇒ custo e receita realizados", () => {
  for (const withVat of [false, true]) for (const includeOverhead of [false, true]) {
    it(`custo sem linhas: committed = realized ±0,005 (IVA=${withVat}, OH=${includeOverhead})`, () => {
      const args = { forecasts: [], transactions, withVat, includeOverhead };
      const realized = computeEventCostOnBasis({ ...args, mode: "realized" }).total;
      expect(realized).toBeGreaterThan(0);
      expect(Math.abs(computeEventCostOnBasis({ ...args, mode: "committed" }).total - realized)).toBeLessThanOrEqual(0.005);
      for (const mode of ["committed", "realized"] as const) {
        expect(Math.abs(computeEventCardCost({ ...args, eventId: "event", mode }).total - realized)).toBeLessThanOrEqual(0.005);
      }
    });
  }
  it("receita sem base prevista: committed = real em todos os buckets, líquido e bruto", () => {
    const revenue = computeRevenueBasisFromRows({
      ticket: { net: 100, gross: 106 }, sponsorship, ticketForecast: null, abForecastNet: null,
      incomeForecasts: [], incomeTx: [
        { type: "income", status: "paid", amount: 33.33, iva_rate: 13, account_categories: { code: "1.1.03" } },
        { type: "income", status: "approved", amount: 24.7, iva_rate: 23, account_categories: { code: "1.2.01" } },
        { type: "income", status: "paid", amount: 15, iva_rate: 6, account_categories: { code: "1.3.01" } },
      ],
    });
    for (const vat of ["net", "gross"] as const) {
      expect(revenue.real.total[vat]).toBeGreaterThan(100);
      expect(Math.abs(revenue.committed.total[vat] - revenue.real.total[vat])).toBeLessThanOrEqual(0.005);
      for (const bucket of ["bilheteira", "ab", "patrocinio", "outros"] as const) {
        expect(Math.abs(revenue.committed.buckets[bucket][vat] - revenue.real.buckets[bucket][vat])).toBeLessThanOrEqual(0.005);
      }
    }
  });
  it("linhas antigas: a base efectiva do hook escolhe o realizado em vez do BP", async () => {
    f.rpc.mockResolvedValue({ data: "without_bp", error: null });
    const { result } = renderHook(() => useEventCostBasis("event"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.expenseSource).toBe("realized");
    for (const withVat of [false, true]) for (const includeOverhead of [false, true]) {
      const args = { forecasts: legacyForecasts, transactions, withVat, includeOverhead };
      const effective = computeEventCostOnBasis({ ...args, mode: result.current.expenseSource }).total;
      expect(effective).toBe(computeEventCostOnBasis({ ...args, mode: "realized" }).total);
      expect(effective).toBeLessThan(computeEventCostOnBasis({ ...args, mode: "committed" }).total);
    }
  });
});

describe("#644a critério 3 — SSoT e ausência de escrita", () => {
  it("consulta o RPC pelo ID exacto e setExpenseSource é inerte em without_bp", async () => {
    f.rpc.mockResolvedValue({ data: "without_bp", error: null });
    const { result } = renderHook(() => useEventCostBasis("event"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("event_budget_mode", { _event_id: "event" });
    expect(result.current).toMatchObject({ budgetMode: "without_bp", isWithoutBp: true, expenseSource: "realized", withVat: true, includeOverhead: true });
    act(() => { result.current.setExpenseSource("committed"); result.current.setExpenseSource("realized"); });
    expect(f.update).not.toHaveBeenCalled();
  });
  it("não mostra critério resolvido nem escreve enquanto o modo carrega", async () => {
    let finish!: (value: unknown) => void;
    f.rpc.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useEventCostBasis("event"), { wrapper: wrapper() });
    expect(result.current.isLoading).toBe(true);
    act(() => result.current.setExpenseSource("committed"));
    expect(f.update).not.toHaveBeenCalled();
    await act(async () => finish({ data: "without_bp", error: null }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.expenseSource).toBe("realized");
  });
  it.each([
    { data: null, error: { code: "42501", message: "denied" } },
    { data: "unknown", error: null },
    { data: null, error: null },
  ])("erro/valor desconhecido mantém with_bp e avisa: %j", async (response) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    f.rpc.mockResolvedValue(response);
    const { result } = renderHook(() => useEventCostBasis("event"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ budgetMode: "with_bp", expenseSource: "committed", isWithoutBp: false });
    expect(warn).toHaveBeenCalledOnce();
    act(() => result.current.setExpenseSource("realized"));
    await waitFor(() => expect(f.update).toHaveBeenCalledExactlyOnceWith({ cost_expense_source: "realized" }));
  });
  it("rejeição do RPC mantém with_bp e avisa", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    f.rpc.mockRejectedValue(new Error("fixture rejection"));
    const { result } = renderHook(() => useEventBudgetMode("event"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.budgetMode).toBe("with_bp");
    expect(warn).toHaveBeenCalledOnce();
  });
  it("sem ID usa with_bp sem RPC", () => {
    const { result } = renderHook(() => useEventBudgetMode(), { wrapper: wrapper() });
    expect(result.current).toEqual({ budgetMode: "with_bp", isLoading: false });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("Master e cidade consultam modos próprios, sem herança do pai", async () => {
    f.rpc.mockImplementation((_fn, { _event_id }) => Promise.resolve({ data: _event_id === "master" ? "without_bp" : "with_bp", error: null }));
    const { result, rerender } = renderHook(({ id }) => useEventCostBasis(id), { initialProps: { id: "master" }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.expenseSource).toBe("realized");
    rerender({ id: "city" });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.expenseSource).toBe("committed");
    expect(f.rpc).toHaveBeenCalledWith("event_budget_mode", { _event_id: "city" });
  });
});

describe("#644a — caminho do Sócio com BP antigo", () => {
  for (const kind of kinds) for (const mode of modes) {
    it(`${kind}/${mode} usa exclusivamente realizado`, () => {
      const { result } = renderHook(() => usePartnerFinancialCardData({
        kind, mode, budgetMode: "without_bp", eventStatus: "planning",
        transactions: [
          { id: "expense", type: "expense", status: "paid", amount: 30, iva_rate: 23 },
          { id: "income", type: "income", status: "approved", amount: 50, account_categories: { code: "1.3.01" } },
        ],
        forecasts: [...legacyForecasts, { id: "old-income", type: "income", status: "approved", amount: 9999 }],
        ticketRevenueNet: 200, ticketCargasNet: 8888, masterExpenseShareGross: 7, masterForecastShareGross: 1000, cacheImpactGross: 4,
      }));
      expect(result.current.modeUsed).toBe("realized");
      expect(result.current.displayValue).toBeCloseTo(kind === "income" ? 250 : 47.9, 5);
    });
  }
});
