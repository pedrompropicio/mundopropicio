import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import { supplierSchema } from "@/lib/validations";
import FinancialAccounts from "@/pages/FinancialAccounts";
import { toast } from "sonner";

const f = vi.hoisted(() => ({
  country: "PT", companyId: "company-a", role: "admin",
  rpc: vi.fn(), from: vi.fn(), writes: [] as { table: string; payload: any; id?: string }[],
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { country: f.country, currency: f.country === "BR" ? "BRL" : "EUR" },
  companyId: f.companyId, isLoading: false, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "fixture@example.invalid" }, role: f.role,
  isAdmin: true, isManager: false, hasPermission: () => true,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: f.rpc, from: f.from } }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getAuditUser: () => "fixture" }));
vi.mock("@/components/SupplierPortalUserLink", () => ({ SupplierPortalUserLink: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useAccountBalanceCards", () => ({
  CASH_ACCOUNT_TYPES: ["bank", "cash", "prepaid_card"],
  useAccountBalanceCards: () => ({
    isLoading: false, balances: {},
    cash: { total: 0, count: 0, hiddenNames: [], uncontrolledNames: [] },
    ticketOffice: { total: 0, count: 0, hiddenNames: [], uncontrolledNames: [] },
    settlements: { total: 0, count: 0, hiddenNames: [], uncontrolledNames: [] },
  }),
}));
vi.mock("@/components/FinancialOperationsTab", () => ({ default: () => null }));
vi.mock("@/components/PartnerCurrentAccountTab", () => ({ default: () => null }));
vi.mock("@/components/supplier-credits/SupplierCreditsSummaryCard", () => ({ SupplierCreditsSummaryCard: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/AccountAccessModal", () => ({ default: () => null }));
vi.mock("@/components/AccountBalanceImplantModal", () => ({ default: () => null }));
vi.mock("@/components/BalanceCompositionModal", () => ({ BalanceCompositionModal: () => null }));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

const ptSupplier = {
  id: "supplier-a", name: "Fornecedor PT", nif: "509123456", contact_name: "Contacto",
  email: "pt@example.invalid", iban: "PT50000201231234567890154", swift_bic: "BPLIPTPL",
  iban_2: "GB82WEST12345698765432", swift_bic_2: "WESTGB2L", notes: "Notas PT",
};
const bank = { slot: 1, account_type: "br_banco_agencia_conta", bank_name: "Banco sintético",
  routing_number: "0001", account_number: "PT50-conta-BR", account_digit: "X" };
const brRow = { id: "supplier-a", foreign_bank_accounts: [bank],
  tax_id_foreign: "12345678000199", tax_id_type: "cnpj" };
const legacyFields = { nif: "NIF-PT", iban: "IBAN-LEGADO", iban_2: "IBAN-2", iban_3: "IBAN-3",
  swift_bic: "BIC-LEGADO", swift_bic_2: "BIC-2", swift_bic_3: "BIC-3" };
const brSupplier = { id: "supplier-a", name: "Fornecedor BR", ...legacyFields,
  tax_id_foreign: "PROPS-FISCAL", tax_id_type: "cpf", foreign_bank_accounts: [] };
let client: QueryClient;
function mount(element: React.ReactElement) {
  return render(element, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
function form(editingSupplier: typeof brSupplier | undefined = brSupplier, open = true) {
  return <SupplierFormModal open={open} onOpenChange={() => {}} editingSupplier={editingSupplier} />;
}
function submit() { fireEvent.submit(document.body.querySelector("form")!); }
function result(data: unknown, error: unknown = null) {
  f.rpc.mockImplementation((name: string) => {
    if (name === "get_supplier_bank_details") return { select: async () => ({ data, error }) };
    if (name === "check_supplier_similar") return Promise.resolve({ data: [], error: null });
    throw new Error(`#498: unexpected RPC ${name}`);
  });
}
function allowWrites() {
  f.from.mockImplementation((table: string) => ({
    update: (payload: any) => ({ eq: async (_column: string, id: string) => {
      f.writes.push({ table, payload, id }); return { error: null };
    } }),
    insert: (payload: any) => ({ select: () => ({ single: async () => {
      f.writes.push({ table, payload }); return { data: { id: "created" }, error: null };
    } }) }),
  }));
}
async function ready(value = brRow.tax_id_foreign) {
  await waitFor(() => {
    expect(screen.getByLabelText("CNPJ")).toBeEnabled();
    expect(screen.getByLabelText("CNPJ")).toHaveValue(value);
  });
}
function dom() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
beforeEach(() => {
  vi.clearAllMocks(); f.country = "PT"; f.companyId = "company-a"; f.role = "admin"; f.writes = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  result([brRow]);
  f.from.mockImplementation(() => { throw new Error("#498: unexpected direct table access"); });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: network blocked"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#498: network blocked"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#498: network blocked"); } });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  cleanup(); client.clear(); vi.unstubAllGlobals();
});

describe("#498 P3b — DOM PT fixado ANTES de alterar o modal; não regenerar", () => {
  it("criação PT conserva todos os bytes", () => {
    mount(<SupplierFormModal open onOpenChange={() => {}} />);
    expect(dom()).toBe("22258efe1e47b6cf22186236816e1c5be1c9f8f0ca9f562b65e8fedd02655de2");
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
  });
  it("edição PT conserva todos os bytes", () => {
    mount(<SupplierFormModal open onOpenChange={() => {}} editingSupplier={ptSupplier} />);
    expect(dom()).toBe("ca01f85fed0b24d812e8f3828bfee48a0497f951ced232006cb9adf6e6089f4a");
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
  });
});

describe("#498 P3b — identificador fiscal BR editável pela RPC", () => {
  beforeEach(() => { f.country = "BR"; });

  it("inicializa CNPJ e tipo apenas da RPC, sem avisos nem validação IBAN", async () => {
    mount(form()); await ready();
    expect(screen.getByLabelText("CNPJ")).toHaveValue(brRow.tax_id_foreign);
    expect(screen.getByLabelText("Tipo de identificador fiscal")).toHaveValue("cnpj");
    expect(screen.queryByDisplayValue("PROPS-FISCAL")).toBeNull();
    expect(screen.getAllByLabelText("Conta")[0]).toHaveValue(bank.account_number);
    expect(document.body.textContent).not.toMatch(/IBAN|MOD-97/);
    expect(f.rpc).toHaveBeenCalledWith("get_supplier_bank_details", { p_supplier_ids: [brSupplier.id] });
    expect(f.from).not.toHaveBeenCalled();
  });

  it("UPDATE normaliza CNPJ e conserva nif, iban*, swift_bic* e os slots existentes", async () => {
    allowWrites(); mount(form()); await ready();
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: " 98.765.432/0001-00 " } });
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0]).toMatchObject({ table: "suppliers", id: brSupplier.id, payload: {
      ...legacyFields, tax_id_foreign: "98765432000100", tax_id_type: "cnpj", foreign_bank_accounts: [bank],
    } });
    expect(f.rpc.mock.calls.every(([name]) => name === "get_supplier_bank_details")).toBe(true);
  });

  it.each(["cnpj", "cpf"])("INSERT %s grava só os dígitos e o tipo escolhido", async type => {
    result([]); allowWrites(); mount(<SupplierFormModal open onOpenChange={() => {}} />); await ready("");
    expect(screen.getByLabelText("Tipo de identificador fiscal")).toHaveValue("cnpj");
    fireEvent.change(screen.getByLabelText("Nome da Entidade *"), { target: { value: "Fornecedor sintético" } });
    fireEvent.change(screen.getByLabelText("Tipo de identificador fiscal"), { target: { value: type } });
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: type === "cpf" ? " 123.456.789-00 " : " 12.345.678/0001-99 " } });
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0]).toMatchObject({ table: "suppliers", payload: {
      tax_id_foreign: type === "cpf" ? "12345678900" : "12345678000199", tax_id_type: type,
      nif: null, iban: null, iban_2: null, iban_3: null,
    } });
    expect(f.rpc).toHaveBeenCalledWith("get_supplier_bank_details", { p_supplier_ids: [] });
  });

  it("inicializa CPF e permite mudar para CNPJ", async () => {
    result([{ ...brRow, tax_id_foreign: "12345678900", tax_id_type: "cpf" }]);
    allowWrites(); mount(form()); await ready("12345678900");
    expect(screen.getByLabelText("Tipo de identificador fiscal")).toHaveValue("cpf");
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "12345678000199" } });
    fireEvent.change(screen.getByLabelText("Tipo de identificador fiscal"), { target: { value: "cnpj" } });
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].payload).toMatchObject({ tax_id_foreign: "12345678000199", tax_id_type: "cnpj" });
  });

  it("alterar apenas o tipo também persiste o par fiscal", async () => {
    result([{ ...brRow, tax_id_foreign: "12345678900" }]);
    allowWrites(); mount(form()); await ready("12345678900");
    fireEvent.change(screen.getByLabelText("Tipo de identificador fiscal"), { target: { value: "cpf" } });
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].payload).toMatchObject({ tax_id_foreign: "12345678900", tax_id_type: "cpf" });
  });

  it.each(["intacto", "reposto", "formatado"])("campo %s omite o par fiscal do UPDATE", async action => {
    allowWrites(); mount(form()); await ready();
    if (action !== "intacto") {
      fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "123" } });
      fireEvent.change(screen.getByLabelText("CNPJ"), { target: {
        value: action === "formatado" ? " 12.345.678/0001-99 " : brRow.tax_id_foreign,
      } });
      fireEvent.change(screen.getByLabelText("Tipo de identificador fiscal"), { target: { value: "cpf" } });
      fireEvent.change(screen.getByLabelText("Tipo de identificador fiscal"), { target: { value: "cnpj" } });
    }
    fireEvent.change(screen.getByLabelText("Nome da Entidade *"), { target: { value: "Cadastro alterado" } });
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].payload).toMatchObject({ ...legacyFields, name: "Cadastro alterado" });
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_foreign");
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_type");
  });

  it("limpar o identificador existente envia null", async () => {
    allowWrites(); mount(form()); await ready();
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "   " } });
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].payload).toMatchObject({ tax_id_foreign: null, tax_id_type: "cnpj" });
  });

  it("criação vazia permite gravar e omite o par fiscal mesmo após editar e limpar", async () => {
    result([]); allowWrites(); mount(<SupplierFormModal open onOpenChange={() => {}} />); await ready("");
    fireEvent.change(screen.getByLabelText("Nome da Entidade *"), { target: { value: "Fornecedor sintético" } });
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Tipo de identificador fiscal"), { target: { value: "cpf" } });
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_foreign");
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_type");
  });

  it.each([
    ["cnpj", "1234567800019", 14], ["cnpj", "123456780001999", 14],
    ["cpf", "1234567890", 11], ["cpf", "123456789000", 11],
    ["cnpj", "1234567800019A", 14], ["cpf", "abcdefghijk", 11],
  ])("recusa %s inválido %s sem gravar", async (type, value, length) => {
    mount(form()); await ready();
    fireEvent.change(screen.getByLabelText("Tipo de identificador fiscal"), { target: { value: type } });
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value } });
    submit();
    expect(await screen.findByText(`${type.toUpperCase()} deve conter ${length} dígitos`)).toBeInTheDocument();
    expect(screen.getByLabelText("CNPJ")).toHaveAttribute("aria-invalid", "true");
    expect(f.from).not.toHaveBeenCalled(); expect(f.writes).toEqual([]);
  });

  it("permite corrigir um valor inválido sem exigir checksum oficial", async () => {
    allowWrites(); mount(form()); await ready();
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "123" } }); submit();
    expect(await screen.findByText("CNPJ deve conter 14 dígitos")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "00000000000000" } }); submit();
    await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(screen.queryByText("CNPJ deve conter 14 dígitos")).toBeNull();
    expect(f.writes[0].payload.tax_id_foreign).toBe("00000000000000");
  });

  it.each(["contrato antigo", "RPC ausente", "sem acesso"])("%s deixa CNPJ vazio e desactivado sem gravar campos fiscais", async failure => {
    if (failure === "RPC ausente") result(null, { code: "PGRST202" });
    else result(failure === "contrato antigo" ? [{ id: brRow.id, iban: null }] : []);
    allowWrites(); mount(form());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getByLabelText("CNPJ")).toBeDisabled();
    expect(screen.getByLabelText("CNPJ")).toHaveValue("");
    expect(screen.getByLabelText("Tipo de identificador fiscal")).toBeDisabled();
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].payload).toMatchObject(legacyFields);
    for (const key of ["tax_id_foreign", "tax_id_type", "foreign_bank_accounts"]) {
      expect(f.writes[0].payload).not.toHaveProperty(key);
    }
  });

  it("reabrir descarta o rascunho e não grava um identificador sem alteração nesta abertura", async () => {
    allowWrites(); const view = mount(form()); await ready();
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "98765432000100" } });
    view.rerender(form(brSupplier, false)); view.rerender(form());
    await waitFor(() => expect(screen.getByLabelText("CNPJ")).toHaveValue(brRow.tax_id_foreign));
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_foreign");
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_type");
  });

  it("perda de acesso elimina o rascunho e impede escrita fiscal", async () => {
    allowWrites(); const view = mount(form()); await ready();
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "98765432000100" } });
    f.role = "viewer"; result([]); view.rerender(form());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getByLabelText("CNPJ")).toBeDisabled(); expect(screen.getByLabelText("CNPJ")).toHaveValue("");
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_foreign");
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_type");
  });

  it.each(["cnpj", "cpf"])("detalhes mostram o rótulo %s exclusivamente da RPC", async type => {
    const value = type === "cpf" ? "12345678900" : brRow.tax_id_foreign;
    result([{ ...brRow, tax_id_foreign: value, tax_id_type: type }]);
    mount(<SupplierBankDetails supplier={brSupplier} defaultExpanded />);
    expect(await screen.findByText(`${type.toUpperCase()}: ${type === "cpf" ? "123.456.789-00" : "12.345.678/0001-99"}`)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/PROPS-FISCAL|NIF-PT|IBAN|MOD-97/);
    expect(f.from).not.toHaveBeenCalled();
  });

  it("trocar de fornecedor/empresa nunca grava o rascunho fiscal anterior", async () => {
    allowWrites(); const view = mount(form()); await ready();
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "98765432000100" } });
    const next = { ...brSupplier, id: "supplier-b" };
    result([{ ...brRow, id: next.id, tax_id_foreign: "12345678900", tax_id_type: "cpf" }]);
    view.rerender(form(next));
    await waitFor(() => expect(screen.getByLabelText("CNPJ")).toHaveValue("12345678900"));
    expect(screen.getByLabelText("Tipo de identificador fiscal")).toHaveValue("cpf");
    submit(); await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_foreign");
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "00000000000" } });
    f.companyId = "company-b"; result([]); view.rerender(form(next));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getByLabelText("CNPJ")).toHaveValue(""); expect(screen.getByLabelText("CNPJ")).toBeDisabled();
    submit(); await waitFor(() => expect(f.writes).toHaveLength(2));
    expect(f.writes[1].payload).not.toHaveProperty("tax_id_foreign");
    expect(f.writes[1].payload).not.toHaveProperty("tax_id_type");
  });

  it("o UPDATE actualiza também os detalhes fiscais já apresentados", async () => {
    allowWrites(); mount(<>
      {form()}<SupplierBankDetails supplier={brSupplier} defaultExpanded />
    </>); await ready();
    expect(await screen.findByText("CNPJ: 12.345.678/0001-99")).toBeInTheDocument();
    result([{ ...brRow, tax_id_foreign: "98765432000100" }]);
    fireEvent.change(screen.getByLabelText("CNPJ"), { target: { value: "98765432000100" } });
    submit();
    expect(await screen.findByText("CNPJ: 98.765.432/0001-00")).toBeInTheDocument();
    expect(f.writes).toHaveLength(1);
  });

  it.each(["bank", "prepaid_card"])("FinancialAccounts %s apresenta campos BR sem aviso IBAN", async type => {
    for (const [key, data] of [
      ["financial-accounts", []], ["financial-accounts-tx-summary", []], ["financial-account-br-column", true],
    ] as const) {
      client.setQueryDefaults([key], { staleTime: Infinity });
      client.setQueryData(key === "financial-account-br-column" ? [key, f.companyId] : [key], data);
    }
    mount(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><FinancialAccounts /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Nova Conta" }));
    const accountType = Array.from(document.querySelectorAll("select")).find(select =>
      Array.from(select.options).some(option => option.value === "prepaid_card"))!;
    fireEvent.change(accountType, { target: { value: type } });
    for (const label of ["Banco", "Agência", "Conta", "Dígito", "Chave Pix", "Tipo de conta"]) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
    fireEvent.change(screen.getByLabelText("Conta"), { target: { value: "PT50-conta-BR" } });
    expect(document.body.textContent).not.toMatch(/IBAN|MOD-97/);
    expect(f.from).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  });
});

describe("#498 P3b — guardas PT mantidas", () => {
  it("MOD-97 continua a bloquear IBAN inválido", async () => {
    mount(<SupplierFormModal open onOpenChange={() => {}} editingSupplier={ptSupplier} />);
    fireEvent.change(screen.getByLabelText("IBAN 1"), { target: { value: "PT50000201231234567890155" } });
    submit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("IBAN 1 inválido", expect.any(Object)));
    expect(f.from).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("IBAN duplicado continua a bloquear antes do UPDATE", async () => {
    f.rpc.mockResolvedValue({ data: { exists: true, is_active: true, supplier_name: "Outro", nif: "123" }, error: null });
    mount(<SupplierFormModal open onOpenChange={() => {}} editingSupplier={ptSupplier} />);
    submit();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("IBAN 1 duplicado", expect.any(Object)));
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("check_supplier_iban_duplicate", {
      p_iban: ptSupplier.iban, p_supplier_id: ptSupplier.id,
    });
    expect(f.from).not.toHaveBeenCalled();
  });
});

describe("#498 P3b — schema fiscal opcional sem alterar IBAN", () => {
  it.each(["cpf", "cnpj", "ein", "tin", "vat", "outro"])("aceita o tipo da 0302 %s", tax_id_type => {
    expect(supplierSchema.safeParse({ name: "Fornecedor", tax_id_type }).success).toBe(true);
  });
  it("aceita nulos e ausência, rejeita tipo desconhecido e mais de 20 caracteres", () => {
    expect(supplierSchema.safeParse({ name: "Fornecedor" }).success).toBe(true);
    expect(supplierSchema.safeParse({ name: "Fornecedor", tax_id_foreign: null, tax_id_type: null }).success).toBe(true);
    expect(supplierSchema.safeParse({ name: "Fornecedor", tax_id_type: "NIF" }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: "Fornecedor", tax_id_foreign: "1".repeat(21) }).success).toBe(false);
    expect(supplierSchema.safeParse({ name: "Fornecedor", iban: "1".repeat(35) }).success).toBe(false);
  });
});
