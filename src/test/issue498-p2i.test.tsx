import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { MemoryRouter } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, any>, writes: [] as { table: string; payload: any }[],
  mutations: [] as Promise<any>[], toast: vi.fn(), invoke: vi.fn(),
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "fixture@example.invalid" }, isAdmin: true, isManager: false, hasPermission: () => true,
}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({ data: f.queries[queryKey[0]], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: any) => ({
    isPending: false,
    mutate: (input: any) => {
      const result = Promise.resolve().then(() => options.mutationFn(input));
      f.mutations.push(result);
      result.catch(options.onError);
    },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: f.invoke },
  from: (table: string) => {
    const q: any = {
      insert: (payload: any) => { f.writes.push({ table, payload }); return q; },
      select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q,
      single: async () => ({ data: { id: "created" }, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return q;
  },
} }));
vi.mock("@/hooks/use-toast", () => ({ toast: f.toast, useToast: () => ({ toast: f.toast }) }));
vi.mock("@/hooks/useEventHouseLabel", () => ({ useEventHouseLabel: () => "Empresa" }));
vi.mock("@/components/AdminCostOverrideDialog", () => ({ useAdminWindowEvent: () => null, AdminCostOverrideDialog: () => null }));
vi.mock("@/hooks/useMasterCategoryDetection", () => ({ useMasterCategoryDetection: () => ({
  masterCategoryIds: [], getMasterForecastForCategory: () => null, shouldShowReinforcementDialog: () => false,
}) }));
vi.mock("@/components/TransactionDuplicateWarning", () => ({
  useTransactionDuplicateCheck: () => ({ needsConfirmation: false }), TransactionDuplicateWarning: () => null,
}));
vi.mock("@/components/SupplierFormModal", () => ({ SupplierFormModal: () => null }));
vi.mock("@/components/SplitByIvaModal", () => ({ SplitByIvaModal: () => null }));
vi.mock("@/components/LocalReinforcementDialog", () => ({ LocalReinforcementDialog: () => null }));
vi.mock("@/components/InvoiceGroupSuggestDialog", () => ({ default: () => null }));
vi.mock("@/lib/pdf-first-page-to-jpeg", () => ({ pdfFirstPageToJpeg: vi.fn() }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/ui/overlay-layer", async () => {
  const { forwardRef } = await import("react");
  return { OverlayLayer: forwardRef<HTMLDivElement, { children: React.ReactNode }>(
    ({ children }, ref) => <div ref={ref}>{children}</div>,
  ) };
});

vi.mock("@/components/AccountantReviewBadge", () => ({ AccountantReviewBlock: () => null }));

function company(country = "PT", currency = "EUR", overrides = {}) {
  vi.mocked(useCompany).mockReturnValue({
    company: { id: "company", country, currency }, companyId: "company", isLoading: false, isError: false, ...overrides,
  } as ReturnType<typeof useCompany>);
}
const defaults = { description: "Fixture", amount: "1000", date: "2026-11-02", supplier_id: "supplier" };
function modal(kind: "criação" | "edição", type: "expense" | "income" = "expense") {
  const currency = vi.mocked(useCompany)().company?.currency ?? "EUR";
  return kind === "criação"
    ? <TransactionFormModal onClose={() => {}} defaults={{ ...defaults, type }} />
    : <MemoryRouter><TransactionEditModal onClose={() => {}} canApprove transaction={{
        ...defaults, id: "transaction", amount: 1000, type, status: "pending", currency,
        event_id: null, category_id: null, account_id: null, iva_rate: 0,
        // Coherent legacy FX fixture: this dispatch does not change the edit currency path.
        original_amount: 5000, fx_rate: 0.2,
        is_transitory: false, is_confidential: false, is_reimbursement: false,
        excluded_from_partner_settlement: false, exclude_from_result: false, payment_method: "transfer",
        declared_withholding_rate: null, declared_withholding_amount: null,
      }} /></MemoryRouter>;
}
function expectPT() {
  expect(screen.getByText("Retenção IRS declarada na fatura")).toBeInTheDocument();
  expect(screen.getByText("Valor (€)")).toBeInTheDocument();
  expect(screen.getByText("Nº Fatura")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Ex: FT 002/5944")).toBeInTheDocument();
  expect(screen.queryByText("Nota Fiscal/Doc")).not.toBeInTheDocument();
}
function expectBR() {
  expect(screen.queryByText("Retenção IRS declarada na fatura")).not.toBeInTheDocument();
  expect(screen.queryByText("Valor (€)")).not.toBeInTheDocument();
  expect(screen.queryByText("Taxa (%)")).not.toBeInTheDocument();
  for (const rate of ["11,5%", "16,5%", "20%", "23%", "25%"]) {
    expect(screen.queryByRole("button", { name: rate })).not.toBeInTheDocument();
  }
  expect(screen.getByText("Nota Fiscal/Doc")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Ex: NF 12345")).toBeInTheDocument();
  expect(screen.queryByText("Nº Fatura")).not.toBeInTheDocument();
}
beforeEach(() => {
  vi.clearAllMocks(); company(); f.writes = []; f.mutations = [];
  f.queries = { "event-iva-country": ["Portugal"] };
  f.invoke.mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P2i: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#498 P2i: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#498 P2i: rede proibida"); } });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  cleanup(); vi.unstubAllGlobals();
});

describe.each(["criação", "edição"] as const)("#498 P2i — %s de transação", kind => {
  it("BR omite todo o bloco IRS e usa os textos de documento do locale", () => {
    company("BR", "BRL");
    render(modal(kind));
    expectBR();
    expect(screen.getByText(kind === "criação"
      ? "Transações com o mesmo nº de documento serão agrupadas automaticamente"
      : "Transações com o mesmo nº serão agrupadas")).toBeInTheDocument();
  });

  it.each(["PT", "ES"])("%s mantém o bloco IRS e os textos anteriores", country => {
    company(country, "EUR");
    render(modal(kind));
    expectPT();
    expect(screen.getByText(kind === "criação"
      ? "Transações com o mesmo nº de fatura serão agrupadas automaticamente"
      : "Transações com o mesmo nº serão agrupadas")).toBeInTheDocument();
  });

  it.each([
    ["carregamento", { isLoading: true }],
    ["erro", { isError: true, error: new Error("fixture") }],
    ["sem empresa", { company: null, companyId: null }],
    ["sem configuração", { company: { id: "company", country: "BR", currency: null } }],
  ])("%s mantém o fallback PT sem esconder IRS", (_state, overrides) => {
    company("BR", "BRL", overrides);
    render(modal(kind));
    expectPT();
  });

  it("actualiza os campos quando o contexto chega e quando a empresa muda", () => {
    company("BR", "BRL", { isLoading: true });
    const { rerender } = render(modal(kind));
    expectPT();
    company("BR", "BRL"); rerender(modal(kind)); expectBR();
    company("PT", "EUR"); rerender(modal(kind)); expectPT();
  });

  it("receita PT continua sem o bloco IRS", () => {
    render(modal(kind, "income"));
    expect(screen.queryByText("Retenção IRS declarada na fatura")).not.toBeInTheDocument();
    expect(screen.getByText("Nº Fatura")).toBeInTheDocument();
  });

  it("BR mantém invoice_ref e retenção nula no payload existente", async () => {
    company("BR", "BRL");
    render(modal(kind));
    fireEvent.change(screen.getByPlaceholderText("Ex: NF 12345"), { target: { value: "NF 12345" } });
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await Promise.all(f.mutations);
    const payload = kind === "criação"
      ? f.writes.find(write => write.table === "transactions")?.payload
      : f.invoke.mock.calls.find(([name]) => name === "update-transaction")?.[1].body.updates;
    expect(payload).toMatchObject({ invoice_ref: "NF 12345", declared_withholding_rate: null, declared_withholding_amount: null });
  });
});
