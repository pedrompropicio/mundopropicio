import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { useCompany, type Company } from "@/hooks/useCompany";
import EventDetail from "@/pages/EventDetail";
import { SponsorshipPipelineBoard } from "@/components/sponsorship/SponsorshipPipelineBoard";
import { SponsorshipPipelineImportModal } from "@/components/sponsorship/SponsorshipPipelineImportModal";
import { EventFecho } from "@/components/EventFecho";
import { SalesPositionWidget } from "@/components/SalesPositionWidget";
import SalesBI from "@/pages/SalesBI";
import SalesBIDetail from "@/pages/SalesBIDetail";
import SalesBIEvent from "@/pages/SalesBIEvent";
import { SupplierCreditsSummaryCard } from "@/components/supplier-credits/SupplierCreditsSummaryCard";
import ReportAging from "@/components/ReportAging";
import ReportSupplierConcentration from "@/components/ReportSupplierConcentration";
import ReportSuppliersPage from "@/pages/ReportSuppliersPage";
import ReportRevenueMix from "@/components/ReportRevenueMix";
import ReportPendencyIndex from "@/components/ReportPendencyIndex";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return { queries: {} as Record<string, unknown>, rows: [] as Record<string, unknown>[], pdf: [] as unknown[] };
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
  get: () => { throw new Error("#498 P1k: serviço MP proibido"); },
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
  real: { hasTicketSales: true, ticket: { gross: 2460, net: 2000 }, incomeTx: [] },
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
  setFontSize() {} setFont() {} setTextColor() {} text() {} addPage() {} save() {}
} }));
vi.mock("jspdf-autotable", () => ({ default: (_doc: unknown, options: unknown) => f.pdf.push(options) }));
// Unrelated event tabs are outside this lot; every one of the 14 targets is real.
vi.mock("@/components/EntityDocumentsSection", () => ({ default: () => null }));
vi.mock("@/components/EventFinancialCard", () => ({ EventFinancialCard: () => null }));
vi.mock("@/components/EventForecast", () => ({ EventForecast: () => null }));
vi.mock("@/components/EventTicketing", () => ({ EventTicketing: () => null }));
vi.mock("@/components/EventCacheConfig", () => ({ EventCacheConfig: () => null }));
vi.mock("@/components/BpFormulaPanel", () => ({ FormulaSyncRunner: () => null }));
vi.mock("@/components/EventPartnersTab", () => ({ EventPartnersTab: () => null }));
vi.mock("@/components/EventSettlementsPanel", () => ({ EventSettlementsPanel: () => null }));
vi.mock("@/components/EventClosingCosts", () => ({ EventClosingCosts: () => null }));
vi.mock("@/components/EventSessionsManager", () => ({ EventSessionsManager: () => null }));
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
vi.mock("@/components/sponsorship/SponsorDetailDrawer", () => ({ SponsorDetailDrawer: () => null }));
vi.mock("@/components/sales/ZoneLotsPrices", () => ({ default: () => null }));
vi.mock("@/components/fecho/BpUnusedBudgetPanel", () => ({ BpUnusedBudgetSummaryCard: () => null }));

const noop = () => {};
const event = { id: "event", name: "Evento sintético", date: "2026-12-03", status: "active", event_type: "single",
  event_format: "single", company_id: "fixture-company", tickets_total: 100, partner_calc_basis: "net_result_gross_expenses" };
const expense = { id: "expense", type: "expense", description: "Despesa sintética", amount: 1234.56, paid_amount: 0,
  date: "2026-10-01", due_date: "2026-10-01", status: "approved", supplier_id: "supplier", category_id: "category", account_id: "account",
  event_id: "event", iva_rate: 23, suppliers: { name: "Fornecedor sintético" }, events: { name: event.name },
  account_categories: { code: "3.1", name: "Operacional", ebitda_class: "operational" } };
const sponsor = { id: "sponsor", supplier_name: "Patrocinador sintético", stage: "closed", proposed_amount: 1200,
  confirmed_amount: 1234.56, currency: "EUR", priority: "medium", is_barter: false };
const position = { group_id: "event", event_name: event.name, event_date: event.date, child_count: 0,
  total_qty: 10, total_value: 1234.56, last7_qty: 7, last7_value: 864.192, yesterday_qty: 1, yesterday_value: 123.456,
  today_qty: 1, today_value: 123.456, fortnight_qty: 3, fortnight_value: 370.368, has_bol: false, daily_missing: false };
const series = Array.from({ length: 14 }, (_, i) => ({ group_id: "event", event_id: "event", event_name: event.name,
  event_date: event.date, sale_date: new Date(Date.UTC(2026, 10, 2 - i)).toISOString().slice(0, 10),
  provider: "synthetic", qty: 1, value: 123.456 }));
const screens = {
  event: () => <EventDetail />,
  sponsorship: () => <SponsorshipPipelineBoard eventId="event" eventName={event.name} companyId="fixture-company" canEdit />,
  sponsorImport: () => <SponsorshipPipelineImportModal open onOpenChange={noop} eventId="event" companyId="fixture-company" />,
  fecho: () => <EventFecho eventId="event" eventName={event.name} />,
  position: () => <SalesPositionWidget />,
  sales: () => <SalesBI />,
  salesDetail: () => <SalesBIDetail />,
  salesEvent: () => <SalesBIEvent />,
  credits: () => <SupplierCreditsSummaryCard />,
  aging: () => <ReportAging />,
  concentration: () => <ReportSupplierConcentration />,
  suppliers: () => <ReportSuppliersPage />,
  revenue: () => <ReportRevenueMix />,
  pendency: () => <ReportPendencyIndex />,
};
type ScreenName = keyof typeof screens;
const names = Object.keys(screens) as ScreenName[];
function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function element(name: ScreenName) {
  const path = name === "salesEvent" ? "/fixture/:groupId/:eventId" : "/fixture/:groupId/:id";
  return <MemoryRouter initialEntries={["/fixture/event/event"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path={path} element={screens[name]()} /></Routes>
  </MemoryRouter>;
}
async function openScreen(name: ScreenName) {
  // EventDetail uses :id, SalesBIEvent uses :eventId; give each its canonical route parameter.
  const view = render(element(name));
  if (name === "sponsorImport") {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Fixture P1k"], ["Estado", "Patrocinador", "Confirmado", "Pipe"],
      ["Fatura recebida", "Patrocinador sintético", 1234.56],
      ["Fatura enviada", "Pendente sintético", 200.25],
      ["", "Proposto sintético", null, 300.75],
    ]), "Pipe");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const file = new File([], "fixture.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
    await act(async () => { fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } }); });
    expect(screen.getByText("Resumo do ficheiro")).toBeInTheDocument();
  }
  return view;
}
function domHash() {
  // Only unstable React/Radix mount IDs are normalized; Intl whitespace is retained.
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1k: rede proibida"); }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  setCompany(); f.pdf = []; f.rows = [{ ...sponsor }];
  f.queries = {
    event_detail: event, event_transactions: [expense,
      { ...expense, id: "excluded", exclude_from_result: true, amount: 12.34 },
      { ...expense, id: "exclusive", event_settlement_id: "child", amount: 23.45 }],
    "event-cost-basis": { cost_expense_source: "realized", cost_include_overhead: true, partner_calc_basis: event.partner_calc_basis },
    "fecho-event-info": { partner_calc_basis: event.partner_calc_basis }, "fecho-transactions": [expense],
    "fecho-overheads": [{ ...expense, id: "overhead", amount: 10, description: "Overhead sintético" }],
    "fecho-partners": [{ id: "partner", percentage: 50, suppliers: { name: "Sócio sintético" } }],
    "fecho-paid-by-partners": [{ partner_id: "partner", transactions: { amount: 20, iva_rate: 23 } }],
    "fecho-partner-extras": [], "fecho-operational-forecasts": [expense],
    sales_position: [position], sales_position_by_provider: [{ ...position, provider: "synthetic", sort_order: 1 }],
    sales_last_sync: "2026-11-03T11:00:00Z", "bi-sales-position": [position], "bi-sales-series": series,
    "event-iva-rates": [{ iva_rate: 23, event_ticket_zones: { event_id: "event" } }],
    "event-iva-parents": [{ id: "event", parent_event_id: null }],
    "bi-detail-series": series, "bi-detail-events": [event], "bi-detail-zone-caps": new Map(),
    "bi-event": event, "bi-event-zones": [{ id: "zone", name: "03/12/2026 20:00", total_capacity: 100, on_sale: true }],
    "bi-event-sales": [{ zone_id: "zone", quantity: 10, total_value: 1234.56, notes: "Fixture • Sintético" }],
    "supplier-credits-summary": { total: 1234.56, suppliers: 1 },
    "aging-transactions": [expense], "concentration-txs": [expense],
    "report-suppliers": [{ id: "supplier", name: "Fornecedor sintético", nif: "123456789", is_active: true, category: "Teste" }],
    "report-suppliers-transactions": [expense, { ...expense, id: "paid", amount: 20, paid_amount: 20, status: "paid" }],
    "revenue-mix-events": [event], "revenue-mix-accounts": [{ id: "account", name: "Receita sintética" }],
    "revenue-mix-txs": [{ ...expense, type: "income" }],
    "pendency-txs": [{ ...expense, category_id: null }, { ...expense, id: "paid", status: "paid" },
      { ...expense, id: "pending", status: "pending" }],
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P1k — baseline PT capturada antes de alterar os 14 ficheiros", () => {
  it("fixa SHA-256 do DOM com montantes, detalhes e pré-visualização visíveis", async () => {
    const hashes: Partial<Record<ScreenName, string>> = {};
    for (const name of names) {
      await openScreen(name);
      expect(document.body.textContent, name).toContain("€");
      hashes[name] = domHash();
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "aging": "7d56890f6e4fbc74ae2064e8237e5187c992e7a78b5846c78cccb3b86063c9ad",
        "concentration": "324860aa6ebd10859b2c61f930b2d1e9b2c3147f3dc02aca9364e98a09de3e8f",
        "credits": "47d198ce59656298cca62f822c52dbdd157fab19702c4d60b9de52ce149a9156",
        "event": "21d55506d118cfc7af17903a4430c594844320d9d121549394f863120924e7d1",
        "fecho": "d12707dd1732e4029a7784554cd6fc9c86bdc96e8e93932aab22d461c825f4b0",
        "pendency": "5007cf90e09446923feecbeea974e5c819877031a3a53743f263e0ae245b4814",
        "position": "7a0d5b73531356d6b860b67409c044a1d5fbc52c425605440ad55701063e2756",
        "revenue": "9edc899f5465e1748793c33af149bd1e55cee1d708c1ae1e45cbcf4d734042ba",
        "sales": "ee57ff70e90506e4a1692b513c34fbe9e4b1f6599277917afebd42ab11ab5a45",
        "salesDetail": "8ea6118a4932bd9dbb12a2f40f3bf73a3dce6cbbcfb61c0025353964cd79dbc7",
        "salesEvent": "8d73db841e588a0a77dfadeba3e2a50213476b954a8672fe522256508b03ac75",
        "sponsorImport": "de8c66829a68b436de1a51b8e452ed02a66226a76d38ce2f943177b7dbcf429f",
        "sponsorship": "f59bf2629c5b1416340403d63999f998855d00fa5141e0f26d39b5abce80557e",
        "suppliers": "7b3908d21d30277b604286947dbaec6775955d90b3d48d5f75970c70a8c39cfe",
      }
    `);
  });
  it("fixa os montantes PT das quatro tabelas do PDF do Fecho", async () => {
    await openScreen("fecho");
    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    expect(f.pdf).toHaveLength(4);
    const tables = f.pdf.map(table => {
      const { body, foot } = table as { body: unknown; foot?: unknown };
      return { body, foot };
    });
    expect(tables).toMatchInlineSnapshot(`
      [
        {
          "body": [
            [
              "Receita",
              "2.460,00 €",
            ],
            [
              "Despesas operacionais (s/ overhead)",
              "1.518,51 €",
            ],
            [
              "Resultado s/ overhead",
              "941,49 €",
            ],
          ],
          "foot": undefined,
        },
        {
          "body": [
            [
              "Overhead sintético",
              "Despesa",
              "10,00 €",
              "23%",
              "12,30 €",
            ],
          ],
          "foot": [
            [
              "Total líquido overhead",
              "",
              "",
              "",
              "-12,30 €",
            ],
          ],
        },
        {
          "body": [
            [
              "Despesas totais (operacionais + overhead)",
              "1.530,81 €",
            ],
            [
              "Resultado s/ overhead",
              "941,49 €",
            ],
            [
              "Overhead líquido",
              "-12,30 €",
            ],
            [
              "Resultado c/ overhead",
              "929,19 €",
            ],
          ],
          "foot": undefined,
        },
        {
          "body": [
            [
              "Sócio sintético",
              "c/IVA",
              "50%",
              "234,60 €",
              "24,60 €",
              "0,00 €",
              "0,00 €",
              "259,20 €",
            ],
          ],
          "foot": undefined,
        },
      ]
    `);
  });
});

describe("#498 P1k — moeda da empresa activa", () => {
  const brTexts: Record<ScreenName, string[]> = {
    event: ["R$\u00a01.234,56", "Base do contrato (fecho): R$\u00a01.200,00", "R$\u00a015,18", "R$\u00a023,45"],
    sponsorship: ["R$\u00a01.235"],
    sponsorImport: ["R$\u00a01.235", "R$\u00a0200", "R$\u00a0301", "R$\u00a01.736"],
    fecho: ["R$\u00a02.460,00", "Despesas totais (operacionais + overhead): R$\u00a01.530,81", "-R$\u00a012,30", "R$\u00a0259,20"],
    position: ["R$\u00a01.235", "R$\u00a0864", "R$\u00a0123", "R$\u00a0370"],
    sales: ["R$\u00a0123,46 /dia", "R$\u00a01.234,56"],
    salesDetail: ["R$\u00a01.728,38"],
    salesEvent: ["R$\u00a01.234,56", "R$\u00a0123,46"],
    credits: ["R$\u00a01.234,56", "em 1 fornecedor"],
    aging: ["R$\u00a01.234,56"],
    concentration: ["R$\u00a01.234,56"],
    suppliers: ["R$\u00a01.254,56", "R$\u00a020,00", "R$\u00a01.234,56"],
    revenue: ["R$\u00a01.234,56"],
    pendency: ["R$\u00a01.234,56"],
  };

  it.each(names)("BR: %s apresenta R$ e nenhum Euro no DOM", async name => {
    setCompany("BR", "BRL");
    f.rows = [{ ...sponsor, currency: "BRL" }];
    const view = await openScreen(name);
    for (const text of brTexts[name]) expect(document.body.textContent).toContain(text);
    expect(document.body.innerHTML).not.toContain("€");
    if (name === "position" || name === "sponsorImport") {
      expect(document.body.textContent).not.toMatch(/R\$\s*[\d.]+,\d{2}/);
    }
    if (name === "sponsorship") {
      expect(view.container.querySelector('.grid p.text-lg')?.textContent).toBe("1");
      expect(screen.getByText("Confirmado real").nextElementSibling?.textContent).toBe("R$\u00a01.235");
      expect(screen.getAllByText("R$\u00a01.235", { normalizer: text => text })).toHaveLength(2); // KPI + column total
    }
    if (name === "aging" || name === "revenue") {
      expect(screen.getByTestId("money-tooltip").textContent).toBe("R$\u00a01.234,56");
    }
    if (name === "pendency") expect(screen.getAllByText("R$\u00a01.234,56", { normalizer: text => text })).toHaveLength(3);
    if (name === "event") {
      expect(screen.getByText("Resultado do evento (antes de impostos)").parentElement?.parentElement?.textContent)
        .toContain("R$\u00a01.234,56");
      expect(screen.getByText("Fora do resultado")).toBeInTheDocument();
      expect(screen.getByText("Exclusivos de fechamentos")).toBeInTheDocument();
    }
  });

  it.each(names)("%s reage a PT → BR → PT sem alterar o DOM PT", async name => {
    const view = await openScreen(name);
    const ptHash = domHash();
    setCompany("BR", "BRL"); f.rows = [{ ...sponsor, currency: "BRL" }];
    view.rerender(element(name));
    expect(document.body.innerHTML).not.toContain("€");
    for (const text of brTexts[name]) expect(document.body.textContent).toContain(text);
    setCompany(); f.rows = [{ ...sponsor }];
    view.rerender(element(name));
    expect(domHash()).toBe(ptHash);
  });

  it.each([
    [null, "EUR", {}], ["BR", "BRL", { isLoading: true }],
    ["BR", "BRL", { isError: true, error: new Error("synthetic") }], ["BR", "", {}],
  ] as const)("contexto indisponível (%s/%s/%j): agregados —, sem moeda presumida", async (country, currency, overrides) => {
    for (const name of names) {
      // Row currency is explicit and intentionally independent of company aggregates.
      f.rows = [];
      setCompany(country, currency, overrides);
      await openScreen(name);
      expect(document.body.textContent, name).toContain("—");
      expect(document.body.innerHTML, name).not.toMatch(/€|R\$/);
      cleanup();
    }
  });

  it("o pipeline preserva a moeda explícita das linhas e usa a empresa apenas nos agregados", async () => {
    setCompany("BR", "BRL");
    f.rows = [{ ...sponsor }];
    await openScreen("sponsorship");
    const explicit = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(1234.56);
    expect(screen.getByText(explicit, { normalizer: text => text })).toBeInTheDocument();
    expect(screen.getByText("Confirmado real").nextElementSibling?.textContent).toBe("R$\u00a01.235");
    setCompany(null); cleanup();
    await openScreen("sponsorship");
    expect(screen.getByText(explicit, { normalizer: text => text })).toBeInTheDocument();
    expect(screen.getByText("Confirmado real").nextElementSibling?.textContent).toBe("—");
  });

  it("usa companies.currency mesmo com locale PT e moeda BRL", async () => {
    setCompany("PT", "BRL");
    await openScreen("credits");
    expect(document.body.textContent).toContain("1234,56\u00a0R$");
    expect(document.body.innerHTML).not.toContain("€");
  });

  it("o PDF do Fecho formata síntese, overhead e acerto em BRL sem alterar montantes", async () => {
    setCompany("BR", "BRL");
    await openScreen("fecho");
    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    expect(f.pdf).toHaveLength(4);
    const tables = f.pdf as { body: string[][]; foot?: string[][] }[];
    expect(tables[0].body).toEqual([
      ["Receita", "R$\u00a02.460,00"], ["Despesas operacionais (s/ overhead)", "R$\u00a01.518,51"],
      ["Resultado s/ overhead", "R$\u00a0941,49"],
    ]);
    expect(tables[1].body).toEqual([["Overhead sintético", "Despesa", "R$\u00a010,00", "23%", "R$\u00a012,30"]]);
    expect(tables[1].foot?.[0].at(-1)).toBe("-R$\u00a012,30");
    expect(tables[2].body[0]).toEqual(["Despesas totais (operacionais + overhead)", "R$\u00a01.530,81"]);
    expect(tables[3].body[0]).toEqual(["Sócio sintético", "c/IVA", "50%", "R$\u00a0234,60", "R$\u00a024,60", "R$\u00a00,00", "R$\u00a00,00", "R$\u00a0259,20"]);
    expect(JSON.stringify(tables)).not.toContain("€");
  });

  it.each([null, "BR"])("PDF sem contexto utilizável (%s) apresenta — em todas as células monetárias", async country => {
    setCompany(country, "BRL", { isLoading: true });
    await openScreen("fecho");
    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    const tables = f.pdf as { body: string[][] }[];
    expect(tables[0].body.map(row => row[1])).toEqual(["—", "—", "—"]);
    expect(tables[1].body[0].filter(value => value === "—")).toHaveLength(2);
    expect(tables[2].body.map(row => row[1])).toEqual(["—", "—", "—", "—"]);
    expect(tables[3].body[0].slice(3)).toEqual(["—", "—", "—", "—", "—"]);
    expect(JSON.stringify(tables)).not.toMatch(/€|R\$/);
  });

  it("os 14 ficheiros consomem useCompanyLocale e confinam o legado ao ramo PT/EUR", () => {
    for (const file of ["pages/EventDetail.tsx", "components/sponsorship/SponsorshipPipelineBoard.tsx",
      "components/sponsorship/SponsorshipPipelineImportModal.tsx", "components/EventFecho.tsx", "components/SalesPositionWidget.tsx",
      "pages/SalesBI.tsx", "pages/SalesBIDetail.tsx", "pages/SalesBIEvent.tsx",
      "components/supplier-credits/SupplierCreditsSummaryCard.tsx", "components/ReportAging.tsx",
      "components/ReportSupplierConcentration.tsx", "pages/ReportSuppliersPage.tsx", "components/ReportRevenueMix.tsx", "components/ReportPendencyIndex.tsx"]) {
      const source = readFileSync(`src/${file}`, "utf8");
      expect(source, file).toContain("useCompanyLocale()");
      expect(source, file).toContain("formatMoney");
      expect(source, file).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
      expect(source, file).not.toMatch(/import\s*\{\s*formatCurrency\s*[,}]/);
      if (source.includes("formatLegacyCurrency")) {
        expect(source).toContain("formatCurrency as formatLegacyCurrency");
        expect(source.match(/formatLegacyCurrency\(/g)).toHaveLength(1);
        expect(source).toMatch(/companyLocale\.locale === "pt-PT" && companyLocale\.currency === "EUR"\s*\? formatLegacyCurrency\(v\)/);
      }
    }
  });
});
