import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { isForeignSupplier, readSupplierCountry, type SupplierCountryReader } from "@/lib/supplier-bank";
import { toast } from "sonner";

const f = vi.hoisted(() => ({
  companyCountry: "PT" as string | null, companyId: "company-a", role: "admin", userId: "user",
  savedCountry: "PT" as unknown, readError: null as unknown, rejectRead: false,
  from: vi.fn(), select: vi.fn(), eq: vi.fn(), read: vi.fn(), rpc: vi.fn(),
  writes: [] as Record<string, unknown>[],
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { country: f.companyCountry, currency: f.companyCountry === "BR" ? "BRL" : "EUR" },
  companyId: f.companyId, isLoading: false, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: f.userId }, role: f.role }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: f.from, rpc: f.rpc } }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getAuditUser: () => "fixture" }));
vi.mock("@/components/SupplierPortalUserLink", () => ({ SupplierPortalUserLink: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let client: QueryClient;
const supplier = { id: "supplier-a", name: "Fornecedor sintético", iban: "021000021 / 1234567890" };
function mount(editingSupplier?: Record<string, unknown>, open = true) {
  return render(<SupplierFormModal open={open} onOpenChange={() => {}} editingSupplier={editingSupplier} />, {
    wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
function country(value: string) { fireEvent.change(screen.getByLabelText("País"), { target: { value } }); }
async function readDone() { await waitFor(() => expect(client.isFetching()).toBe(0)); }
async function save() {
  fireEvent.submit(document.body.querySelector("form")!);
  await waitFor(() => expect(f.writes).toHaveLength(1));
  return f.writes[0];
}
function noForeignFields() {
  expect(screen.queryByLabelText("Tipo de conta")).toBeNull();
  expect(screen.queryByLabelText("Identificador fiscal estrangeiro")).toBeNull();
  expect(screen.queryByLabelText("CNPJ")).toBeNull();
}
function noOptionalWrites(payload: Record<string, unknown>) {
  for (const key of ["foreign_bank_accounts", "tax_id_foreign", "tax_id_type"]) expect(payload).not.toHaveProperty(key);
}
beforeEach(() => {
  vi.clearAllMocks();
  f.companyCountry = "PT"; f.companyId = "company-a"; f.role = "admin"; f.userId = "user";
  f.savedCountry = "PT"; f.readError = null; f.rejectRead = false; f.writes = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  f.read.mockImplementation(async (id: string) => {
    if (f.rejectRead) throw new Error("sem acesso");
    return { data: { id, country: f.savedCountry }, error: f.readError };
  });
  f.eq.mockImplementation((_column: string, id: string) => ({ maybeSingle: () => f.read(id) }));
  f.select.mockReturnValue({ eq: f.eq });
  f.from.mockImplementation((table: string) => {
    expect(table).toBe("suppliers");
    return {
      select: f.select,
      insert: (payload: Record<string, unknown>) => ({ select: () => ({ single: async () => {
        f.writes.push(payload); return { data: { id: "created" }, error: null };
      } }) }),
      update: (payload: Record<string, unknown>) => ({ eq: async () => {
        f.writes.push(payload); return { error: null };
      } }),
    };
  });
  f.rpc.mockImplementation((name: string, args: { p_supplier_ids?: string[] }) => {
    if (name === "get_supplier_bank_details") return { select: async () => ({ data: args.p_supplier_ids?.length
      ? [{ id: args.p_supplier_ids[0], foreign_bank_accounts: [], tax_id_foreign: "95-1234567", tax_id_type: "ein" }]
      : [], error: null }) };
    return Promise.resolve({ data: name === "check_supplier_similar" ? [] : { exists: false }, error: null });
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#403: rede proibida"); }));
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#403: rede proibida"); } });
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#403: rede proibida"); } });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled(); cleanup(); client.clear(); vi.unstubAllGlobals();
});

describe("#403 C3 — país literal e leitura cadastral isolada", () => {
  it.each([
    ["US", "PT", true], ["PT", "PT", false], [null, "PT", false], ["BR", "BR", false],
    ["BR", null, false], [null, null, false], ["PT", "BR", true],
  ])("isForeignSupplier(%s, %s) = %s", (supplierCountry, companyCountry, expected) => {
    expect(isForeignSupplier(supplierCountry, companyCountry)).toBe(expected);
  });
  it("lê só suppliers(id,country), conferindo o ID devolvido", async () => {
    expect(await readSupplierCountry({ from: f.from }, supplier.id)).toBe("PT");
    expect(f.from).toHaveBeenCalledExactlyOnceWith("suppliers");
    expect(f.select).toHaveBeenCalledExactlyOnceWith("id,country");
    expect(f.eq).toHaveBeenCalledExactlyOnceWith("id", supplier.id);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each([null, "pt", "USA", " PT", "", 12, {}, ["BR"]])("recusa country inválido: %j", async value => {
    f.savedCountry = value;
    expect(await readSupplierCountry({ from: f.from }, supplier.id)).toBeNull();
  });
  it.each(["erro", "rejeição", "ID diferente", "sem linha"])("leitura %s devolve null", async kind => {
    if (kind === "erro") f.readError = { code: "42501" };
    if (kind === "rejeição") f.rejectRead = true;
    if (kind === "ID diferente") f.read.mockResolvedValue({ data: { id: "other", country: "BR" }, error: null });
    if (kind === "sem linha") f.read.mockResolvedValue({ data: null, error: null });
    expect(await readSupplierCountry({ from: f.from }, supplier.id)).toBeNull();
  });
});

describe("#403 C4 — formulário decide pelo país", () => {
  it("criação PT começa nacional; US abre os blocos R1 sem depender de uma conta", async () => {
    mount();
    expect(screen.getByLabelText("País")).toHaveValue("PT"); noForeignFields();
    expect(f.from).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
    country("US");
    await waitFor(() => expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toBeEnabled());
    expect(screen.getByLabelText("Tipo de conta")).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Nome da Entidade *"), { target: { value: "Fornecedor US" } });
    expect(await save()).toMatchObject({ name: "Fornecedor US", country: "US" });
  });
  it("criação PT nacional grava country e omite as três chaves opcionais", async () => {
    mount();
    fireEvent.change(screen.getByLabelText("Nome da Entidade *"), { target: { value: "Fornecedor PT" } });
    const payload = await save();
    expect(payload.country).toBe("PT"); noOptionalWrites(payload);
  });
  it("edição country PT com conta não-IBAN não abre blocos nem lê a RPC bancária", async () => {
    mount({ ...supplier, country: "US", foreign_bank_accounts: [{ account_type: "aba_us" }], tax_id_foreign: "existente" });
    await readDone();
    expect(screen.getByLabelText("País")).toHaveValue("PT"); noForeignFields();
    expect(f.rpc).not.toHaveBeenCalled();
    const payload = await save();
    expect(payload).toMatchObject({ country: "PT", iban: supplier.iban }); noOptionalWrites(payload);
  });
  it("edição usa o country lido e permanece estrangeira com IBAN válido", async () => {
    f.savedCountry = "US";
    mount({ ...supplier, country: "PT", iban: "PT50000201231234567890154" });
    await waitFor(() => expect(screen.getByLabelText("País")).toHaveValue("US"));
    expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toBeInTheDocument();
    expect((await save()).country).toBe("US");
  });
  it.each(["erro", "inválido", "rejeição"])("leitura %s usa país da empresa e aviso sem bloquear", async failure => {
    if (failure === "erro") f.readError = { code: "42501" };
    if (failure === "inválido") f.savedCountry = "usa";
    if (failure === "rejeição") f.rejectRead = true;
    mount(supplier);
    expect(await screen.findByText(/Não foi possível ler o país do fornecedor/)).toBeInTheDocument();
    expect(screen.getByLabelText("País")).toHaveValue("PT"); noForeignFields();
    expect((await save()).country).toBe("PT");
  });
  it("BR/BR começa nacional e preserva fiscal e contas por omissão das chaves", async () => {
    f.companyCountry = "BR"; mount();
    expect(screen.getByLabelText("País")).toHaveValue("BR"); noForeignFields();
    fireEvent.change(screen.getByLabelText("Nome da Entidade *"), { target: { value: "Fornecedor BR" } });
    const payload = await save(); expect(payload.country).toBe("BR"); noOptionalWrites(payload);
    expect(f.rpc).not.toHaveBeenCalledWith("get_supplier_bank_details", expect.anything());
  });
  it("BR/PT obedece à mesma comparação e volta a nacional ao seleccionar BR", async () => {
    f.companyCountry = "BR"; f.savedCountry = "PT"; mount(supplier);
    await waitFor(() => expect(screen.getByLabelText("País")).toHaveValue("PT"));
    expect(screen.getByLabelText("CNPJ")).toBeInTheDocument();
    country("BR"); noForeignFields();
    const payload = await save(); expect(payload.country).toBe("BR"); noOptionalWrites(payload);
  });
  it("mudar de país após editar fiscal não limpa os dados estrangeiros existentes", async () => {
    f.savedCountry = "US"; mount(supplier);
    const fiscal = await screen.findByLabelText("Identificador fiscal estrangeiro");
    await waitFor(() => expect(fiscal).toBeEnabled());
    fireEvent.change(fiscal, { target: { value: "alterado" } }); country("PT");
    noForeignFields(); noOptionalWrites(await save());
  });
  it("uma leitura atrasada não substitui a escolha do operador", async () => {
    let resolve!: (value: unknown) => void;
    f.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    mount(supplier); country("ES");
    resolve({ data: { id: supplier.id, country: "BR" }, error: null }); await readDone();
    expect(screen.getByLabelText("País")).toHaveValue("ES");
    expect((await save()).country).toBe("ES");
  });
  it("trocar fornecedor/empresa e reabrir descarta o país em rascunho", async () => {
    const view = mount(supplier); await readDone(); country("US");
    f.savedCountry = "ES";
    const next = { ...supplier, id: "supplier-b" };
    view.rerender(<SupplierFormModal open onOpenChange={() => {}} editingSupplier={next} />);
    await waitFor(() => expect(screen.getByLabelText("País")).toHaveValue("ES"));
    country("US"); f.companyId = "company-b"; f.companyCountry = "BR"; f.savedCountry = "BR";
    view.rerender(<SupplierFormModal open onOpenChange={() => {}} editingSupplier={next} />);
    await readDone(); expect(screen.getByLabelText("País")).toHaveValue("BR"); noForeignFields();
    country("US");
    view.rerender(<SupplierFormModal open={false} onOpenChange={() => {}} editingSupplier={next} />);
    view.rerender(<SupplierFormModal open onOpenChange={() => {}} editingSupplier={next} />);
    await readDone(); expect(screen.getByLabelText("País")).toHaveValue("BR");
  });
  it("país vazio é inválido e não inventa PT quando a empresa não tem país", async () => {
    f.companyCountry = null; mount();
    expect(screen.getByLabelText("País")).toHaveValue("");
    fireEvent.submit(document.body.querySelector("form")!);
    expect(await screen.findByText("Selecione um país com código ISO de duas letras")).toBeInTheDocument();
    expect(f.writes).toEqual([]); expect(toast.error).toHaveBeenCalled();
  });
  it("C3: a interface do leitor é injectável sem client global", async () => {
    const reader: SupplierCountryReader = { from: () => ({ select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: { id: "only", country: "BR" }, error: null }),
    }) }) }) };
    expect(await readSupplierCountry(reader, "only")).toBe("BR");
    expect(f.from).not.toHaveBeenCalled();
  });
});
