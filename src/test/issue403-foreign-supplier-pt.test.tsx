import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { FOREIGN_BANK_FIELDS, SupplierBankDetails } from "@/components/SupplierBankDetails";
import { readForeignBankSlots } from "@/lib/supplier-bank";
import { supplierSchema } from "@/lib/validations";
import { toast } from "sonner";

const f = vi.hoisted(() => ({
  role: "admin", companyId: "company-a", rpc: vi.fn(), from: vi.fn(),
  writes: [] as { payload: any; id?: string }[],
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { country: "PT", currency: "EUR" }, companyId: f.companyId, isLoading: false, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user" }, role: f.role }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: f.rpc, from: f.from } }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getAuditUser: () => "fixture" }));
vi.mock("@/components/SupplierPortalUserLink", () => ({ SupplierPortalUserLink: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const account = "021000021 1234567890";
const validIban = "PT50000201231234567890154";
const supplier = { id: "supplier-a", name: "Fornecedor sintético", nif: "509123456", iban: account, swift_bic: "BOFAUS3N" };
const brBank = { slot: 3, account_type: "br_banco_agencia_conta", bank_name: "Banco BR", account_number: "123-4", notes: "preservar" };
const foreignBank = { slot: 1, account_type: "aba_us", account_number: account,
  routing_number: "021000021", bank_name: "Bank of America", beneficiary_name: "UMG Recordings, Inc." };
const row = { id: supplier.id, foreign_bank_accounts: [foreignBank, brBank], tax_id_foreign: "95-1234567", tax_id_type: "ein" };
let client: QueryClient;
function result(data: unknown, error: unknown = null) {
  f.rpc.mockImplementation((name: string) => {
    if (name === "get_supplier_bank_details") return { select: async () => ({ data, error }) };
    if (name === "check_supplier_iban_duplicate") return Promise.resolve({ data: { exists: false }, error: null });
    if (name === "check_supplier_similar") return Promise.resolve({ data: [], error: null });
    throw new Error(`#403: unexpected RPC ${name}`);
  });
}
function mount(element: React.ReactElement) {
  return render(element, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
function form(editingSupplier: Record<string, unknown> | undefined = supplier, open = true) {
  return <SupplierFormModal open={open} editingSupplier={editingSupplier} onOpenChange={() => {}} />;
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function submit() { fireEvent.submit(document.body.querySelector("form")!); }
async function ready() { await waitFor(() => expect(screen.getAllByLabelText("Tipo de conta")[0]).toBeEnabled()); }
async function saved() { submit(); await waitFor(() => expect(f.writes).toHaveLength(1)); return f.writes[0].payload; }
function expectNoOptionalKeys(payload: any) {
  for (const key of ["foreign_bank_accounts", "tax_id_foreign", "tax_id_type", "country"]) expect(payload).not.toHaveProperty(key);
}

beforeEach(() => {
  vi.clearAllMocks(); f.role = "admin"; f.companyId = "company-a"; f.writes = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  result([row]);
  f.from.mockImplementation((table: string) => {
    expect(table).toBe("suppliers");
    return {
      update: (payload: any) => ({ eq: async (_column: string, id: string) => {
        f.writes.push({ payload, id }); return { error: null };
      } }),
      insert: (payload: any) => ({ select: () => ({ single: async () => {
        f.writes.push({ payload }); return { data: { id: "created" }, error: null };
      } }) }),
    };
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#403: network blocked"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#403: network blocked"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#403: network blocked"); } });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); cleanup(); client.clear(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("#403 E2b — contas estrangeiras em empresa PT", () => {
  it("pré-preenche apenas pela RPC e persiste o exemplo ABA preservando o elemento BR", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    result([{ ...row, foreign_bank_accounts: [brBank], tax_id_foreign: null, tax_id_type: null }]);
    mount(form({ ...supplier, foreign_bank_accounts: [foreignBank], tax_id_foreign: "PROPS" })); await ready();
    expect(screen.getByLabelText("ABA / Routing")).toHaveValue("");
    expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toHaveValue("");
    change("Tipo de conta", "aba_us"); change("ABA / Routing", " 021000021 ");
    change("Banco", " Bank of America "); change("Beneficiário (se diferente)", " UMG Recordings, Inc. ");
    change("Morada do banco", "   "); change("Identificador fiscal estrangeiro", " 95-1234567 ");
    change("Tipo de identificador fiscal", "ein");
    const payload = await saved();
    expect(payload).toMatchObject({ iban: account, swift_bic: "BOFAUS3N", nif: supplier.nif,
      tax_id_foreign: "95-1234567", tax_id_type: "ein" });
    expect(payload.foreign_bank_accounts).toEqual([brBank, foreignBank]);
    expect(payload).not.toHaveProperty("country");
    expect(f.writes[0].id).toBe(supplier.id);
    expect(f.rpc).toHaveBeenCalledWith("get_supplier_bank_details", { p_supplier_ids: [supplier.id] });
    expect(f.rpc).toHaveBeenCalledWith("check_supplier_iban_duplicate", { p_iban: account, p_supplier_id: supplier.id });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["supplier-br-details", "company-a", supplier.id] });
  });

  it("pré-preenche tipo, campos e fiscal; gravar sem editar omite o par fiscal", async () => {
    mount(form()); await ready();
    expect(screen.getByLabelText("Tipo de conta")).toHaveValue("aba_us");
    expect(screen.getByLabelText("Banco")).toHaveValue("Bank of America");
    expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toHaveValue("95-1234567");
    expect(screen.getByLabelText("Tipo de identificador fiscal")).toHaveValue("ein");
    expect(within(screen.getByLabelText("Tipo de identificador fiscal")).getAllByRole("option")
      .map(option => (option as HTMLOptionElement).value)).toEqual(["ein", "tin", "vat", "cpf", "cnpj", "outro"]);
    const payload = await saved();
    expect(payload.foreign_bank_accounts).toEqual([brBank, foreignBank]);
    expect(payload).not.toHaveProperty("tax_id_foreign"); expect(payload).not.toHaveProperty("tax_id_type");
  });

  it("activa a query ao escrever um não-IBAN sem repor o valor vivo quando a RPC chega", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise(resolvePromise => { resolve = resolvePromise; });
    f.rpc.mockImplementation(name => name === "get_supplier_bank_details" ? { select: () => pending }
      : Promise.resolve({ data: { exists: false }, error: null }));
    mount(form({ ...supplier, iban: "" })); expect(f.rpc).not.toHaveBeenCalled();
    change("IBAN 1", account);
    expect(screen.getByText("Dados bancários estrangeiros indisponíveis para edição.")).toBeInTheDocument();
    resolve({ data: [row], error: null }); await ready();
    expect(screen.getByLabelText("IBAN 1")).toHaveValue(account);
    expect(screen.getByLabelText("ABA / Routing")).toHaveValue("021000021");
  });

  it.each([1, 2, 3])("grava metadados por slot %i com campos trim e sem vazios", async slot => {
    result([{ ...row, foreign_bank_accounts: [brBank] }]);
    const field = (["iban", "iban_2", "iban_3"] as const)[slot - 1];
    mount(form({ ...supplier, iban: null, [field]: `  conta / ${slot}  ` })); await ready();
    change("Morada do banco", " Endereço sintético "); change("Banco intermediário", " Intermediário ");
    const payload = await saved();
    expect(payload.foreign_bank_accounts).toEqual([brBank, { slot, account_type: "outro", account_number: `conta / ${slot}`,
      bank_address: "Endereço sintético", intermediary_bank: "Intermediário" }]);
    expect(payload[field]).toBe(`conta / ${slot}`);
  });

  it("substitui só aba_us/outro e retira metadados de slot agora IBAN ou vazio", async () => {
    const otherType = { slot: 2, account_type: "iban", notes: "preservar exactamente" };
    result([{ ...row, foreign_bank_accounts: [foreignBank, { ...foreignBank, slot: 2, account_type: "outro" }, brBank, otherType] }]);
    mount(form({ ...supplier, iban_2: "conta 2" })); await ready();
    change("IBAN 1", validIban);
    const payload = await saved();
    expect(payload.foreign_bank_accounts).toEqual([brBank, otherType, { ...foreignBank, slot: 2, account_type: "outro", account_number: "conta 2" }]);
  });

  it("mantém os três editores independentes e pré-preenche outro por slot", async () => {
    const banks = [1, 2, 3].map(slot => ({ slot, account_type: "outro", account_number: `conta ${slot}`, bank_name: `Banco ${slot}` }));
    result([{ ...row, foreign_bank_accounts: banks }]);
    mount(form({ ...supplier, iban: "conta 1", iban_2: "conta 2", iban_3: "conta 3" })); await ready();
    expect(screen.getAllByLabelText("Banco").map(input => (input as HTMLInputElement).value)).toEqual(["Banco 1", "Banco 2", "Banco 3"]);
    fireEvent.change(screen.getAllByLabelText("Banco")[1], { target: { value: "Novo banco 2" } });
    expect((await saved()).foreign_bank_accounts).toEqual([banks[0], { ...banks[1], bank_name: "Novo banco 2" }, banks[2]]);
  });

  it("IBANs válidos mantêm o payload PT completo e não activam a RPC opcional", async () => {
    mount(form({ ...supplier, iban: validIban, iban_2: "GB82WEST12345698765432" }));
    expect(screen.queryByLabelText("Tipo de conta")).toBeNull();
    expect(f.rpc).not.toHaveBeenCalled();
    expect(await saved()).toEqual({ name: supplier.name, trade_name: null, nif: supplier.nif, contact_name: null,
      email: null, phone: null, address: null, iban: validIban, swift_bic: "BOFAUS3N", iban_2: "GB82WEST12345698765432",
      swift_bic_2: null, iban_3: null, swift_bic_3: null, payment_terms: null, category: null, notes: null, is_partner: false });
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(["check_supplier_iban_duplicate", "check_supplier_iban_duplicate"]);
  });

  it("deixar de ter estrangeiros omite todas as chaves opcionais mesmo após editar fiscal", async () => {
    mount(form()); await ready(); change("Identificador fiscal estrangeiro", "outra"); change("IBAN 1", validIban);
    expect(screen.queryByLabelText("Tipo de conta")).toBeNull();
    expectNoOptionalKeys(await saved());
  });

  it("forma IBAN inválida continua a bloquear MOD-97 mesmo com outro slot estrangeiro", async () => {
    mount(form({ ...supplier, iban_2: "PT00000201231234567890154" })); await ready();
    submit(); await waitFor(() => expect(toast.error).toHaveBeenCalledWith("IBAN 2 inválido", expect.anything()));
    expect(f.writes).toHaveLength(0);
  });

  it.each(["erro", "contrato", "sem papel", "outra empresa", "rejeição"])("%s desactiva campos e omite chaves sem impedir edição cadastral", async kind => {
    if (kind === "erro") result(null, { code: "42703" });
    if (kind === "contrato") result([{ id: supplier.id }]);
    if (kind === "sem papel") f.role = "viewer";
    if (kind === "outra empresa") result([{ ...row, id: "outro-fornecedor" }]);
    if (kind === "rejeição") f.rpc.mockImplementation(name => name === "get_supplier_bank_details"
      ? { select: () => Promise.reject(new Error("indisponível")) } : Promise.resolve({ data: { exists: false }, error: null }));
    mount(form());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getByText("Dados bancários estrangeiros indisponíveis para edição.")).toBeInTheDocument();
    expect(screen.getByLabelText("Banco")).toBeDisabled();
    expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toBeDisabled();
    expect(screen.queryByDisplayValue("95-1234567")).toBeNull();
    change("Nome da Entidade *", "Cadastro alterado");
    const payload = await saved(); expectNoOptionalKeys(payload); expect(payload.name).toBe("Cadastro alterado");
  });

  it.each(["reposto", "limpo", "tipo"])("envia o par fiscal apenas quando alterado: %s", async action => {
    mount(form()); await ready();
    change("Identificador fiscal estrangeiro", action === "limpo" ? " " : "alterado");
    if (action !== "limpo") change("Identificador fiscal estrangeiro", row.tax_id_foreign);
    if (action === "tipo") change("Tipo de identificador fiscal", "tin");
    const payload = await saved();
    if (action === "reposto") { expect(payload).not.toHaveProperty("tax_id_foreign"); expect(payload).not.toHaveProperty("tax_id_type"); }
    else expect(payload).toMatchObject({ tax_id_foreign: action === "limpo" ? null : row.tax_id_foreign, tax_id_type: action === "tipo" ? "tin" : "ein" });
  });

  it("criação usa o probe vazio, grava estrangeiro e omite fiscal vazio", async () => {
    result([]); mount(<SupplierFormModal open onOpenChange={() => {}} />);
    change("Nome da Entidade *", "Novo fornecedor"); change("IBAN 1", account); await ready();
    const payload = await saved();
    expect(payload.foreign_bank_accounts).toEqual([{ slot: 1, account_type: "outro", account_number: account }]);
    expect(payload).not.toHaveProperty("tax_id_foreign");
    expect(f.rpc).toHaveBeenCalledWith("get_supplier_bank_details", { p_supplier_ids: [] });
  });

  it("reabrir outro fornecedor não reutiliza dados bancários nem fiscais", async () => {
    const view = mount(form()); await ready(); change("Banco", "Edição não gravada");
    view.rerender(form(supplier, false));
    result([{ ...row, id: "supplier-b", foreign_bank_accounts: [], tax_id_foreign: null, tax_id_type: null }]);
    view.rerender(form({ ...supplier, id: "supplier-b" })); await ready();
    expect(screen.getByLabelText("Banco")).toHaveValue("");
    expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toHaveValue("");
  });

  it("perder papel elimina o rascunho estrangeiro e fiscal antes de gravar", async () => {
    const view = mount(form()); await ready();
    change("Banco", "Rascunho bancário"); change("Identificador fiscal estrangeiro", "Rascunho fiscal");
    f.role = "viewer"; view.rerender(form());
    await waitFor(() => expect(screen.getByLabelText("Banco")).toHaveValue(""));
    expect(screen.getByLabelText("Banco")).toBeDisabled();
    expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toHaveValue("");
    expectNoOptionalKeys(await saved());
  });
});

describe("#403 E2b — leitura de slots e apresentação PT", () => {
  it("o leitor puro selecciona apenas aba_us/outro e slots 1–3 sem alterar os elementos", () => {
    const other = { ...foreignBank, slot: 2, account_type: "outro" };
    const input = [foreignBank, brBank, other, null, 3, {}, { ...foreignBank, slot: 4 }, { ...foreignBank, slot: "1" }];
    expect(readForeignBankSlots(input)).toEqual([foreignBank, other]);
    expect(readForeignBankSlots(input)[0]).toBe(foreignBank);
    expect(readForeignBankSlots(null)).toEqual([]); expect(readForeignBankSlots({})).toEqual([]);
  });

  it("mostra todos os campos estrangeiros com botões que copiam os bytes originais sem RPC PT", () => {
    vi.useFakeTimers();
    client.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    const bank = { ...foreignBank, bank_address: "Endereço sintético", intermediary_bank: "Intermediário" };
    const writeText = vi.fn(); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const view = mount(<SupplierBankDetails supplier={{ ...supplier, foreign_bank_accounts: [bank] }} defaultExpanded />);
    for (const [key, label] of FOREIGN_BANK_FIELDS) {
      const line = screen.getByText(`${label}: ${bank[key]}`);
      fireEvent.click(within(line).getByTitle("Copiar")); expect(writeText).toHaveBeenLastCalledWith(bank[key]);
    }
    const line = screen.getByText(`Conta: ${account}`);
    fireEvent.click(within(line).getByTitle("Copiar")); expect(writeText).toHaveBeenLastCalledWith(account);
    expect(screen.getByText("Tipo de conta: Conta EUA (ABA/Routing)")).toBeInTheDocument();
    expect(f.rpc).not.toHaveBeenCalled();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("conserva elementos outro sem número legado no slot IBAN", () => {
    mount(<SupplierBankDetails supplier={{ name: "Fornecedor", foreign_bank_accounts: [{ ...foreignBank, account_type: "outro" }] }} defaultExpanded />);
    expect(screen.getByText("Tipo de conta: Outra conta fora da zona IBAN")).toBeInTheDocument();
  });

  it("supplierSchema aceita 64 caracteres e rejeita 65", () => {
    expect(supplierSchema.safeParse({ name: "Fornecedor", iban: "1".repeat(64) }).success).toBe(true);
    expect(supplierSchema.safeParse({ name: "Fornecedor", iban: "1".repeat(65) }).success).toBe(false);
  });
});
