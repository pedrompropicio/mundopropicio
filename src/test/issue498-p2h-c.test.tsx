import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { loadOptionalSupplierBrData, optionalBankColumns } from "@/components/SupplierBankDetails";
import { projectSupplierBrData, readOptionalSupplierBrData, type SupplierBrReader } from "@/lib/supplier-bank";

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
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: f.rpc, from: f.from,
} }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getAuditUser: () => "fixture" }));
vi.mock("@/components/SupplierPortalUserLink", () => ({ SupplierPortalUserLink: () => null }));

const ptSupplier = { country: "PT",
  id: "supplier-a", name: "Fornecedor PT", nif: "509123456", contact_name: "Contacto",
  email: "pt@example.invalid", iban: "PT50000201231234567890154", swift_bic: "BPLIPTPL",
  iban_2: "GB82WEST12345698765432", swift_bic_2: "WESTGB2L", notes: "Notas PT",
};
function countrySelect(columns: string) {
  expect(columns).toBe("id,country");
  return { eq: (column: string, id: string) => {
    expect(column).toBe("id");
    return { maybeSingle: async () => ({ data: { id, country: f.country }, error: null }) };
  } };
}
function expectCountryReads() {
  expect(f.from).toHaveBeenCalledWith("suppliers");
  expect(f.from.mock.calls.every(([table]) => table === "suppliers")).toBe(true);
  expect(f.writes).toEqual([]);
}
let client: QueryClient;
function mount(element: React.ReactElement) {
  return render(element, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
// Captured against the original components before changing the BR reader.
// Hash the complete DOM; normalize only React's generated Radix identifiers.
function dom() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
beforeEach(() => {
  vi.clearAllMocks(); f.country = "PT"; f.companyId = "company-a"; f.role = "admin"; f.writes = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  f.rpc.mockReturnValue({ select: async () => ({ data: [], error: null }) });
  f.from.mockImplementation((table: string) => {
    expect(table).toBe("suppliers");
    return { select: countrySelect };
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: network blocked"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#498: network blocked"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#498: network blocked"); } });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  cleanup(); client.clear(); vi.unstubAllGlobals();
});

describe("#498 P2h-c — quatro snapshots DOM PT anteriores à alteração", () => {
  it("criação PT", () => {
    mount(<SupplierFormModal open onOpenChange={() => {}} />);
    expect(dom()).toMatchInlineSnapshot(`"491b39bce2616e350bd3d6a20cd7c2d1be27d750092e2e0d8224ec2cf92a80b7"`);
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
  });
  it("edição PT", () => {
    mount(<SupplierFormModal open onOpenChange={() => {}} editingSupplier={ptSupplier} />);
    expect(dom()).toMatchInlineSnapshot(`"7c0f0f0a442c23c902023b307ff3adb85dcef77a19d03f68a48ddc7df3bdcac7"`);
    expect(f.rpc).not.toHaveBeenCalled(); expectCountryReads();
  });
  it("detalhes PT recolhidos", () => {
    mount(<SupplierBankDetails supplier={ptSupplier} />);
    expect(dom()).toMatchInlineSnapshot(`"4729e0cc8a75334573580214f959430784c87886c78946966f37c5171dd758c3"`);
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
  });
  it("detalhes PT expandidos", () => {
    mount(<SupplierBankDetails supplier={ptSupplier} defaultExpanded />);
    expect(screen.getByText("509123456")).toBeInTheDocument();
    expect(dom()).toMatchInlineSnapshot(`"bdd706020c54ed6ec9655c51a299d027132af17511f5746432c1c0618398418f"`);
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
  });
});

const bank = { slot: 2, account_type: "br_banco_agencia_conta", bank_name: "Banco BR", routing_number: "0001",
  account_number: "00123", account_digit: "X", account_kind: "poupanca", pix_key: "pix@example.invalid",
  notes: "  metadados originais  ", beneficiary_name: "Beneficiário", custom: { untouched: true } };
const brRow = { id: "supplier-a", foreign_bank_accounts: [bank], tax_id_foreign: "12345678000199", tax_id_type: "cnpj" };
const staleSupplier = { country: "BR", id: "supplier-a", name: "Fornecedor BR", nif: "NIF-PT",
  foreign_bank_accounts: [{ ...bank, bank_name: "BANCO DAS PROPS", account_number: "PROPS-CONTA" }],
  tax_id_foreign: "PROPS-FISCAL", tax_id_type: "cpf" };
function result(data: unknown, error: unknown = null) {
  const select = vi.fn(async () => ({ data, error }));
  f.rpc.mockReturnValue({ select });
  return select;
}
function form() { return <SupplierFormModal open onOpenChange={() => {}} editingSupplier={staleSupplier} />; }
function allowUpdate() {
  f.from.mockImplementation((table: string) => ({ select: countrySelect, update: (payload: any) => ({ eq: async (_column: string, id: string) => {
    f.writes.push({ table, payload, id }); return { error: null };
  } }) }));
}

describe("#498 P2h-c — leitor RPC inerte e contrato", () => {
  it("usa o ID exato e projeta os três campos exclusivamente da RPC", async () => {
    const select = result([brRow]);
    expect(await loadOptionalSupplierBrData("supplier-a")).toEqual({ available: true, details: {
      foreign_bank_accounts: [bank], tax_id_foreign: "12345678000199", tax_id_type: "cnpj",
    } });
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("get_supplier_bank_details", { p_supplier_ids: ["supplier-a"] });
    expect(select).toHaveBeenCalledWith("id,foreign_bank_accounts,tax_id_foreign,tax_id_type");
    expect(f.from).not.toHaveBeenCalled();
  });
  it("criação sonda apenas [] e valida as colunas no resultado da função", async () => {
    const select = result([]);
    await expect(loadOptionalSupplierBrData()).resolves.toEqual({ available: true, details: null });
    expect(f.rpc).toHaveBeenCalledWith("get_supplier_bank_details", { p_supplier_ids: [] });
    expect(select).toHaveBeenCalledWith("id,foreign_bank_accounts,tax_id_foreign,tax_id_type");
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each(["foreign_bank_accounts", "tax_id_foreign", "tax_id_type"])("rejeita contrato antigo sem %s", async field => {
    const row: Record<string, unknown> = { ...brRow }; delete row[field];
    result([row]);
    await expect(loadOptionalSupplierBrData("supplier-a")).resolves.toEqual({ available: false, details: null });
  });
  it.each([null, {}, [], [{ ...brRow, id: "another-supplier" }], [brRow, brRow],
    [{ ...brRow, foreign_bank_accounts: {} }], [{ ...brRow, tax_id_type: 123 }]])("rejeita resposta inválida/sem acesso %j", data => {
    expect(projectSupplierBrData(data, "supplier-a")).toEqual({ available: false, details: null });
  });
  it.each(["PGRST202", "PGRST204", "42703", "42501", "transport"])("degrada erro %s em indisponível", async code => {
    result(null, { code, message: "unavailable" });
    await expect(loadOptionalSupplierBrData("supplier-a")).resolves.toEqual({ available: false, details: null });
    await expect(optionalBankColumns("suppliers", "foreign_bank_accounts,tax_id_foreign,tax_id_type")).resolves.toBe(false);
    expect(f.from).not.toHaveBeenCalled();
  });
  it("aceita nulos e slots vazios num contrato atual", () => {
    expect(projectSupplierBrData([{ ...brRow, foreign_bank_accounts: [], tax_id_foreign: null, tax_id_type: null }], "supplier-a"))
      .toEqual({ available: true, details: { foreign_bank_accounts: [], tax_id_foreign: null, tax_id_type: null } });
  });
  it("RPC ausente ou transporte rejeitado fica indisponível", async () => {
    const unavailable = { available: false, details: null };
    await expect(readOptionalSupplierBrData({} as SupplierBrReader, "supplier-a")).resolves.toEqual(unavailable);
    f.rpc.mockImplementation(() => { throw new Error("transport"); });
    await expect(loadOptionalSupplierBrData("supplier-a")).resolves.toEqual(unavailable);
    f.rpc.mockReturnValue({ select: async () => { throw new Error("transport"); } });
    await expect(loadOptionalSupplierBrData("supplier-a")).resolves.toEqual(unavailable);
  });
});

describe("#498 P2h-c — UI BR pela RPC", () => {
  beforeEach(() => { f.country = "BR"; });
  it("preenche banco/agência/conta/dígito/tipo/Pix e identificador fiscal", async () => {
    result([brRow]); mount(form());
    await waitFor(() => expect(screen.getAllByLabelText("Banco")[1]).toHaveValue("Banco BR"));
    expect(screen.getAllByLabelText("Agência")[1]).toHaveValue("0001");
    expect(screen.getAllByLabelText("Conta")[1]).toHaveValue("00123");
    expect(screen.getAllByLabelText("Dígito")[1]).toHaveValue("X");
    expect(screen.getAllByLabelText("Tipo de conta")[1]).toHaveValue("poupanca");
    expect(screen.getAllByLabelText("Chave Pix")[1]).toHaveValue("pix@example.invalid");
    expect(screen.getByLabelText("CNPJ")).toHaveValue("12.345.678/0001-99");
    expect(screen.queryByDisplayValue(/PROPS|NIF-PT/)).toBeNull();
    expectCountryReads();
  });
  it("detalhes mostram valores BR e não tratam NIF como CNPJ", async () => {
    result([brRow]); mount(<SupplierBankDetails supplier={staleSupplier} defaultExpanded />);
    await screen.findByText("Conta: 00123");
    for (const text of ["Banco: Banco BR", "Agência: 0001", "Dígito: X", "Tipo de conta: Poupança",
      "Chave Pix: pix@example.invalid", "CNPJ: 12.345.678/0001-99"]) expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByText(/PROPS|NIF-PT/)).toBeNull(); expect(f.from).not.toHaveBeenCalled();
  });
  it("grava pelo UPDATE existente preservando outros slots e metadados", async () => {
    const other = { slot: 1, account_type: "aba_us", account_number: "001", notes: "original", custom: [1, 2] };
    const unknown = { slot: 7, account_type: "outro", notes: "preservar" };
    result([{ ...brRow, foreign_bank_accounts: [other, bank, unknown] }]); allowUpdate(); mount(form());
    await waitFor(() => expect(screen.getAllByLabelText("Conta")[1]).toHaveValue("00123"));
    expect(screen.getAllByLabelText("Banco")[0]).toBeDisabled();
    fireEvent.change(screen.getAllByLabelText("Conta")[1], { target: { value: "00999" } });
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0]).toMatchObject({ table: "suppliers", id: "supplier-a", payload: { nif: "NIF-PT",
      foreign_bank_accounts: [other, unknown, { ...bank, account_number: "00999" }],
    } });
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_foreign");
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_type");
  });
  it.each(["sem acesso", "RPC ausente", "contrato antigo"])("%s permite gravação cadastral sem fallback", async failure => {
    f.role = failure === "sem acesso" ? "viewer" : "admin";
    if (failure === "RPC ausente") result(null, { code: "PGRST202" });
    else if (failure === "contrato antigo") result([{ id: "supplier-a", iban: null }]);
    else result([]);
    allowUpdate(); mount(form());
    await waitFor(() => expect(f.rpc).toHaveBeenCalled());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getByText("Dados bancários indisponíveis para edição.")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Banco")[1]).toBeDisabled();
    expect(screen.getAllByLabelText("Conta")[1]).toHaveValue("");
    expect(screen.getByLabelText("CNPJ")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Guardar Alterações" })).toBeEnabled();
    await waitFor(() => expect(screen.getByLabelText("País")).toHaveValue("BR"));
    fireEvent.change(screen.getByLabelText("Nome da Entidade *"), { target: { value: "Cadastro alterado" } });
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].payload.name).toBe("Cadastro alterado");
    expect(f.writes[0].payload.nif).toBe("NIF-PT");
    expect(f.writes[0].payload).not.toHaveProperty("foreign_bank_accounts");
    expect(f.writes[0].payload).not.toHaveProperty("tax_id_foreign");
  });
  it("sem acesso nos detalhes não recupera valores das props", async () => {
    result([]); mount(<SupplierBankDetails supplier={staleSupplier} defaultExpanded />);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getByText("Dados bancários indisponíveis.")).toBeInTheDocument();
    expect(screen.queryByText(/PROPS|NIF-PT/)).toBeNull();
  });
  it("perda de acesso apaga os valores anteriormente lidos no formulário", async () => {
    result([brRow]); const { rerender } = mount(form());
    await waitFor(() => expect(screen.getAllByLabelText("Conta")[1]).toHaveValue("00123"));
    f.role = "viewer"; result([]); rerender(form());
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getAllByLabelText("Conta")[1]).toHaveValue("");
    expect(screen.getAllByLabelText("Banco")[1]).toBeDisabled();
    expect(screen.getByLabelText("CNPJ")).toHaveValue("");
    expect(screen.queryByDisplayValue(/PROPS/)).toBeNull();
    expectCountryReads();
  });
  it("criação BR sonda [] e permite preencher slots", async () => {
    result([]); mount(<SupplierFormModal open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getAllByLabelText("Banco")[0]).toBeEnabled());
    expect(f.rpc).toHaveBeenCalledWith("get_supplier_bank_details", { p_supplier_ids: [] });
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each(["viewer", "producer"])("criação BR com %s mantém campos bancários e fiscais indisponíveis mesmo com contrato disponível", async role => {
    f.role = role;
    result([]); mount(<SupplierFormModal open onOpenChange={() => {}} />);
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("get_supplier_bank_details", { p_supplier_ids: [] }));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getByText("Dados bancários indisponíveis para edição.")).toBeInTheDocument();
    for (const label of ["Banco", "Agência", "Conta", "Dígito", "Tipo de conta", "Chave Pix"]) {
      for (const field of screen.getAllByLabelText(label)) {
        expect(field).toBeDisabled();
        expect(field).toHaveValue("");
      }
    }
    expect(screen.getByLabelText("CNPJ")).toBeDisabled();
    expect(screen.getByLabelText("CNPJ")).toHaveValue("");
    expect(screen.getByLabelText("Tipo de identificador fiscal")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Criar Fornecedor" })).toBeEnabled();
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each(["formulário", "detalhes"])("%s isola troca de fornecedor/empresa e ignora resposta atrasada", async view => {
    let finishOld!: (value: unknown) => void;
    const pending = new Promise(resolve => { finishOld = resolve; });
    f.rpc.mockReturnValueOnce({ select: () => pending });
    const element = (supplier = staleSupplier) => view === "formulário"
      ? <SupplierFormModal open onOpenChange={() => {}} editingSupplier={supplier} />
      : <SupplierBankDetails supplier={supplier} defaultExpanded />;
    const { rerender } = mount(element());
    await waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(1));
    result([{ ...brRow, id: "supplier-b", foreign_bank_accounts: [{ ...bank, account_number: "NOVA-CONTA" }] }]);
    const next = { ...staleSupplier, id: "supplier-b" };
    rerender(element(next));
    if (view === "formulário") await waitFor(() => expect(screen.getAllByLabelText("Conta")[1]).toHaveValue("NOVA-CONTA"));
    else await screen.findByText("Conta: NOVA-CONTA");
    expect(f.rpc).toHaveBeenCalledWith("get_supplier_bank_details", { p_supplier_ids: ["supplier-b"] });
    finishOld({ data: [brRow], error: null });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByText("Conta: 00123")).toBeNull();
    expect(screen.queryByDisplayValue("00123")).toBeNull();
    f.companyId = "company-b"; result([]); rerender(element(next));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByText("Conta: NOVA-CONTA")).toBeNull();
    expect(screen.queryByDisplayValue("NOVA-CONTA")).toBeNull();
    expect(screen.getByText(/Dados bancários indisponíveis/)).toBeInTheDocument();
    if (view === "formulário") expectCountryReads();
    else expect(f.from).not.toHaveBeenCalled();
  });
});
