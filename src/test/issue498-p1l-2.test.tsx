import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import EventDetail from "@/pages/EventDetail";
import { EventFecho } from "@/components/EventFecho";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return { queries: {} as Record<string, unknown>, rows: [] as Record<string, unknown>[], pdfText: [] as unknown[][], pdf: [] as { head?: string[][]; body?: unknown[][] }[], screen: "", engine: null as unknown, card: {} as Record<string, unknown> };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Query callbacks and mutations never execute. There is no real service client.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: f.queries[String(queryKey[0])], isLoading: false, isPending: false, isError: false,
  }),
  useMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, {
  get: () => { throw new Error("#498 P1l-2: serviço MP proibido"); },
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  isAdmin: true, isManager: false, user: { id: "fixture-user" }, role: "admin", hasPermission: () => true,
}) }));
vi.mock("@/hooks/useEventFinancialsRealtime", () => ({ useEventFinancialsRealtime: () => {} }));
vi.mock("@/hooks/useEventStages", () => ({ useEventStage: () => ({ data: undefined }) }));
vi.mock("@/hooks/useEventHouseLabel", () => ({ useEventHouseLabel: () => "MP" }));
vi.mock("@/hooks/useEventCacheImpact", () => ({ useEventCacheImpact: () => ({ cacheImpact: 0 }) }));
vi.mock("@/hooks/useEventContractResult", () => ({ useEventContractResult: () => ({
  contract: { result: 1234.56, settlementResult: 1200, revenueBase: 2000, label: "Base sintética" },
}) }));
vi.mock("@/hooks/useEventRootSettlements", () => ({ useEventRootSettlements: () => ({
  data: { rootIds: new Set(["root"]), nameById: { child: "Fechamento sintético" } },
}) }));
vi.mock("@/hooks/useEventRevenueBasis", () => ({ useEventRevenueBasis: () => ({ data: {
  real: { hasTicketSales: true, ticket: { gross: 2460, net: 2000 }, incomeTx: [], total: { net: 3000, gross: 3000 } },
  committed: { total: { net: 3000, gross: 3000 } },
} }) }));
vi.mock("@/hooks/useSponsorshipPipeline", () => ({
  useSponsorshipPipeline: () => ({ data: f.rows, isLoading: false }),
  useCreateSponsor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSponsor: () => ({ mutate: vi.fn() }), useChangeStage: () => vi.fn(),
}));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <aside>{children}</aside>,
}));
// Only chart layout is replaced; supplied money formatters are exercised.
vi.mock("@/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => <div data-testid="chart">{children}</div>,
  ChartTooltip: ({ content }: { content: ReactNode }) => <foreignObject>{content}</foreignObject>,
  ChartTooltipContent: ({ formatter }: { formatter?: (v: number) => ReactNode }) =>
    <span data-testid="money-tooltip">{formatter?.(1234.56)}</span>,
}));
vi.mock("recharts", () => {
  const Chart = ({ children, data }: { children: ReactNode; data: unknown }) => <svg data-series={JSON.stringify(data)}>{children}</svg>;
  const Axis = ({ tickFormatter }: { tickFormatter?: (v: number) => ReactNode }) => tickFormatter ? <text>{tickFormatter(1234.56)}</text> : null;
  const Tooltip = ({ formatter }: { formatter?: (v: number) => ReactNode }) => <foreignObject><span>{formatter?.(1234.56)}</span></foreignObject>;
  return { PieChart: Chart, Pie: Chart, BarChart: Chart, ComposedChart: Chart, ResponsiveContainer: Chart,
    Tooltip, XAxis: Axis, YAxis: Axis, Cell: () => null, CartesianGrid: () => null, Bar: Chart, Line: () => null };
});
vi.mock("jspdf", () => ({ default: class {
  internal = { pageSize: { getWidth: () => 210 } };
  lastAutoTable = { finalY: 40 };
  setFontSize() {} setFont() {} setTextColor() {} text(...args: unknown[]) { f.pdfText.push(args); } addPage() {} save() {}
} }));
vi.mock("jspdf-autotable", () => ({ default: (_doc: unknown, options: unknown) => f.pdf.push(options) }));
// Unchanged leaf services are outside this lot; all eleven targets below are real.
vi.mock("@/components/EntityDocumentsSection", () => ({ default: () => null }));
vi.mock("@/components/EventCacheConfig", () => ({ EventCacheConfig: () => null }));
vi.mock("@/components/BpFormulaPanel", () => ({ FormulaSyncRunner: () => null }));
vi.mock("@/components/EventSessionsManager", () => ({ EventSessionsManager: () => null }));
vi.mock("@/components/bp-versions/ScenarioModeBanner", () => ({ ScenarioModeBanner: () => null }));
vi.mock("@/components/PartnerAccessManager", () => ({ PartnerAccessManager: () => null }));
vi.mock("@/components/PartnerPaidExpensesPanel", () => ({ PartnerPaidExpensesPanel: () => null }));
vi.mock("@/components/PartnerCapitalPanel", () => ({ PartnerCapitalPanel: () => null }));
vi.mock("@/components/EventEditModal", () => ({ EventEditModal: () => null }));
vi.mock("@/components/AddSubEventModal", () => ({ AddSubEventModal: () => null }));
vi.mock("@/components/TicketOfficeSettlementsOverview", () => ({ TicketOfficeSettlementsOverview: () => null }));
vi.mock("@/components/events/EventStageBadge", () => ({ EventStageBadge: () => null }));
vi.mock("@/components/events/EventStagePanel", () => ({ EventStagePanel: () => null }));
vi.mock("@/components/sponsorship/SponsorDetailDrawer", () => ({ SponsorDetailDrawer: () => null }));
vi.mock("@/components/sales/ZoneLotsPrices", () => ({ default: () => null }));
vi.mock("@/components/fecho/BpUnusedBudgetPanel", () => ({ BpUnusedBudgetSummaryCard: () => null, BpUnusedBudgetPanel: () => null }));


import { EventFinancialCard } from "@/components/EventFinancialCard";
import { EventForecast } from "@/components/EventForecast";
import { EventTicketing } from "@/components/EventTicketing";
import { EventPartnersTab } from "@/components/EventPartnersTab";
import { EventSettlementsPanel } from "@/components/EventSettlementsPanel";
import { EventClosingCosts } from "@/components/EventClosingCosts";
import { PartnerSettlementTab } from "@/components/PartnerSettlementTab";
import EventABTab from "@/components/EventABTab";
import { EventRealizedAllocation } from "@/components/EventRealizedAllocation";
import { writeStoredWithVat } from "@/lib/event-financial-card";
import { computeSettlementEngine } from "@/lib/event-settlement-engine";

vi.mock("@/hooks/useEventFinancialCardData", () => ({ useEventFinancialCardData: () => f.card }));
vi.mock("@/hooks/useEventSettlementEngine", () => ({ useEventSettlementEngine: () => f.engine }));
vi.mock("@/hooks/useEventCostBasis", () => ({ useEventCostBasis: () => ({
  expenseSource: "realized", withVat: true, includeOverhead: true, isLoading: false,
  canEditBasis: true, setExpenseSource: vi.fn(), setIncludeOverhead: vi.fn(),
}) }));
vi.mock("@/contexts/EventScenarioContext", () => ({ EventScenarioProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useEventScenario: () => ({
  selectedVersionId: null, setSelectedVersionId: vi.fn(), isScenarioMode: false,
}) }));
vi.mock("@/hooks/useBPVersions", () => ({ useBPVersions: () => ({ data: [] }) }));
vi.mock("@/hooks/useSyncCacheForecasts", () => ({ useSyncCacheForecasts: () => {} }));
vi.mock("@/hooks/useCitySimulator", () => ({ useCitySimulator: () => ({ sessions: [], rawSessions: [], cfg: {}, loading: false }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/BPGridEditor", () => ({ default: () => null }));
vi.mock("@/components/BpFormulaPanel", () => ({ BpFormulaPanel: () => null, FormulaSyncRunner: () => null }));
vi.mock("@/components/EventSettlementsManager", () => ({ EventSettlementsManager: () => null }));
vi.mock("@/components/EventThirdPartyOperationsPanel", () => ({ EventThirdPartyOperationsPanel: () => null }));
vi.mock("@/components/SettlementSealControl", () => ({ SettlementSealControl: () => null }));
vi.mock("@/components/PartnerPaymentDialog", () => ({ PartnerPaymentDialog: () => null }));
vi.mock("@/components/bp-versions/BPVersionCard", () => ({ BPVersionCard: () => null }));
vi.mock("@/components/bp-versions/BPScenarioSelector", () => ({ BPScenarioSelector: () => null }));
vi.mock("@/components/SalesLogPanel", () => ({ SalesLogPanel: () => null }));
vi.mock("@/components/EventCourtesiesEditor", () => ({ EventCourtesiesEditor: () => null }));
vi.mock("@/components/TicketForecastImportModal", () => ({ TicketForecastImportModal: () => null }));
vi.mock("@/components/TicketOfficeFormModal", () => ({ TicketOfficeFormModal: () => null }));
vi.mock("@/components/TicketUploadModals", () => ({ TicketImportModal: () => null }));
vi.mock("@/components/FeverImportModal", () => ({ FeverImportModal: () => null }));
vi.mock("@/components/TicketOfficeSettlementModal", () => ({ TicketOfficeSettlementModal: () => null }));

vi.mock("@/components/TransactionEditModal", () => ({ TransactionEditModal: () => null }));
vi.mock("@/components/TransactionAuditModal", () => ({ TransactionAuditModal: () => null }));
vi.mock("@/components/TransactionDocumentsModal", () => ({ TransactionDocumentsModal: () => null }));
vi.mock("@/components/ForecastEditModal", () => ({ ForecastEditModal: () => null }));
vi.mock("@/components/CachePaymentDialog", () => ({ CachePaymentDialog: () => null }));

vi.mock("@/lib/pdf-first-page-to-jpeg", () => ({ pdfFirstPageToJpeg: () => { throw new Error("PDF OCR fora do lote"); } }));

const noop = () => {};
const event = { id: "event", name: "Evento sintético", date: "2026-12-03", status: "active", event_type: "single",
  event_format: "single", company_id: "fixture-company", partner_calc_basis: "net_result_gross_expenses" };
const categories = [
  { id: "l1", parent_id: null, code: "3", name: "Custos", type: "expense" },
  { id: "l2", parent_id: "l1", code: "3.1", name: "Produção", type: "expense" },
  { id: "l3", parent_id: "l2", code: "3.1.1", name: "Operacional", type: "expense" },
];
const expense = { id: "expense", type: "expense", description: "Despesa sintética", amount: 1234.56, paid_amount: 0,
  date: "2026-10-01", due_date: "2026-10-01", status: "approved", supplier_id: "supplier", category_id: "l3",
  event_id: "event", iva_rate: 23, suppliers: { name: "Fornecedor sintético" }, account_categories: categories[2] };
const forecast = { ...expense, id: "forecast", status: "draft", formalidade: "estimado", iva_rate: 0 };
const settlements = [
  { id: "root", name: "Raiz sintética", parent_id: null, position: 0 },
  { id: "child", name: "Filho sintético", parent_id: "root", position: 1, parent_share_pct: 10, parent_share_basis: "net_result_gross_expenses" as const },
];
const participants = [
  { id: "participant", settlement_id: "root", participant_kind: "partner" as const, name: "Sócio sintético", mode: "settles" as const,
    profit_pct: 50, loss_pct: null, supplier_id: "supplier", event_partner_id: "partner", suppliers: { name: "Sócio sintético" }, transfer_with_vat: true },
  { id: "house", settlement_id: "root", participant_kind: "house" as const, name: "MP", mode: "settles" as const, profit_pct: 50, loss_pct: null },
  { id: "child-house", settlement_id: "child", participant_kind: "house" as const, name: "MP", mode: "settles" as const, profit_pct: 100, loss_pct: null },
];
const screens = {
  income: () => <EventFinancialCard eventId="event" eventIds={["event"]} kind="income" />,
  expense: () => <EventFinancialCard eventId="event" eventIds={["event"]} kind="expense" />,
  financialOverride: () => <EventFinancialCard eventId="event" eventIds={["event"]} kind="expense" />,
  financialMenu: () => <EventFinancialCard eventId="event" eventIds={["event"]} kind="expense" />,
  detail: () => <EventDetail />,
  forecast: () => <EventForecast eventId="event" eventDate={event.date} eventName={event.name} childEventIds={["city"]} />,
  comparison: () => <EventForecast eventId="event" eventDate={event.date} eventName={event.name} />,
  distribute: () => <EventForecast eventId="event" eventDate={event.date} eventName={event.name} childEventIds={["city"]} />,
  partnerSettlement: () => <PartnerSettlementTab eventId="event" eventName={event.name} />,
  partners: () => <EventPartnersTab eventId="event" eventStatus="active" />,
  settlements: () => <EventSettlementsPanel eventId="event" />,
  fecho: () => <EventFecho eventId="event" eventName={event.name} />,
  ab: () => <EventABTab eventId="event" />,
  ticketing: () => <EventTicketing eventId="event" eventStatus="active" />,
  closing: () => <EventClosingCosts eventId="event" eventStatus="active" />,
  realized: () => <EventRealizedAllocation open onOpenChange={noop} eventId="event" eventName={event.name} />,
};
type ScreenName = keyof typeof screens;
const names = Object.keys(screens) as ScreenName[];
function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function element(name: ScreenName) {
  return <MemoryRouter initialEntries={["/fixture/event"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/fixture/:id" element={screens[name]()} /></Routes>
  </MemoryRouter>;
}
function openScreen(name: ScreenName) {
  f.screen = name;
  if (name === "financialOverride") writeStoredWithVat("fixture-user", "event", "expense", false);
  if (name === "comparison") f.queries.event_forecasts = [{ ...forecast, status: "approved", is_overhead: false }];
  else f.queries.event_forecasts = [forecast];
  f.queries.event_transactions_actual = name === "distribute" ? [] : [expense];
  const view = render(element(name));
  if (name === "financialMenu") fireEvent.keyDown(screen.getByRole("button", { name: "Configurar modo" }), { key: "ArrowDown" });
  if (name === "comparison") {
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Previsão vs Real" }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByText("Produção"));
    fireEvent.click(screen.getByText("Operacional"));
  }
  if (name === "distribute") fireEvent.click(screen.getByTitle("Reverter para sub-eventos"));
  if (name === "closing") fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  if (name === "ticketing") fireEvent.click(screen.getAllByText("Plateia sintética")[0]);
  return view;
}
function domBytes() { return document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:"); }
function domHash() { return createHash("sha256").update(domBytes()).digest("hex"); }

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1l-2: rede proibida"); }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  setCompany(); f.pdf = []; f.pdfText = [];
  f.card = { displayValue: 1234.56, realValue: 1200, modeUsed: "realized", phase: "active", unavailable: false,
    subtotals: [], meta: {} };
  const result = computeSettlementEngine({ eventBasis: event.partner_calc_basis,
    eventTotals: { revenueNet: 3000, expensesNet: 1234.56, expensesGross: 1518.51 }, settlements, participants });
  f.engine = { result, isLoading: false, basis: { expenseSource: "realized", includeOverhead: true }, settlements,
    rawOperations: [], rawParticipations: [], hasAbModule: false };
  f.queries = {
    event_detail: event, "event-detail": event, event_transactions: [expense,
      { ...expense, id: "excluded", exclude_from_result: true }, { ...expense, id: "exclusive", event_settlement_id: "child" }],
    "event-settlements": settlements, "event-settlements-fecho": settlements,
    "event-settlement-participants": participants, "event-settlement-participants-fecho": participants,
    "event-transactions-settlement": [expense, { ...expense, id: "income", type: "income", amount: 3000, iva_rate: 0 }],
    "event-forecasts-settlement": [forecast], "all-account-categories-settlement": categories,
    account_categories: categories, "account-categories": categories,
    event_transactions_actual: [expense], event_forecasts: [forecast], sub_event_names_for_distribute: [{ id: "city", name: "Cidade sintética" }],
    "fecho-event-info": { partner_calc_basis: event.partner_calc_basis }, "fecho-transactions": [expense],
    "fecho-overheads": [], "fecho-partners": [{ id: "partner", percentage: 50, suppliers: { name: "Sócio sintético" } }],
    "fecho-paid-by-partners": [], "fecho-partner-extras": [], "fecho-operational-forecasts": [forecast],
    ab_config: { ab_mode_bebidas: "terceirizacao", ab_mode_alimentos: "terceirizacao" },
    event_ticket_zones: [{ id: "zone", name: "Plateia sintética", total_capacity: 100 }],
    event_ticket_lots: [{ id: "lot", zone_id: "zone", name: "Lote sintético", quantity: 10, price: 123.45, iva_rate: 23, lot_type: "regular", lot_kind: "simple" }],
    event_ticket_sales_by_zone: { zone: { tickets: 2, revenue: 246.90 } },
    "event-overhead-forecasts": [{ ...forecast, id: "closing", type: "expense" }],
    ac_all_expense: categories, ra_forecasts: [forecast], ra_txs: [expense],
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P1l-2 — baseline PT fixada antes de alterar produção; não regenerar", () => {
  it("fixa o SHA-256 dos onze componentes e dos seus detalhes e menus", () => {
    const hashes: Record<string, string> = {};
    for (const name of names) { openScreen(name); hashes[name] = domHash(); cleanup(); localStorage.clear(); }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "ab": "b5efbb5119b5be65461f164d7c3eab81f5b46328d0ce3f39084bfa9f20bd871e",
        "closing": "4bc313fc766b4b2e5e632231ddc883c71ab77931c5f97d318013c083189292f0",
        "comparison": "e9432dd1c6341797796fca46dedd41ad2783226922fa2e7ce592b5e23a9b6df3",
        "detail": "5a72845659816e3d98e34099eae9c80b441ffbdc7b2d2867a06803840335e4df",
        "distribute": "c750c1dde0cb9503943f94bee04dac6969ed4186e48ce1d28813da46c00d86c6",
        "expense": "aa9177ac1c4a7c71522192af088c27a6e77dd0700c654e30bc471304adc96d89",
        "fecho": "343fc075aac39e810c385dd67800bfde985d8e7c622f86162cb8fdf5c54b31b7",
        "financialMenu": "795126e377e868e30942b5686ed50a11eb8e7540254f297522dee03310afa750",
        "financialOverride": "199bae75691455fc016cce6903de66052fe6fc275805797b3b7fe0fdc2f78ccd",
        "forecast": "8bbc15dd71c0a3353c078a54423a5638774307c85ece03182615a5b6b022e635",
        "income": "2d817b0746045eb74798ad71c982abc45a72db7106e78dcf85f1d22402b0e086",
        "partnerSettlement": "15e9933313d3bd24b347f2a0ba28e1312ce6c4d619f5df99016073302f4dba54",
        "partners": "aa3c768fa9fd59be2dbe5c9aaebbb5d0d53a91aa017bc5655cbde3b6d9396fae",
        "realized": "58bf8fe54334d0221f80296e1c082bd852c59b820a07c8705370cf2461dac9e9",
        "settlements": "7be1e5ede070ffc2ae5c302d2173ab818f4c50fd9cbc2136c61657923270cf04",
        "ticketing": "6a52651cabd299e149ad390c0fdbb21d6d1f2bab5624f9be172f88a877410312",
      }
    `);
  });
  it("fixa os montantes BR antes de alterar qualquer rótulo", () => {
    setCompany("BR", "BRL");
    const hashes: Record<string, string> = {};
    for (const name of names) {
      openScreen(name);
      const amounts = document.body.textContent?.match(/(?:-?R\$\u00a0[\d.,]+|-?[\d.,]+\u00a0€)/g) ?? [];
      if (name === "partners") expect(amounts).toEqual([]);
      else expect(amounts.length, name).toBeGreaterThan(0);
      hashes[name] = createHash("sha256").update(JSON.stringify(amounts)).digest("hex");
      cleanup(); localStorage.clear();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "ab": "c5193516fd80873a96a93856595daf4bb302eff268bb95867c64c6a189691cee",
        "closing": "491271145fb203fca903d5b26e78c3b2fc8006a23ec52cfcf294e3444a5c335d",
        "comparison": "717c1365de73925ae5372e751b8b3ff8ea825e9cf61a5da1d796ea41a6d32426",
        "detail": "b5bb441e2cb463c4dc834ff7354deab162fdad9982d8ef8f1b666262379d713e",
        "distribute": "4c8453d2d5c422ba919b3d4b81b94fbee86aeb38cef7b962686258e56c4c146e",
        "expense": "a2e6080e14716263cb87fcf1f84db42707f9664ff8e4352219d2e2205da57bef",
        "fecho": "22717be86096c82a562f34f26c12c95bd03cb7da3a87c71176cb7b733de8ac0a",
        "financialMenu": "a2e6080e14716263cb87fcf1f84db42707f9664ff8e4352219d2e2205da57bef",
        "financialOverride": "a2e6080e14716263cb87fcf1f84db42707f9664ff8e4352219d2e2205da57bef",
        "forecast": "18f93d4ceef97ab32728e9c9e743415b9de582a1d36ff388a06abd579b88da28",
        "income": "eadb9f1019ec0d9d83291f5482550329f5eda44850cc2913fdb69e74fc108dd5",
        "partnerSettlement": "b47c8c012df6380e57ceaa4168c29e2abc06a2112579bd7709ca821f50d51d3e",
        "partners": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
        "realized": "cbdb64246d72b059a1cb4596cff5e4cc151a9a6f39f68f27534723bc945b41aa",
        "settlements": "cbe133aa633abd0122665049d6a8feca058d5537863c036d35cb4651a4fb4462",
        "ticketing": "defbac1ec2385dd8a98997d5a5df5b46f6c073173cb0802ca66b88c966cca97e",
      }
    `);
  });
  it("fixa os cabeçalhos e bases PT do PDF do Fecho", () => {
    openScreen("fecho"); fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    expect(f.pdf.map(({ head }) => head)).toMatchInlineSnapshot(`
      [
        undefined,
        undefined,
        [
          [
            "Sócio",
            "Base",
            "%",
            "Quota",
            "Pago p/ sócio",
            "Ajustes",
            "Extras",
            "Saldo",
          ],
        ],
      ]
    `);
    expect(f.pdf.at(-1)?.body?.[0]?.[1]).toBe("c/IVA");
    expect(f.pdfText).toMatchInlineSnapshot(`
      [
        [
          "Fecho do Evento — Evento sintético",
          14,
          16,
        ],
        [
          "Gerado em 03/11/2026 12:00  •  Criterio: Despesas c/IVA · base: realizado · com overhead",
          14,
          22,
        ],
        [
          "Síntese Operacional (sem overhead)",
          14,
          30,
        ],
        [
          "Síntese Final (com overhead — base do acerto com sócios)",
          14,
          46,
        ],
        [
          "Acerto com Sócios",
          14,
          48,
        ],
        [
          "Saldo positivo = empresa paga ao sócio. Saldo negativo = sócio paga à empresa.",
          14,
          44,
        ],
      ]
    `);
  });
});

// FechoBasisSelector is a separate component outside the closed path list.
// Keep it real in PT hashes; BR assertions below cover this lot's labels only.
// Its remaining IVA chip/menu, and EventSettlementsManager's labels, are reported
// explicitly as acceptance gaps in .executor/resumo.md, not silently hidden in UI.
function scopedBRDom() {
  const clone = document.body.cloneNode(true) as HTMLElement;
  for (const button of clone.querySelectorAll("button")) {
    if (button.textContent?.trim() === "Critério") button.parentElement?.remove();
  }
  return clone.innerHTML;
}
const ivaLabels = /[cs]\/\s?IVA|Com IVA|Sem IVA/;
function assertScopedBRLabels(name: ScreenName) {
  if (name === "partners") {
    // PartnerExtrasPanel is real here and has its own out-of-scope suffix.
    const basis = screen.getByText("Base de cálculo da participação").parentElement!.parentElement!;
    expect(basis.innerHTML).not.toMatch(ivaLabels);
    expect(screen.getAllByText("Resultado Líquido (Receitas − Despesas)")).toHaveLength(2);
    expect(screen.getByText("Receita Bruta", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("Repasse", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText(/^[cs]\/IVA$/)).not.toBeInTheDocument();
  } else expect(scopedBRDom()).not.toMatch(ivaLabels);
}


describe("#498 P1l-2 — rótulos próprios dos onze componentes", () => {
  it.each(names)("BR: %s elimina sufixos sem alterar montantes", name => {
    setCompany("BR", "BRL"); openScreen(name);
    assertScopedBRLabels(name);
    if (name === "financialMenu") {
      expect(screen.queryByText("Vista", { exact: true })).not.toBeInTheDocument();
      expect(screen.getByRole("menuitemradio", { name: "Realizado" })).toBeInTheDocument();
      expect(screen.getByRole("menuitemcheckbox", { name: "Incluir overhead" })).toBeInTheDocument();
    }
    if (name === "detail") expect(screen.getByRole("columnheader", { name: "Valor" })).toBeInTheDocument();
    if (name === "comparison") {
      // Historical nonzero IVA stays visible numerically; only its prefix changes.
      expect(document.body.textContent).toContain("R$\u00a01.518,51");
    }
    if (name === "ab") expect(screen.getByText("Facturação real do operador (R$)")).toBeInTheDocument();
    if (name === "ticketing") {
      for (const label of ["Preço", "Valor", "Total", "Valor (previsão)", "Total (previsão)"]) {
        expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument();
      }
    }
    if (name === "closing") {
      expect(screen.getByText("Valor (R$) *")).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
    }
    if (name === "realized") {
      for (const label of ["Previsto", "Realizado", "Valor"]) {
        expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument();
      }
    }
  });

  it.each(names)("%s acompanha PT → BR → PT e repõe os mesmos bytes PT", name => {
    const view = openScreen(name);
    const original = domHash();
    setCompany("BR", "BRL"); view.rerender(element(name));
    assertScopedBRLabels(name);
    setCompany(); view.rerender(element(name));
    expect(domHash()).toBe(original);
  });

  it.each([
    [null, "EUR", {}], ["BR", "", {}],
    ["BR", "BRL", { isLoading: true }],
    ["BR", "BRL", { isError: true, error: new Error("fixture") }],
  ] as const)("configuração indisponível %s/%s/%j conserva rótulos e menu PT", (country, currency, overrides) => {
    setCompany(country, currency, overrides);
    openScreen("financialMenu");
    expect(screen.getByRole("menuitemradio", { name: "Sem IVA (base líquida)" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "Com IVA (bruto)" })).toBeInTheDocument();
    cleanup(); localStorage.clear();
    for (const name of ["detail", "partners", "settlements", "fecho", "ticketing", "closing", "realized", "ab"] as const) {
      openScreen(name);
      expect(document.body.innerHTML, name).toMatch(ivaLabels);
      cleanup(); localStorage.clear();
    }
  });

  it("BR: PDF do Fecho omite os sufixos no critério e usa — na coluna Base", () => {
    setCompany("BR", "BRL"); openScreen("fecho");
    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    expect(f.pdf.length).toBeGreaterThan(0);
    expect(f.pdf.at(-1)?.body?.[0]?.[1]).toBe("—");
    expect(JSON.stringify([f.pdf, f.pdfText])).not.toMatch(ivaLabels);
    expect(JSON.stringify(f.pdf)).toContain("R$\u00a01.518,51");
  });

  it("as condições novas usam a capacidade partilhada sem decisões por país", () => {
    for (const file of ["pages/EventDetail", ...["EventFinancialCard", "EventForecast", "PartnerSettlementTab", "EventPartnersTab",
      "EventSettlementsPanel", "EventFecho", "EventABTab", "EventTicketing", "EventClosingCosts", "EventRealizedAllocation"].map(name => `components/${name}`)]) {
      const source = readFileSync(`src/${file}.tsx`, "utf8");
      expect(source).toContain("companyHasIva(");
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
    }
  });
});
