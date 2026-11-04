import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { useEffect, type ReactNode } from "react";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EventDetail from "@/pages/EventDetail";
import Suppliers from "@/pages/Suppliers";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { useEventContractResult, type ContractPerimeterInput } from "@/hooks/useEventContractResult";
import { computeEventContractResult } from "@/lib/event-contract-result";

const f = vi.hoisted(() => ({
  country: "PT" as string | null, currency: "EUR", loading: false, error: false,
  queries: {} as Record<string, unknown>, writes: [] as Record<string, unknown>[],
  income: { net: 2000, gross: 2460, mode: "realized" } as ContractPerimeterInput,
  expense: { net: 1000, gross: 1230, mode: "realized" } as ContractPerimeterInput,
  vatViews: { revenue: false, expense: true },
  slices: { forecastSlices: [], transactionSlices: [], warnings: [] },
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: f.country === null ? null : { country: f.country, currency: f.currency },
  companyId: "fixture-company", isLoading: f.loading, isError: f.error,
}) }));
// Reads use fixtures; only supplier updates execute against an in-memory recorder.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => ({
    data: f.queries[String(queryKey[0])], isLoading: false, isPending: false, isError: false,
  }),
  useMutation: (options: { mutationFn: (value: unknown) => Promise<unknown> }) => ({
    mutate: (value: unknown) => options.mutationFn(value), isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), refetchQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (table !== "suppliers") throw new Error(`#585: unexpected table ${table}`);
    return { update: (payload: Record<string, unknown>) => ({ eq: async (_key: string, id: string) => {
      f.writes.push({ id, ...payload }); return { error: null };
    } }) };
  },
  rpc: () => { throw new Error("#585: unexpected RPC"); },
} }));
vi.mock("@/hooks/useFechoBasis", () => ({ useFechoBasis: () => ({
  includeOverhead: false, expenseSource: "realized", isLoading: false,
}) }));
vi.mock("@/hooks/useMasterRevenueSplit", () => ({
  useMasterRevenueSlicesFor: () => ({ slices: f.slices, isPending: false }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getAuditUser: () => "fixture" }));
vi.mock("@/components/SupplierPortalUserLink", () => ({ SupplierPortalUserLink: () => null }));
vi.mock("@/components/SupplierTransactions", () => ({ SupplierTransactions: () => null }));
vi.mock("@/components/SupplierCreditsPanel", () => ({ SupplierCreditsPanel: () => null }));
vi.mock("@/components/supplier-credits/SupplierCreditsTab", () => ({ SupplierCreditsTab: () => null }));
vi.mock("@/components/sponsorship/SponsorshipPipelineBoard", () => ({ SponsorshipPipelineBoard: () => null }));
vi.mock("@/components/EventFecho", () => ({ EventFecho: () => null }));
vi.mock("recharts", () => ({
  PieChart: () => null, Pie: () => null, Cell: () => null, ResponsiveContainer: () => null, Tooltip: () => null,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  isAdmin: true, isManager: false, user: { id: "fixture-user" }, role: "admin", hasPermission: () => true,
}) }));
vi.mock("@/hooks/useEventFinancialsRealtime", () => ({ useEventFinancialsRealtime: () => {} }));
vi.mock("@/hooks/useEventStages", () => ({ useEventStage: () => ({ data: undefined }) }));
vi.mock("@/hooks/useEventHouseLabel", () => ({ useEventHouseLabel: () => "MP" }));
vi.mock("@/hooks/useEventCacheImpact", () => ({ useEventCacheImpact: () => ({ cacheImpact: 0 }) }));
vi.mock("@/hooks/useEventRootSettlements", () => ({ useEventRootSettlements: () => ({
  data: { rootIds: new Set(["root"]), nameById: { child: "Fechamento sintético" } },
}) }));
vi.mock("@/hooks/useEventRevenueBasis", () => ({ useEventRevenueBasis: () => ({ data: {
  real: { hasTicketSales: true, ticket: { gross: 2460, net: 2000 }, incomeTx: [] },
} }) }));
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
// Unrelated event tabs are isolated; EventDetail, its result hook and StatCard remain real.
vi.mock("@/components/EntityDocumentsSection", () => ({ default: () => null }));
vi.mock("@/components/EventFinancialCard", () => ({ EventFinancialCard: ({ kind, onPerimeterChange, onVatViewChange }: {
  kind: "income" | "expense";
  onPerimeterChange: (value: ContractPerimeterInput) => void;
  onVatViewChange: (value: boolean) => void;
}) => {
  useEffect(() => {
    onPerimeterChange(kind === "income" ? f.income : f.expense);
    onVatViewChange(kind === "income" ? f.vatViews.revenue : f.vatViews.expense);
  }, [kind, onPerimeterChange, onVatViewChange]);
  return null;
} }));
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


const event = { id: "event", name: "Evento sintético", date: "2026-12-03", status: "active", event_type: "single",
  event_format: "single", company_id: "fixture-company", tickets_total: 100, partner_calc_basis: "net_result_gross_expenses" };
const supplier = { id: "supplier", name: "Fornecedor sintético", nif: "509123456" };
function eventView() {
  return <MemoryRouter initialEntries={["/events/event"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/events/:id" element={<EventDetail />} /></Routes>
  </MemoryRouter>;
}
function card() {
  return screen.getByText("Resultado do evento (antes de impostos)").closest(".glass")!;
}
function hash(html: string) {
  return createHash("sha256").update(html.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function form() { return <SupplierFormModal open onOpenChange={() => {}} editingSupplier={supplier} />; }
function submit() { fireEvent.submit(document.body.querySelector("form")!); }
function brDetails(value: string | null = "11222333000181", type: string | null = "cnpj") {
  f.queries["supplier-br-details"] = { available: true, details: {
    foreign_bank_accounts: [], tax_id_foreign: value, tax_id_type: type,
  } };
}
beforeEach(() => {
  f.country = "PT"; f.currency = "EUR"; f.loading = false; f.error = false; f.writes = [];
  f.income = { net: 2000, gross: 2460, mode: "realized" };
  f.expense = { net: 1000, gross: 1230, mode: "realized" };
  f.vatViews = { revenue: false, expense: true };
  f.queries = {
    event_detail: event, "event-settlement-engine-event": event, "event-settlement-engine-events": [event],
    "event-cost-basis": { cost_expense_source: "realized", cost_include_overhead: false },
  };
  brDetails();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#585: network forbidden"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#585: network forbidden"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#585: network forbidden"); } });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); cleanup(); vi.unstubAllGlobals();
});

describe("#585 P1o — hashes PT fixados antes das alterações de produção; não regenerar", () => {
  it("card real de EventDetail com hook e cálculo reais", () => {
    render(eventView());
    expect(card().textContent).toContain("Realizado · Receita s/IVA − Despesa c/IVA · margem 38.5%");
    expect(hash(card().outerHTML)).toMatchInlineSnapshot(`"52b3478d52c90f02264180dad40dd0fdba43a8dd83035317185ab839c0f59e2f"`);
  });
  it("pesquisa de Entidades PT", () => {
    render(<Suppliers />);
    expect(screen.getByPlaceholderText("Pesquisar por nome, NIF ou categoria...")).toBeInTheDocument();
    expect(hash(document.body.innerHTML)).toMatchInlineSnapshot(`"fd4d3f83760732dd09e6de62f3dc0bbded41c02277fdf0ce9404345a0a6e9048"`);
  });
  it("edição de fornecedor PT", () => {
    render(form());
    expect(screen.getByLabelText("NIF")).toHaveValue(supplier.nif);
    expect(hash(document.body.innerHTML)).toMatchInlineSnapshot(`"bcc24c74b8d40f99f42a831c18a1c4049402d7615a481ae2cafd7d77e54afe11"`);
  });
});

const totals = { revenueNet: 2000, revenueGross: 2460, expensesNet: 1000, expensesGross: 1230 };
const perimeterCases = [
  { perimeters: undefined, prefix: "", revenue: "", expense: "" },
  { perimeters: { revenue: "realized", expense: "realized" }, prefix: "Realizado · ", revenue: "", expense: "" },
  { perimeters: { revenue: "committed", expense: "committed" }, prefix: "Previsto + excedido · ", revenue: "", expense: "" },
  { perimeters: { revenue: "forecast", expense: "forecast" }, prefix: "Forecast · ", revenue: "", expense: "" },
  { perimeters: { revenue: "realized", expense: "forecast" }, prefix: "", revenue: " (Realizado)", expense: " (Forecast)" },
  { perimeters: { revenue: "committed", expense: "realized" }, prefix: "", revenue: " (Previsto + excedido)", expense: " (Realizado)" },
  { perimeters: { revenue: "custom", expense: "forecast" }, prefix: "", revenue: " (custom)", expense: " (Forecast)" },
  { perimeters: { revenue: "realized" }, prefix: "Realizado · ", revenue: "", expense: "" },
  { perimeters: { expense: "forecast" }, prefix: "", revenue: "", expense: "" },
];
const vatCases = [
  { revenue: false, expense: false }, { revenue: false, expense: true },
  { revenue: true, expense: false }, { revenue: true, expense: true },
];
describe("#585 P1o — legenda pura; sem alterações aos cálculos", () => {
  for (const vat of vatCases) {
    it.each(perimeterCases)(`PT/omissão: IVA ${vat.revenue}/${vat.expense}, perímetro $perimeters`, ({ perimeters, prefix, revenue, expense }) => {
      const result = computeEventContractResult(totals, vat, perimeters, 800, "net_result_gross_expenses");
      expect(result.label).toBe(`${prefix}Receita${revenue} ${vat.revenue ? "c/IVA" : "s/IVA"} − Despesa${expense} ${vat.expense ? "c/IVA" : "s/IVA"}`);
      expect(computeEventContractResult(totals, vat, perimeters, 800, "net_result_gross_expenses", {})).toEqual(result);
      expect(computeEventContractResult(totals, vat, perimeters, 800, "net_result_gross_expenses", { hasIva: true })).toEqual(result);
    });
    it.each(perimeterCases)(`BR: IVA ${vat.revenue}/${vat.expense}, perímetro $perimeters`, ({ perimeters, prefix, revenue, expense }) => {
      const legacy = computeEventContractResult(totals, vat, perimeters, 800, "net_result_gross_expenses");
      const result = computeEventContractResult(totals, vat, perimeters, 800, "net_result_gross_expenses", { hasIva: false });
      expect(result.label).toBe(`${prefix}Receita${revenue} − Despesa${expense}`);
      expect(result).toEqual({ ...legacy, label: result.label });
    });
  }
});

describe("#585 P1o — card real e mudança de empresa sem remontar", () => {
  it.each(vatCases)("BR retira só os sufixos fiscais ($revenue/$expense)", vat => {
    f.country = "BR"; f.currency = "BRL"; f.vatViews = vat;
    render(eventView());
    expect(card().textContent).toContain("Realizado · Receita − Despesa · margem");
    expect(card().textContent).not.toMatch(/[cs]\/IVA/);
    expect(card().textContent).toContain("R$");
  });
  it("hook PT → BR → PT recalcula a legenda mesmo com os outros argumentos estáveis", () => {
    const { result, rerender } = renderHook(() => useEventContractResult(
      "event", event.partner_calc_basis, f.income, f.expense, 0, f.vatViews,
    ));
    const pt = result.current.contract;
    expect(pt?.label).toBe("Realizado · Receita s/IVA − Despesa c/IVA");
    f.country = "BR"; f.currency = "BRL"; rerender();
    expect(result.current.contract).toEqual({ ...pt, label: "Realizado · Receita − Despesa" });
    f.country = "PT"; f.currency = "EUR"; rerender();
    expect(result.current.contract).toEqual(pt);
  });
  it("card PT → BR → PT conserva o hash PT", () => {
    const view = render(eventView());
    const before = hash(card().outerHTML);
    f.country = "BR"; f.currency = "BRL"; view.rerender(eventView());
    expect(card().textContent).not.toMatch(/[cs]\/IVA/);
    f.country = "PT"; f.currency = "EUR"; view.rerender(eventView());
    expect(hash(card().outerHTML)).toBe(before);
  });
});

describe("#585 P1o — pesquisa de Entidades", () => {
  it("PT → BR → PT usa labels.taxIdAny e conserva o DOM PT", () => {
    const view = render(<Suppliers />);
    const before = hash(document.body.innerHTML);
    f.country = "BR"; f.currency = "BRL"; view.rerender(<Suppliers />);
    expect(screen.getByPlaceholderText("Pesquisar por nome, CNPJ/CPF ou categoria...")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/NIF/)).toBeNull();
    f.country = "PT"; f.currency = "EUR"; view.rerender(<Suppliers />);
    expect(hash(document.body.innerHTML)).toBe(before);
  });
  it.each(["missing", "loading", "error", "currency"])("%s: fallback anterior no placeholder e na legenda", state => {
    f.country = state === "missing" ? null : "BR"; f.currency = state === "currency" ? "" : "BRL";
    f.loading = state === "loading"; f.error = state === "error";
    render(<Suppliers />);
    expect(screen.getByPlaceholderText("Pesquisar por nome, NIF ou categoria...")).toBeInTheDocument();
    const { result } = renderHook(() => useEventContractResult(
      "event", event.partner_calc_basis, f.income, f.expense, 0, f.vatViews,
    ));
    expect(result.current.contract?.label).toBe("Realizado · Receita s/IVA − Despesa c/IVA");
  });
});

describe("#585 P1o — apresentação fiscal BR e payload cru", () => {
  beforeEach(() => { f.country = "BR"; f.currency = "BRL"; });
  it.each([
    ["11222333000181", "cnpj", "11.222.333/0001-81"],
    ["12345678900", "cpf", "123.456.789-00"],
    ["11222333000181", null, "11.222.333/0001-81"],
    ["11.222.333/0001-81", "cnpj", "11.222.333/0001-81"],
    [null, "cnpj", ""], ["123", "cnpj", "123"], ["foreign-id", "other", "foreign-id"],
  ])("abre %s/%s como %s", (value, type, expected) => {
    brDetails(value, type); render(form());
    expect(screen.getByLabelText("CNPJ")).toHaveValue(expected);
    const data = f.queries["supplier-br-details"] as { details: { tax_id_foreign: unknown } };
    expect(data.details.tax_id_foreign).toBe(value);
  });
  it.each([
    ["11222333000181", "cnpj", "11.222.333/0001-81"],
    ["12345678900", "cpf", "123.456.789-00"],
  ])("guardar %s intacto depois de blur omite ambos os campos fiscais", async (value, type, masked) => {
    brDetails(value, type); render(form());
    const input = screen.getByLabelText("CNPJ");
    expect(input).toHaveValue(masked);
    fireEvent.blur(input); submit();
    await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0]).not.toHaveProperty("tax_id_foreign");
    expect(f.writes[0]).not.toHaveProperty("tax_id_type");
    expect(f.writes[0]).toMatchObject({ id: supplier.id, nif: supplier.nif });
  });
  it.each([
    ["cnpj", " 98765432000100 ", "98.765.432/0001-00", "98765432000100"],
    ["cpf", " 98765432100 ", "987.654.321-00", "98765432100"],
  ])("editar %s e sair mascara o input; guardar envia apenas dígitos", async (type, typed, masked, raw) => {
    brDetails(type === "cpf" ? "12345678900" : "11222333000181", type);
    render(form());
    const input = screen.getByLabelText("CNPJ");
    fireEvent.change(input, { target: { value: typed } });
    fireEvent.blur(input);
    expect(input).toHaveValue(masked);
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0]).toMatchObject({ tax_id_foreign: raw, tax_id_type: type, nif: supplier.nif });
  });
  it("digitar o valor original cru e sair não cria alteração fiscal", async () => {
    render(form());
    const input = screen.getByLabelText("CNPJ");
    fireEvent.change(input, { target: { value: "11222333000181" } }); fireEvent.blur(input);
    expect(input).toHaveValue("11.222.333/0001-81");
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0]).not.toHaveProperty("tax_id_foreign");
    expect(f.writes[0]).not.toHaveProperty("tax_id_type");
  });
  it("CPF seleccionado após digitar aplica a máscara no blur", async () => {
    render(form());
    const input = screen.getByLabelText("CNPJ");
    fireEvent.change(input, { target: { value: "12345678900" } });
    fireEvent.change(screen.getByLabelText("Tipo de identificador fiscal"), { target: { value: "cpf" } });
    fireEvent.blur(input); expect(input).toHaveValue("123.456.789-00");
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0]).toMatchObject({ tax_id_foreign: "12345678900", tax_id_type: "cpf" });
  });
});

it("os quatro ficheiros de produção não introduzem condições por country", () => {
  for (const file of ["lib/event-contract-result.ts", "hooks/useEventContractResult.ts", "pages/Suppliers.tsx", "components/SupplierFormModal.tsx"]) {
    expect(readFileSync(`src/${file}`, "utf8"), file).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
  }
});
