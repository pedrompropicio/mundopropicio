import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany, type Company } from "@/hooks/useCompany";
import { ResultsAnalysis } from "@/components/ResultsAnalysis";
import EventABTab from "@/components/EventABTab";
import { ReimbursementNoteDetail } from "@/components/ReimbursementNoteDetail";
import { PartnerCapitalPanel } from "@/components/PartnerCapitalPanel";
import { PartnerPaymentDialog } from "@/components/PartnerPaymentDialog";
import PartnerCurrentAccountTab from "@/components/PartnerCurrentAccountTab";
import { PartnerPaidExpensesPanel } from "@/components/PartnerPaidExpensesPanel";
import EventSimulator from "@/pages/EventSimulator";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return { queries: {} as Record<string, unknown>, qc: { invalidateQueries: vi.fn() } };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Only synthetic reads: neither queryFn nor mutationFn may execute.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: f.queries[String(queryKey[0])], isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useQueryClient: () => f.qc,
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: new Proxy({}, { get: () => { throw new Error("#498 P1g: serviço MP proibido"); } }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user" }, role: "admin", isAdmin: true, isManager: false, hasPermission: () => true,
}) }));
vi.mock("@/hooks/useMasterRevenueSplit", () => ({ useMasterRevenueSplit: () => ({ forecastSlices: [], transactionSlices: [] }) }));
vi.mock("@/hooks/useEventRootSettlements", () => ({ useEventRootSettlements: () => ({ data: { rootIds: new Set() } }) }));
vi.mock("@/hooks/useEventSettlementEngine", () => ({ useEventSettlementEngine: () => ({ result: null, isLoading: false }) }));
vi.mock("@/hooks/useCitySimulator", () => ({ useCitySimulator: () => ({ sessions: [] }) }));
vi.mock("@/hooks/useEventABScenarios", () => ({ useEventABScenarios: () => ({ hasConfig: false, totals: null }) }));
vi.mock("@/lib/simulator-prior-curve", () => ({ usePriorCurve: () => ({ data: null }) }));
// Leaves outside this dispatch retain their own tests and currency workstreams.
vi.mock("@/components/EventABRealizedSection", () => ({ default: () => null }));
vi.mock("@/components/EventABAttachmentsSection", () => ({ default: () => null }));
vi.mock("@/components/simulator/ExecutiveDashboard", () => ({ default: () => null }));
vi.mock("@/components/simulator/PriorCurveSelector", () => ({ PriorCurveSelector: () => null }));
vi.mock("@/components/simulator/ForecastBoostCalibrator", () => ({ ForecastBoostCalibrator: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/TransactionEditModal", () => ({ TransactionEditModal: () => null }));
vi.mock("@/components/TransactionAttachmentsModal", () => ({ TransactionAttachmentsModal: () => null }));

const noop = () => {};
const event = { id: "fixture-event", name: "Evento sintético", date: "2026-01-02", status: "completed", event_type: "simple", partner_calc_basis: "sem_iva" };
const partner = { id: "fixture-partner", supplier_id: "fixture-supplier", percentage: 50, suppliers: { name: "Sócio sintético" } };
const tx = { id: "fixture-tx", event_id: event.id, description: "Despesa sintética", amount: 1234.56, iva_rate: 0,
  type: "expense", status: "approved", date: "2026-01-02", paid_amount: 0, events: { name: event.name }, account_categories: { code: "2.1.1", name: "Categoria sintética" } };
const cfg = { event_id: event.id, default_drink_avg_ticket: 1234.56, default_food_avg_ticket: 12.34,
  ab_drink_passthrough_pct: 65, ab_food_passthrough_pct: 75, sponsorship_revenue: 1234.56,
  souvenir_revenue: 0, souvenir_cost: 0, bonif_bebidas: 0, ponto_vendido: 0,
  prior_year_tickets: 1234.56, prior_year_drink: 0, prior_year_food: 0, prior_year_sponsor: 0,
  prior_year_souvenir: 0, prior_year_other: 0, ticket_iva_pct: 6, combo_lot_keywords: "", sponsor_category_l2_id: null,
  forecast_final_accel: 1, forecast_final_window_days: 7 };
const screens = {
  results: () => <ResultsAnalysis />,
  ab: () => <EventABTab eventId={event.id} />,
  reimbursement: () => <ReimbursementNoteDetail noteId="fixture-note" onBack={noop} />,
  capital: () => <PartnerCapitalPanel eventId={event.id} />,
  payment: () => <PartnerPaymentDialog open onOpenChange={noop} eventId={event.id} participantId={partner.id} supplierId={partner.supplier_id} partnerName="Sócio sintético" />,
  currentAccount: () => <PartnerCurrentAccountTab />,
  paidExpenses: () => <PartnerPaidExpensesPanel eventId={event.id} eventStatus="active" />,
  simulator: () => <EventSimulator />,
};
type ScreenName = keyof typeof screens;
function element(name: ScreenName) {
  return <MemoryRouter initialEntries={[`/sim/${event.id}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/sim/:id" element={screens[name]()} /></Routes>
  </MemoryRouter>;
}
function setCompany(country: string | null = "PT", currency = "EUR", overrides: Partial<ReturnType<typeof useCompany>> = {}) {
  const company = country === null ? null : { id: "fixture-company", country, currency } as Company;
  vi.mocked(useCompany).mockReturnValue({ company, companyId: company?.id ?? null, isLoading: false, isError: false,
    error: null, isPlatformAdmin: false, refetch: vi.fn(), ...overrides });
}
function openScreen(name: ScreenName) {
  const view = render(element(name));
  if (name === "payment") fireEvent.click(screen.getByRole("button", { name: "Novo contrato" }));
  if (name === "currentAccount") {
    for (const button of view.container.querySelectorAll(".glass > button")) fireEvent.click(button);
  }
  return view;
}
function domHash() {
  // Only generated React/Radix IDs are canonicalised; Intl spaces are untouched.
  const dom = document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:");
  return createHash("sha256").update(dom).digest("hex");
}
function visitSimulatorTabs(check: () => void) {
  for (const value of ["dashboard", "sessions", "daily", "revenue", "sponsors", "costs", "iva", "result", "config"]) {
    fireEvent.mouseDown(document.querySelector(`[role="tab"][id$="trigger-${value}"]`)!, { button: 0, ctrlKey: false });
    check();
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1g: rede proibida"); }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  setCompany();
  f.queries = {
    ra_events: [event], ra_transactions_v5_no_transitory: [{ ...tx, type: "income" }], ra_root_settlements: new Set(),
    "reimbursement-note": { id: "fixture-note", code: "TEST-498", employee_name: "Pessoa sintética", status: "draft", created_at: "2026-01-02T12:00:00Z" },
    "reimbursement-note-items": [{ id: "fixture-item", transaction_id: tx.id, transactions: tx }],
    "reimbursement-item-docs": [{ transaction_id: tx.id, is_accounting: true }],
    "event-settlement-participants-capital": [partner],
    "partner-capital-txs": [{ ...tx, type: "income", account_categories: { code: "10.1.1", name: "Aporte" } }],
    "partner-capital-moves": [{ id: "fixture-move", transaction_id: tx.id, partner_id: partner.id, kind: "aporte", flow: "event_cash" }],
    "partner-payment-participant": { frozen_at: "2026-01-02", frozen_values: { share_amount: 1234.56, origin: {
      parent_quota: 1234.56, vat_returned_in: 0, addback_in: 0, additional_actives_total: 0, additional_actives: [],
      exclusive_revenue: 0, expenses_in_perimeter: 0, result_basis_gross: true, result_amount: 1234.56,
    } } },
    "partner-contract-status": { contracted: 1234.56, paid: 0, missing: 1234.56, remaining: 1234.56, contracts: [], free_advances: [] },
    "partner-payment-suppliers": [{ id: partner.supplier_id, name: partner.suppliers.name }],
    "partner-current-account": { withdrawals: [{ id: tx.id, date: tx.date, amount: 1234.56, description: tx.description }],
      payroll: [{ id: "fixture-payroll", date: tx.date, amount: 12.34, description: "Salário sintético" }],
      invoices: [{ id: "fixture-invoice", invoice_date: tx.date, amount: 12.34, supplier_name: "Fornecedor sintético", invoice_number: "TEST-498" }] },
    "event-partners": [partner], "event-partner-calc-basis": { partner_calc_basis: "sem_iva" },
    "event-tree-names": new Map([[event.id, event.name]]),
    "partner-paid-expenses-tree": [{ id: "fixture-paid", partner_id: partner.id, status: "approved", transactions: tx }],
    ab_zones: [{ id: "fixture-zone", zone_label: "Pista", participants_manual: 1, per_capita_bebidas: 1234.56, repasse_bebidas_pct: 100 }],
    ab_config: { fee_alimentos: 0, repasse_alimentos_pct: 0, per_capita_alimentos: 0 },
    ab_real_participants_v2: {}, ab_lots_capacity: {},
    event, "sim-coala-cfg": cfg, "sim-coala-inputs": [], "sim-coala-costs": [],
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.useRealTimers());

describe("#498 P1g — baseline PT anterior à alteração dos oito ecrãs", () => {
  it("fixa SHA-256 do DOM, incluindo todos os separadores do simulador", () => {
    const hashes: Record<string, string | string[]> = {};
    for (const name of Object.keys(screens) as ScreenName[]) {
      openScreen(name);
      if (name === "simulator") {
        const tabs: string[] = [];
        visitSimulatorTabs(() => tabs.push(domHash()));
        hashes[name] = tabs;
      } else hashes[name] = domHash();
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "ab": "0d4348b41db7464019e2cca174a4947690b9cab12bf46cd9b0512113bbc110bc",
        "capital": "57aa1be427bd5719d0d7504937da9afe1b6f76de3703327806e2191b8f06ed04",
        "currentAccount": "563eabfaa84ade4c41312ec511f774d321916b48879a88ef39a949fe2f7207a8",
        "paidExpenses": "d2a539cc74e61aa369f37d3911c057c67c5f8203b9f63959fc274bc765e3b6c6",
        "payment": "d4594f8aee9cb29ecd72829251f7bbbe64a4d5ce6475c77e546f8d7fe1262c99",
        "reimbursement": "56c8e4dcec693c8d400cef04fb20e1ca501e4001b577006e52ac559c9d9490da",
        "results": "5b63d6fe9ae1f4bf728dd54fe4cf0a236bb73a1129b3d7429d199b99b7aaa2f7",
        "simulator": [
          "febece0f7fae9f72b7c6c903d999bcd94a29e6a480fcf8854f2e40798a71604a",
          "5144e09f56b251c5c30d3ab0e3d814f96344ec8d08d50780c848884d10f06795",
          "d8d3d405a7144c0a4edfbd9c689b7ee4b2e308409c1284873f439281bb595492",
          "9a0f6eff6619c53b4ec61a716ec689472b2fd3d05088cf92dc6395bb6acd9265",
          "1c34acf1e83bc51c20d110fd83d26309b7fac40758208ac3ca4edd9d00938434",
          "4a09349fd091cea0108e560d92c7cbe61a2ecadc39208777cfba1502ac49d58b",
          "d1dbc56f7abbde02eb98d2679acd3e2c8ad1283a84a099463aef3118120811a0",
          "9b599a422744df616eb3968fb125ca50b8fa34f82dbc577b1c859b34d9a8c3f3",
          "fd71cb5567c28c67a592030d7acc6d4cc3043592c22b37fcbd4ec3defb158d99",
        ],
      }
    `);
  });
});

describe("#498 P1g — apresentação monetária por empresa", () => {
  it.each(Object.keys(screens) as ScreenName[])("BR: %s mostra R$ 1.234,56 e nenhum Euro", name => {
    setCompany("BR", "BRL");
    openScreen(name);
    const check = () => {
      expect(document.body.textContent).toContain("R$\u00a01.234,56");
      expect(document.body.innerHTML).not.toContain("€");
    };
    if (name === "simulator") {
      visitSimulatorTabs(check);
      expect(screen.getByText("TM Bebida (R$)")).toBeInTheDocument();
      expect(screen.getByText("TM Bebida (R$)").parentElement!.querySelector("input")).toHaveValue("R$\u00a01.234,56");
    } else check();
    if (name === "ab") {
      expect(screen.getByText("Facturação real (R$)")).toBeInTheDocument();
      expect(screen.getByText("Per capita faturação (operador) (R$/pessoa)")).toBeInTheDocument();
      expect(screen.getByText("Fee fixo (R$)")).toBeInTheDocument();
    }
    if (name === "payment") expect(screen.getByText("Valor bruto (R$) *")).toBeInTheDocument();
  });

  it.each(Object.keys(screens) as ScreenName[])("%s acompanha PT → BR → PT sem alterar o DOM PT", name => {
    const view = openScreen(name);
    const pt = domHash();
    setCompany("BR", "BRL");
    view.rerender(element(name));
    expect(document.body.textContent).toContain("R$\u00a01.234,56");
    expect(document.body.innerHTML).not.toContain("€");
    setCompany();
    view.rerender(element(name));
    expect(domHash()).toBe(pt);
  });

  it.each([
    [null, "EUR", {}], ["BR", "", {}],
    ["BR", "BRL", { isLoading: true }],
    ["BR", "BRL", { isError: true, error: new Error("synthetic error") }],
  ] as const)("contexto indisponível %s/%s/%j mostra — e rótulos PT", (country, currency, overrides) => {
    for (const name of Object.keys(screens) as ScreenName[]) {
      setCompany("BR", "BRL");
      const view = openScreen(name);
      setCompany(country, currency, overrides);
      view.rerender(element(name));
      const check = () => {
        expect(document.body.innerHTML).not.toMatch(/R\$|[\d,.]+[,.]\d{2}(?:\s|&nbsp;)*€/);
        expect(document.body.textContent).toContain("—");
      };
      if (name === "simulator") {
        visitSimulatorTabs(check);
        expect(screen.getByText("TM Bebida (€)")).toBeInTheDocument();
      } else check();
      if (name === "ab") expect(screen.getByText("Fee fixo (€)")).toBeInTheDocument();
      if (name === "payment") expect(screen.getByText("Valor bruto (€) *")).toBeInTheDocument();
      cleanup();
    }
  });

  it("conserva os espaços Intl pt-PT/EUR do A&B", () => {
    openScreen("ab");
    const intl = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(1234.56);
    expect(document.body.textContent).toContain(intl);
    expect(intl).toBe("1234,56\u00a0€");
  });

  it("mantém contagens e percentagens do simulador e não introduz formatters monetários de módulo", () => {
    const files = (Object.keys(screens) as ScreenName[]).map(name => ({
      results: "src/components/ResultsAnalysis.tsx", ab: "src/components/EventABTab.tsx",
      reimbursement: "src/components/ReimbursementNoteDetail.tsx", capital: "src/components/PartnerCapitalPanel.tsx",
      payment: "src/components/PartnerPaymentDialog.tsx", currentAccount: "src/components/PartnerCurrentAccountTab.tsx",
      paidExpenses: "src/components/PartnerPaidExpensesPanel.tsx", simulator: "src/pages/EventSimulator.tsx",
    })[name]);
    for (const file of files) {
      const source = readFileSync(file!, "utf8");
      expect(source).not.toMatch(/if\s*\(\s*country/);
      expect(source).not.toMatch(/^const (?:fmtEUR|fmt|formatCurrency)\s*=/m);
    }
    const simulator = readFileSync("src/pages/EventSimulator.tsx", "utf8");
    expect(simulator).toContain('const fmtNum = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString("pt-PT", { maximumFractionDigits: 0 });');
    expect(simulator).toContain('const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;');
  });
});
