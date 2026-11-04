import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import EventDetail from "@/pages/EventDetail";
import { PartnerFinancialCard } from "@/components/partner/PartnerFinancialCard";
import { FechoBasisSelector } from "@/components/FechoBasisSelector";
import { ResultsAnalysis } from "@/components/ResultsAnalysis";
import { useEventCostBasis } from "@/hooks/useEventCostBasis";
import { computeRevenueBasisFromRows } from "@/lib/event-revenue-basis";
import { EventFinancialCard } from "@/components/EventFinancialCard";

const f = vi.hoisted(() => ({ queries: {} as Record<string, any>, modes: {} as Record<string, string>, loadingMode: false }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({ data: queryKey[0] === "event-budget-mode" ? (f.modes[String(queryKey[1])] ?? f.queries["event-budget-mode"]) : f.queries[String(queryKey[0])], isLoading: queryKey[0] === "event-budget-mode" && f.loadingMode, isPending: queryKey[0] === "event-budget-mode" && f.loadingMode }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, {
  get: () => { throw new Error("#644a: serviço MP proibido neste teste"); },
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user" }, isAdmin: true, isManager: false, hasPermission: () => true, role: "admin",
}) }));
vi.mock("@/hooks/useCompanyLocale", () => ({ useCompanyLocale: () => ({ status: "available", locale: "pt-PT", currency: "EUR", country: "PT", capabilities: { iva: true } }) }));
vi.mock("@/hooks/useEventRevenueBasis", () => ({ useEventRevenueBasis: () => ({ data: f.queries.revenue }) }));
vi.mock("@/hooks/useEventRootSettlements", () => ({ useEventRootSettlements: () => ({ data: undefined }) }));
vi.mock("@/hooks/useEbitdaClassMap", () => ({ useEbitdaClassMap: () => ({ data: undefined }) }));

beforeEach(() => {
  localStorage.clear();
  f.modes = {};
  f.loadingMode = false;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#644a: rede proibida"); }));
  f.queries = {
    "event-cost-basis": { cost_expense_source: "committed", cost_include_overhead: true, partner_calc_basis: "net" },
    "event-budget-mode": "with_bp",
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function openCard() {
  render(<EventFinancialCard eventId="event" eventIds={["event"]} kind="expense" eventStatus="planning" />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Configurar modo" }), { key: "ArrowDown" });
  return screen.getByRole("menu");
}

// Captured on the unmodified implementation, before adding budget-mode branches.
// Radix-generated identifiers vary across mounts; every other DOM byte is retained.
function menuHash(menu: HTMLElement) {
  return createHash("sha256").update(menu.outerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}

describe("#644a — menu with_bp preservado", () => {
  it("preserva o hash do DOM anterior", () => {
    const menu = openCard();
    expect(within(menu).getByRole("menuitemradio", { name: "Previsto + excedido" })).toBeInTheDocument();
    expect(menuHash(menu)).toBe("596a97e3102382dd11d40d1061d03276454e0bcaf328bd35e1a7d7bae7459d61");
  });
});

// EventDetail is real; unrelated tab contents are inert leaves. Query callbacks
// never execute, so neither the mocked client nor the network may be accessed.
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: "company" }) }));
vi.mock("@/hooks/useEventFinancialsRealtime", () => ({ useEventFinancialsRealtime: () => {} }));
vi.mock("@/hooks/useEventStages", () => ({ useEventStage: () => ({ data: undefined }) }));
vi.mock("@/hooks/useEventHouseLabel", () => ({ useEventHouseLabel: () => "Produtor" }));
vi.mock("@/hooks/useEventCacheImpact", () => ({ useEventCacheImpact: () => ({ cacheImpact: 0 }) }));
vi.mock("@/hooks/useEventContractResult", () => ({ useEventContractResult: () => ({ contract: null }) }));
vi.mock("@/hooks/useMasterRevenueSplit", () => ({ useMasterRevenueSplit: () => ({ forecastSlices: [], transactionSlices: [] }) }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/EntityDocumentsSection", () => ({ default: () => null }));
vi.mock("@/components/EventForecast", () => ({ EventForecast: () => <div data-testid="bp-content">Conteúdo BP</div> }));
vi.mock("@/components/sponsorship/SponsorshipPipelineBoard", () => ({ SponsorshipPipelineBoard: () => null }));
vi.mock("@/components/EventTicketing", () => ({ EventTicketing: () => null }));
vi.mock("@/components/EventCacheConfig", () => ({ EventCacheConfig: () => null }));
vi.mock("@/components/BpFormulaPanel", () => ({ FormulaSyncRunner: () => null }));
vi.mock("@/components/EventPartnersTab", () => ({ EventPartnersTab: () => null }));
vi.mock("@/components/EventSettlementsPanel", () => ({ EventSettlementsPanel: () => null }));
vi.mock("@/components/EventClosingCosts", () => ({ EventClosingCosts: () => null }));
vi.mock("@/components/EventFecho", () => ({ EventFecho: () => null }));
vi.mock("@/components/EventSessionsManager", () => ({ EventSessionsManager: () => null }));
vi.mock("@/contexts/EventScenarioContext", () => ({ EventScenarioProvider: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/bp-versions/ScenarioModeBanner", () => ({ ScenarioModeBanner: () => null }));
vi.mock("@/components/PartnerAccessManager", () => ({ PartnerAccessManager: () => null }));
vi.mock("@/components/PartnerPaidExpensesPanel", () => ({ PartnerPaidExpensesPanel: () => null }));
vi.mock("@/components/PartnerCapitalPanel", () => ({ PartnerCapitalPanel: () => null }));
vi.mock("@/components/PartnerSettlementTab", () => ({ PartnerSettlementTab: () => null }));
vi.mock("@/components/EventEditModal", () => ({ EventEditModal: () => null }));
vi.mock("@/components/AddSubEventModal", () => ({ AddSubEventModal: () => null }));
vi.mock("@/components/EventABTab", () => ({ default: () => null }));
vi.mock("@/components/EventRealizedAllocation", () => ({ EventRealizedAllocation: () => null }));
vi.mock("@/components/TicketOfficeSettlementsOverview", () => ({ TicketOfficeSettlementsOverview: () => null }));
vi.mock("@/components/events/EventStageBadge", () => ({ EventStageBadge: () => null }));
vi.mock("@/components/events/EventStagePanel", () => ({ EventStagePanel: () => null }));
vi.mock("recharts", () => ({ PieChart: () => null, Pie: () => null, Cell: () => null, ResponsiveContainer: () => null, Tooltip: () => null }));

function setLegacyRows() {
  f.queries["efc-tx"] = [
    { id: "tx", event_id: "event", type: "expense", status: "paid", amount: 30, iva_rate: 23, category_id: "travel" },
  ];
  f.queries["efc-forecasts"] = [
    { id: "old-bp", event_id: "event", type: "expense", status: "approved", amount: 1000, iva_rate: 23, category_id: "travel" },
  ];
  f.queries.revenue = computeRevenueBasisFromRows({
    ticket: { net: 100, gross: 106 }, incomeTx: [], ticketForecast: null, abForecastNet: null,
    sponsorship: { hasTargets: false, closedAt: null, baselineNet: null, currentNet: null, realNet: 0, currentGross: null, realGross: 0, segments: [], excludedForecastIds: [] },
    incomeForecasts: [{ id: "old-income", type: "income", status: "approved", amount: 9999, account_categories: { code: "1.3.01" } }],
  });
}

function expectOnlyRealized(menu: HTMLElement) {
  expect(within(menu).getByRole("menuitemradio", { name: "Realizado" })).toBeChecked();
  expect(within(menu).queryByText("Previsto + excedido")).not.toBeInTheDocument();
  expect(within(menu).queryByText("Comprometido")).not.toBeInTheDocument();
  expect(within(menu).queryByText("Forecast")).not.toBeInTheDocument();
  expect(within(menu).queryByText(/Auto/)).not.toBeInTheDocument();
  expect(within(menu).getByText("evento sem BP")).toBeInTheDocument();
}

describe("#644a critérios 2/4 — cards sem BP", () => {
  it.each(["expense", "income"] as const)("%s ignora forecast guardado e BP antigo; mantém IVA e OH", (kind) => {
    f.queries["event-budget-mode"] = "without_bp";
    setLegacyRows();
    localStorage.setItem(`ef-card-mode-user-event-${kind}`, "forecast");
    const perimeter = vi.fn();
    render(<EventFinancialCard eventId="event" eventIds={["event"]} kind={kind} eventStatus="planning" onPerimeterChange={perimeter} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Configurar modo" }), { key: "ArrowDown" });
    const menu = screen.getByRole("menu");
    expectOnlyRealized(menu);
    expect(within(menu).getByRole("menuitemradio", { name: "Com IVA (bruto)" })).toBeInTheDocument();
    if (kind === "expense") expect(within(menu).getByRole("menuitemcheckbox", { name: "Incluir overhead" })).toBeInTheDocument();
    expect(perimeter).toHaveBeenCalledWith({ net: kind === "income" ? 100 : 30, gross: kind === "income" ? 106 : 36.9, mode: "realized" });
  });
  it("oculta o valor e não propaga perímetro enquanto o modo carrega", () => {
    f.loadingMode = true;
    setLegacyRows();
    const perimeter = vi.fn();
    const { container } = render(<EventFinancialCard eventId="event" eventIds={["event"]} kind="expense" onPerimeterChange={perimeter} />);
    expect(container.querySelector(".text-2xl")).toHaveTextContent("—");
    expect(perimeter).not.toHaveBeenCalled();
  });
  it.each(["income", "expense"] as const)("Sócio %s oferece só realizado e ignora forecast guardado", (kind) => {
    f.queries["event-budget-mode"] = "without_bp";
    localStorage.setItem(`partner-ef-card-mode-user-event-${kind}`, "forecast");
    const onValueChange = vi.fn();
    render(<PartnerFinancialCard kind={kind} eventId="event" userId="user" eventStatus="planning" transactions={[]} forecasts={[]} ticketRevenueNet={100} onValueChange={onValueChange} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Configurar modo" }), { key: "ArrowDown" });
    expectOnlyRealized(screen.getByRole("menu"));
    expect(onValueChange).toHaveBeenCalledWith(kind === "income" ? 100 : 0);
  });
  it("Fecho só permite realizado e mantém overhead", () => {
    f.queries["event-budget-mode"] = "without_bp";
    function Selector() { return <FechoBasisSelector basis={useEventCostBasis("event")} />; }
    const { container } = render(<Selector />);
    expect(container).toHaveTextContent("Realizado");
    expect(container).not.toHaveTextContent("Previsto + excedido");
    fireEvent.keyDown(screen.getByRole("button", { name: "Critério" }), { key: "ArrowDown" });
    expect(screen.getByRole("menuitemradio", { name: "Realizado (transações)" })).toBeChecked();
    expect(screen.queryByRole("menuitemradio", { name: "Previsto + excedido" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitemcheckbox", { name: "Incluir overhead" })).toBeInTheDocument();
  });
});

const event = { id: "event", company_id: "company", name: "Evento sintético", date: "2099-12-31", status: "planning", event_type: "simple" };
function Location() { return <output data-testid="location">{useLocation().search}</output>; }
function openEvent(search = "") {
  f.queries.event_detail = event;
  render(<MemoryRouter initialEntries={[`/eventos/event${search}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Location /><Routes><Route path="/eventos/:id" element={<EventDetail />} /></Routes>
  </MemoryRouter>);
}

describe("#644a critério 4 — menu do evento", () => {
  it("without_bp retira BP e redirecciona ?tab=forecast para Resumo", async () => {
    f.queries["event-budget-mode"] = "without_bp";
    openEvent("?tab=forecast");
    expect(screen.queryByRole("tab", { name: "Business Plan" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("tab", { name: "Resumo" })).toHaveAttribute("aria-selected", "true"));
    expect(screen.getByTestId("location")).not.toHaveTextContent("tab=forecast");
    expect(screen.queryByTestId("bp-content")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Simulador" })).toBeInTheDocument();
  });
  it("with_bp mantém BP e o deep link", () => {
    openEvent("?tab=forecast");
    expect(screen.getByRole("tab", { name: "Business Plan" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("bp-content")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("tab=forecast");
  });
  it.each([["with_bp", "without_bp", false], ["without_bp", "with_bp", true]] as const)("Master %s / cidade %s usa o modo da cidade", (master, city, visible) => {
    f.modes = { event: master, city };
    f.queries.sub_events = [{ ...event, id: "city", parent_event_id: "event" }];
    openEvent("?sub=city&tab=forecast");
    expect(!!screen.queryByRole("tab", { name: "Business Plan" })).toBe(visible);
    expect(screen.getByRole("tab", { name: visible ? "Business Plan" : "Resumo" })).toHaveAttribute("aria-selected", "true");
  });
});

function prepareResults(mixed: boolean) {
  const year = new Date().getFullYear();
  f.queries.ra_events = [
    { ...event, status: "active", date: `${year}-12-31`, name: "Sem BP" },
    ...(mixed ? [{ ...event, id: "with", status: "active", date: `${year}-12-31`, name: "Com BP" }] : []),
  ];
  f.queries.ra_budget_modes = new Set(mixed ? ["with"] : []);
  f.queries.ra_transactions_v5_no_transitory = f.queries.ra_events.map((e: any) => ({ id: `tx-${e.id}`, event_id: e.id, type: "expense", status: "paid", amount: 30, category_id: "travel" }));
  f.queries.ra_forecasts_v2 = f.queries.ra_events.map((e: any) => ({ id: `bp-${e.id}`, event_id: e.id, type: "expense", amount: 1000, category_id: "travel" }));
}

describe("#644a — Análise de Resultados", () => {
  it("override global projection só se aplica aos eventos com BP", () => {
    prepareResults(true);
    render(<ResultsAnalysis />);
    const mode = screen.getByDisplayValue("Auto (por data)");
    fireEvent.change(mode, { target: { value: "projection" } });
    const without = screen.getByText("Sem BP").closest("tr")!;
    const withBp = screen.getByText("Com BP").closest("tr")!;
    expect(without).toHaveTextContent("Realizado");
    expect(without).not.toHaveTextContent("Projeção");
    expect(without).not.toHaveTextContent("1.000,00");
    expect(without).toHaveTextContent("30,00");
    expect(withBp).toHaveTextContent("Projeção");
    expect(withBp).toHaveTextContent("1.000,00");
  });
  it("sem eventos com BP retira a opção Projeção", () => {
    prepareResults(false);
    render(<ResultsAnalysis />);
    expect(screen.queryByRole("option", { name: "Projeção (BP+Real)" })).not.toBeInTheDocument();
    expect(screen.getByText("Sem BP").closest("tr")).toHaveTextContent("Realizado");
  });
});
