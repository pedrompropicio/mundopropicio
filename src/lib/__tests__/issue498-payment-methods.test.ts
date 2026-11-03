import { createElement as h } from "react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCompanyLocale, companyPaymentMethods } from "../company-locale";
import { BOLETO_FIELDS_MESSAGE, SERVICE_PAYMENT_FIELDS_MESSAGE, friendlyPaymentError,
  paymentMethodOptions, paymentMethodLabel, validatePaymentMethodFields } from "../payment-methods";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { TransactionPaymentModal } from "@/components/TransactionPaymentModal";
import FinancialAccounts from "@/pages/FinancialAccounts";
import { BatchPaymentModal } from "@/components/BatchPaymentModal";
import { SupplierBankDetails, BrBankFields, optionalBankColumns, loadOptionalSupplierBrData } from "@/components/SupplierBankDetails";

const f = vi.hoisted(() => ({ country: "PT", queries: {} as Record<string, any>,
  writers: [] as ((input?: any) => Promise<any>)[], writes: [] as any[], mutations: [] as Promise<any>[], error: null as any, toast: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { id: "company", country: f.country, currency: f.country === "BR" ? "BRL" : "EUR" },
  companyId: "company", isLoading: false, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "fixture@example.invalid" }, role: "admin", isAdmin: true, isManager: false, hasPermission: () => true,
}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({ data: f.queries[queryKey[0]], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: any) => (f.writers.push(options.mutationFn), { isPending: false, mutate: (input: any) => {
    const promise = Promise.resolve().then(() => options.mutationFn(input));
    f.mutations.push(promise); promise.catch(options.onError ?? (() => {}));
  } }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: vi.fn() },
  rpc: f.rpc,
  from: (table: string) => {
    const q: any = {
      insert: (payload: any) => { f.writes.push({ table, payload }); return q; },
      update: (payload: any) => { f.writes.push({ table, payload }); return q; },
      select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q, limit: () => q,
      single: async () => ({ data: { id: "created" }, error: f.error }),
      maybeSingle: async () => ({ data: null, error: f.error }),
      then: (resolve: any) => Promise.resolve({ data: [], error: f.error }).then(resolve),
    }; return q;
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
vi.mock("@/lib/pdf-first-page-to-jpeg", () => ({ pdfFirstPageToJpeg: vi.fn() }));
vi.mock("@/components/FinancialOperationsTab", () => ({ default: () => null }));
vi.mock("@/components/PartnerCurrentAccountTab", () => ({ default: () => null }));
vi.mock("@/components/supplier-credits/SupplierCreditsSummaryCard", () => ({ SupplierCreditsSummaryCard: () => null }));
vi.mock("@/hooks/useAccountBalanceCards", () => ({ CASH_ACCOUNT_TYPES: ["bank", "cash", "prepaid_card"],
  useAccountBalanceCards: () => ({ balances: {}, cash: { total: 0, count: 0, hiddenNames: [], uncontrolledNames: [] }, ticketOffice: { total: 0, count: 0, hiddenNames: [], uncontrolledNames: [] }, settlements: { total: 0, count: 0, hiddenNames: [], uncontrolledNames: [] } }),
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getAuditUser: () => "fixture" }));
vi.mock("@/lib/heic", () => ({ convertHeicFileToJpeg: vi.fn() }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/ui/overlay-layer", () => ({ OverlayLayer: ({ children }: any) => h("div", null, children) }));

const pt = resolveCompanyLocale({ country: "PT", currency: "EUR" });
const br = resolveCompanyLocale({ country: "BR", currency: "BRL" });
beforeEach(() => {
  f.country = "PT"; f.queries = {}; f.writes = []; f.mutations = []; f.writers = []; f.error = null;
  vi.clearAllMocks();
  f.rpc.mockImplementation(() => ({ select: async () => ({ data: [], error: f.error }) }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida nos testes"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("#498 P2h — matriz de opções e rótulos", () => {
  it.each([false, true])("PT mantém exatamente as opções com Estado=%s", state => {
    const actual = paymentMethodOptions({ context: pt, includeStatePayment: state, includeCompensation: true });
    expect(actual.map(({ value, label }) => [value, label])).toEqual([
      ["transfer", "Transferência"], ["service_payment", "Pag. Serviços"], ["direct_debit", "Débito Direto"],
      ...(state ? [["state_payment", "Pag. Estado"]] : []), ["compensation", "Compensação"],
    ]);
    expect(actual).toEqual(paymentMethodOptions({ includeStatePayment: state, includeCompensation: true }));
  });
  it.each([false, true])("BR não oferece serviços/Estado, Compensação=%s", compensation => {
    expect(paymentMethodOptions({ context: br, includeStatePayment: true, includeCompensation: compensation })
      .map(({ value, label }) => [value, label])).toEqual([
        ["pix", "Pix"], ["boleto", "Boleto"], ["transfer", "Transferência (TED)"], ["direct_debit", "Débito automático"],
        ...(compensation ? [["compensation", "Compensação"]] : []),
      ]);
  });
  it("decide por país/apresentação, sem inferir pelo BRL e sem defaults com contexto indisponível", () => {
    expect(companyPaymentMethods(resolveCompanyLocale({ country: "BR", currency: "EUR" }))).toBe("br");
    expect(companyPaymentMethods(resolveCompanyLocale({ country: "PT", currency: "BRL" }))).toBe("pt");
    expect(paymentMethodOptions({ context: resolveCompanyLocale({}) })).toEqual([]);
    expect(paymentMethodLabel("transfer", br)).toBe("Transferência (TED)");
    expect(paymentMethodLabel("compensation", br)).toBe("Compensação");
  });
});

describe("#498 — boleto e MB", () => {
  it.each([47, 48])("aceita %s dígitos sem perder zeros", count => {
    expect(validatePaymentMethodFields({ payment_method: "boleto", payment_reference: "0".repeat(count) })).toBeNull();
  });
  it.each(["1".repeat(46), "1".repeat(49), "a".repeat(47), "1".repeat(46) + "a", "", null, " " + "1".repeat(47), "1".repeat(47) + "\n"])("recusa linha inválida %s", reference => {
    expect(validatePaymentMethodFields({ payment_method: "boleto", payment_reference: reference })).toBe(BOLETO_FIELDS_MESSAGE);
  });
  it("Pix não valida formato e MB mantém a mensagem única", () => {
    expect(validatePaymentMethodFields({ payment_method: "pix", payment_reference: "chave@email.invalid" })).toBeNull();
    expect(validatePaymentMethodFields({ payment_method: "pix" })).toBeNull();
    expect(validatePaymentMethodFields({ payment_method: "service_payment" })).toBe(SERVICE_PAYMENT_FIELDS_MESSAGE);
    expect(friendlyPaymentError({ message: 'violates constraint "transactions_boleto_requires_linha"' })).toBe(BOLETO_FIELDS_MESSAGE);
  });
});

const transaction = { id: "tx", type: "expense" as const, description: "Fixture", amount: 100, iva_rate: 0 as const, status: "approved",
  date: "2026-11-03", payment_date: "2026-11-03", supplier_id: "supplier", currency: "EUR", paid_amount: 0 };
const selectors = [
  ["criação", () => h(TransactionFormModal, { onClose() {}, defaults: { ...transaction, amount: "100" } })],
  ["edição", () => h(TransactionEditModal, { onClose() {}, transaction, canApprove: true })],
  ["pagamento", () => h(TransactionPaymentModal, { onClose() {}, transaction })],
] as const;

describe("#498 — selectores reais", () => {
  it("snapshot PT dos três selectores, sem regenerar as baselines P1/P2", () => {
    const result: Record<string, (string | null)[]> = {};
    for (const [name, element] of selectors) {
      const { unmount } = render(h(MemoryRouter, null, element()));
      result[name] = Array.from(document.body.querySelectorAll("button")).map(b => b.textContent)
        .filter(text => ["Transferência", "Pag. Serviços", "Débito Direto", "Pag. Estado", "Compensação"].includes(text ?? ""));
      unmount();
    }
    expect(result).toMatchInlineSnapshot(`
      {
        "criação": [
          "Transferência",
          "Pag. Serviços",
          "Débito Direto",
        ],
        "edição": [
          "Transferência",
          "Pag. Serviços",
          "Débito Direto",
        ],
        "pagamento": [
          "Transferência",
          "Pag. Serviços",
          "Débito Direto",
          "Compensação",
        ],
      }
    `);
  });
  it("lote BR mostra Boleto e recusa linha inválida antes de escrever", async () => {
    f.country = "BR";
    const { container } = render(h(BatchPaymentModal, { onClose() {}, initialPaymentDate: "2026-11-03",
      transactions: [{ ...transaction, payment_method: "boleto", payment_reference: "1".repeat(46) }] }));
    expect(screen.getByText(/Boleto/)).toBeInTheDocument();
    fireEvent.click(container.querySelector('input[type="checkbox"]')!);
    await expect(f.writers[f.writers.length - 1]()).rejects.toThrow(BOLETO_FIELDS_MESSAGE);
    expect(f.writes).toEqual([]);
  });
  it.each(selectors)("PT: %s preserva rótulos e ordem", (name, element) => {
    const { container } = render(h(MemoryRouter, null, element()));
    const methods = Array.from(document.body.querySelectorAll("button")).map(b => b.textContent)
      .filter(text => ["Transferência", "Pag. Serviços", "Débito Direto", "Pag. Estado", "Compensação", "Pix", "Boleto"].includes(text ?? ""));
    expect(methods).toEqual(name === "pagamento" ? ["Transferência", "Pag. Serviços", "Débito Direto", "Compensação"] : ["Transferência", "Pag. Serviços", "Débito Direto"]);
  });
  it.each(selectors)("BR: %s mostra Pix/Boleto/TED/Débito automático", (_name, element) => {
    f.country = "BR"; render(h(MemoryRouter, null, element()));
    for (const label of ["Pix", "Boleto", "Transferência (TED)", "Débito automático"]) expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pag. Serviços" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pag. Estado" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Boleto" }));
    expect(screen.getByText("Linha digitável *")).toBeInTheDocument();
  });
  it("criação recusa 46 dígitos antes de escrever e permite 47", async () => {
    f.country = "BR";
    const { container } = render(h(TransactionFormModal, { onClose() {}, defaults: { ...transaction, amount: "100" } }));
    fireEvent.click(screen.getByRole("button", { name: "Boleto" }));
    const input = screen.getByText("Linha digitável *").parentElement!.querySelector("input")!;
    fireEvent.change(input, { target: { value: "1".repeat(46) } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await expect(f.mutations[0]).rejects.toThrow(BOLETO_FIELDS_MESSAGE);
    expect(f.writes).toEqual([]);
    fireEvent.change(input, { target: { value: "1".repeat(47) } });
    expect(input.getAttribute("aria-invalid")).toBe("false");
  });
});

describe("#498 — conta BR e colunas opcionais", () => {
  it.each([false, true])("conta financeira BR só grava bank_details_br com coluna disponível=%s", async available => {
    f.country = "BR"; f.queries["financial-account-br-column"] = available;
    render(h(MemoryRouter, null, h(FinancialAccounts)));
    fireEvent.click(screen.getByRole("button", { name: "Nova Conta" }));
    expect(screen.queryByText("IBAN")).toBeNull();
    expect(screen.getByLabelText("Banco").hasAttribute("disabled") || screen.getByLabelText("Banco").closest("fieldset")?.disabled).toBe(!available);
    fireEvent.change(screen.getByPlaceholderText("Ex: Conta BPI Principal"), { target: { value: "BR banco" } });
    if (available) {
      fireEvent.change(screen.getByLabelText("Agência"), { target: { value: "0001" } });
      fireEvent.change(screen.getByLabelText("Chave Pix"), { target: { value: "email@ex.invalid" } });
    }
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await f.mutations[0];
    expect(f.writes[0].table).toBe("financial_accounts");
    expect(f.writes[0].payload).not.toHaveProperty("iban");
    if (available) expect(f.writes[0].payload.bank_details_br).toEqual({ routing_number: "0001", pix_key: "email@ex.invalid" });
    else expect(f.writes[0].payload).not.toHaveProperty("bank_details_br");
  });
  it("editor hidrata o slot BR, preserva outro tipo de conta e não grava identificadores fiscais", async () => {
    f.country = "BR";
    const other = { slot: 1, account_type: "aba_us", account_number: "123", notes: "original" };
    const bank = { slot: 2, account_type: "br_banco_agencia_conta", bank_name: "Banco", routing_number: "0001", account_number: "00123", notes: "  memo  " };
    f.queries["supplier-br-details"] = { available: true, details: { foreign_bank_accounts: [other, bank], tax_id_foreign: "12345678000199", tax_id_type: "cnpj" } };
    const { SupplierFormModal: ActualSupplierForm } = await vi.importActual<typeof import("@/components/SupplierFormModal")>("@/components/SupplierFormModal");
    render(h(ActualSupplierForm, { open: true, onOpenChange() {}, editingSupplier: { id: "supplier", name: "Fixture", nif: "PT-OLD" } }));
    expect(screen.getAllByLabelText("Banco")[0]).toBeDisabled();
    expect(screen.getByLabelText("CNPJ")).toHaveValue("12345678000199");
    fireEvent.change(screen.getAllByLabelText("Conta")[1], { target: { value: "00999" } });
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await f.mutations[0];
    expect(f.writes[0].payload.foreign_bank_accounts).toEqual([other, { ...bank, account_number: "00999" }]);
    expect(f.writes[0].payload.nif).toBe("PT-OLD");
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_foreign");
  });
  it("editor com 0302 ausente omite os novos campos do payload", async () => {
    f.country = "BR";
    f.queries["supplier-br-details"] = { available: false, details: null };
    const { SupplierFormModal: ActualSupplierForm } = await vi.importActual<typeof import("@/components/SupplierFormModal")>("@/components/SupplierFormModal");
    render(h(ActualSupplierForm, { open: true, onOpenChange() {}, editingSupplier: { id: "supplier", name: "Fixture" } }));
    expect(screen.getAllByLabelText("Banco")[0]).toBeDisabled();
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await f.mutations[0];
    expect(f.writes[0].payload).not.toHaveProperty("foreign_bank_accounts");
  });
  it("representa campos BR com zeros e preserva valores sem formato IBAN", () => {
    const change = vi.fn();
    render(h(BrBankFields, { prefix: "test", value: { routing_number: "0001", account_number: "00123", pix_key: "email@ex.invalid" }, onChange: change }));
    expect(screen.getByLabelText("Agência")).toHaveValue("0001");
    fireEvent.change(screen.getByLabelText("Dígito"), { target: { value: "X" } });
    expect(change).toHaveBeenCalledWith({ routing_number: "0001", account_number: "00123", account_digit: "X", pix_key: "email@ex.invalid" });
  });
  it("lê slots e identificador estrangeiros em BR, sem usar nif como CNPJ", async () => {
    f.country = "BR";
    f.rpc.mockReturnValue({ select: async () => ({ data: [{ id: "supplier", tax_id_type: "cnpj", tax_id_foreign: "12345678000199",
      foreign_bank_accounts: [{ slot: 1, account_type: "br_banco_agencia_conta", bank_name: "Banco", routing_number: "0001", account_number: "00123", account_digit: "X", account_kind: "corrente", pix_key: "email@ex.invalid" }] }], error: null }) });
    f.queries["supplier-br-details"] = await loadOptionalSupplierBrData("supplier");
    expect(f.rpc).toHaveBeenCalledWith("get_supplier_bank_details", { p_supplier_ids: ["supplier"] });
    render(h(SupplierBankDetails, { defaultExpanded: true, supplier: { id: "supplier", name: "Fixture", nif: "NIF-PT" } }));
    expect(screen.getByText(/CNPJ: 12345678000199/)).toBeInTheDocument();
    expect(screen.getByText("Conta: 00123")).toBeInTheDocument();
    expect(screen.queryByText(/NIF-PT/)).toBeNull();
  });
  it.each(["42703", "PGRST204"])("coluna ausente %s desliga escrita sem erro", async code => {
    f.error = { code, message: "column missing" };
    await expect(optionalBankColumns("financial_accounts", "bank_details_br")).resolves.toBe(false);
    await expect(loadOptionalSupplierBrData("supplier")).resolves.toEqual({ available: false, details: null });
  });
  it("RPC sem acesso deixa BR indisponível sem recuperar dados das props", async () => {
    f.country = "BR";
    await expect(optionalBankColumns("suppliers", "foreign_bank_accounts")).resolves.toBe(true);
    f.error = { code: "42501", message: "permission denied" };
    await expect(optionalBankColumns("suppliers", "foreign_bank_accounts")).resolves.toBe(false);
    f.queries["supplier-br-details"] = await loadOptionalSupplierBrData("supplier");
    render(h(SupplierBankDetails, { defaultExpanded: true, supplier: { id: "supplier", name: "Fixture", nif: "NIF-PT",
      tax_id_type: "cnpj", tax_id_foreign: "12345678000199", foreign_bank_accounts: [{ slot: 1, account_type: "br_banco_agencia_conta", account_number: "00123" }] } }));
    expect(screen.getByText("Dados bancários indisponíveis.")).toBeInTheDocument();
    expect(screen.queryByText(/12345678000199|00123|NIF-PT/)).toBeNull();
  });
});

// Só lê os ficheiros preparados: não executa SQL.
describe("#498 — contratos R2 preparados", () => {
  it.each(["0303_issue498_payment_methods_br", "0304_issue498_fx_native_currency"])("%s tem cópia exata e rollback comentado", name => {
    const sql = readFileSync(`drizzle/migrations/${name}.sql`, "utf8");
    expect(sql).toBe(readFileSync(`supabase/manual/${name}.sql`, "utf8"));
    expect(sql).toContain("PREPARAÇÃO"); expect(sql).toContain("ROLLBACK COMENTADO");
    expect(sql.split("ROLLBACK COMENTADO")[0]).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\s/im);
  });
  it("0303 conserva compensation e fecha boleto nulo sem backfill", () => {
    const sql = readFileSync("drizzle/migrations/0303_issue498_payment_methods_br.sql", "utf8");
    expect(sql).toContain("'compensation', 'pix', 'boleto'");
    expect(sql).toContain("payment_reference IS NOT NULL AND payment_reference ~ '^\\d{47,48}$'");
    expect(sql).toContain("NOT VALID");
  });
  it("0304 resolve a moeda pelo pai e recusa divergência de empresa, sem tocar nas faturas avulsas", () => {
    const sql = readFileSync("drizzle/migrations/0304_issue498_fx_native_currency.sql", "utf8").split("-- ROLLBACK COMENTADO")[0];
    expect(sql).toContain("NEW.company_id IS DISTINCT FROM parent_company_id");
    expect(sql).toContain("NEW.currency <> native_currency AND (NEW.original_amount IS NULL OR NEW.fx_rate IS NULL)");
    expect(sql).toContain("BEFORE INSERT OR UPDATE ON public.transaction_payments");
    expect(sql).not.toMatch(/ALTER TABLE public.standalone_invoices/);
  });
});
