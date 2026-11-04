import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { isForeignSupplier, readSupplierCountry, type SupplierCountryReader } from "@/lib/supplier-bank";

const f = vi.hoisted(() => ({
  country: "PT", companyId: "company", role: "admin", readCountry: "PT" as string | null,
  readError: null as unknown, from: vi.fn(), rpc: vi.fn(), writes: [] as any[],
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { country: f.country, currency: f.country === "BR" ? "BRL" : "EUR" },
  companyId: f.companyId, isLoading: false, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user" }, role: f.role }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: f.from, rpc: f.rpc } }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getAuditUser: () => "fixture" }));
vi.mock("@/components/SupplierPortalUserLink", () => ({ SupplierPortalUserLink: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
let client: QueryClient;
const supplier = { id: "supplier", name: "Fornecedor", iban: "021000021 1234567890" };
function mount(editingSupplier?: Record<string, unknown>) {
  return render(<SupplierFormModal open editingSupplier={editingSupplier} onOpenChange={() => {}} />,
    { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
function change(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
async function save() {
  fireEvent.submit(document.querySelector("form")!);
  await waitFor(() => expect(f.writes).toHaveLength(1)); return f.writes[0];
}
beforeEach(() => {
  vi.clearAllMocks(); f.country = "PT"; f.companyId = "company"; f.role = "admin";
  f.readCountry = "PT"; f.readError = null; f.writes = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  f.from.mockImplementation(table => {
    expect(table).toBe("suppliers");
    return {
      select: (columns: string) => {
        expect(columns).toBe("id,country");
        return { eq: (column: string, id: string) => {
          expect(column).toBe("id");
          return { maybeSingle: async () => ({ data: { id, country: f.readCountry }, error: f.readError }) };
        } };
      },
      insert: (payload: any) => ({ select: () => ({ single: async () => {
        f.writes.push(payload); return { data: { id: "created" }, error: null };
      } }) }),
      update: (payload: any) => ({ eq: async () => { f.writes.push(payload); return { error: null }; } }),
    };
  });
  f.rpc.mockImplementation((name, args) => {
    if (name === "get_supplier_bank_details") return { select: async () => ({
      data: args.p_supplier_ids.map((id: string) => ({ id, foreign_bank_accounts: [], tax_id_foreign: null, tax_id_type: null })), error: null,
    }) };
    return Promise.resolve({ data: name === "check_supplier_similar" ? [] : { exists: false }, error: null });
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network blocked"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); cleanup(); client.clear(); vi.unstubAllGlobals(); });

describe("#403 — regra literal de país", () => {
  it.each([["US", "PT", true], ["PT", "PT", false], [null, "PT", false], ["BR", "BR", false],
    ["US", null, false], ["PT", "BR", true]] as const)("%s / %s => %s", (supplierCountry, companyCountry, expected) => {
    expect(isForeignSupplier(supplierCountry, companyCountry)).toBe(expected);
  });
  it.each(["BR", null, "br", "BRA", "P1", " PT "])("lê país exato e recusa valor inválido %s", async country => {
    f.readCountry = country;
    expect(await readSupplierCountry({ from: f.from }, "supplier")).toBe(country && /^[A-Z]{2}$/.test(country) ? country : null);
  });
  it("erro, rejeição, ausência ou ID diferente devolvem null", async () => {
    f.readError = { code: "42501" };
    expect(await readSupplierCountry({ from: f.from }, "supplier")).toBeNull();
    const reader = (data: unknown, error = null): SupplierCountryReader => ({ from: () => ({ select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data, error }) }),
    }) }) });
    expect(await readSupplierCountry(reader(null), "supplier")).toBeNull();
    expect(await readSupplierCountry(reader({ id: "other", country: "US" }), "supplier")).toBeNull();
    expect(await readSupplierCountry({ from: () => { throw new Error("transport"); } }, "supplier")).toBeNull();
  });
});

describe("#403 — País no formulário", () => {
  it("criação PT herda PT, mudar US mostra o bloco estrangeiro e grava country", async () => {
    mount(); expect(screen.getByLabelText("País")).toHaveValue("PT");
    expect(screen.queryByLabelText("Identificador fiscal estrangeiro")).toBeNull();
    change("País", "US");
    expect(screen.getAllByLabelText("ABA / Routing")).toHaveLength(3);
    change("Nome da Entidade *", "Fornecedor US"); change("IBAN 1", supplier.iban);
    await waitFor(() => expect(screen.getAllByLabelText("ABA / Routing")[0]).toBeEnabled());
    expect(await save()).toMatchObject({ country: "US", foreign_bank_accounts: [
      { slot: 1, account_type: "outro", account_number: supplier.iban },
    ] });
  });
  it("edição PT com não-IBAN não mostra blocos nem regrava dados estrangeiros", async () => {
    mount({ ...supplier, country: "US", foreign_bank_accounts: [{ secret: "preservar" }] });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getByLabelText("País")).toHaveValue("PT");
    expect(screen.queryByLabelText("ABA / Routing")).toBeNull();
    expect(screen.queryByLabelText("Identificador fiscal estrangeiro")).toBeNull();
    const payload = await save(); expect(payload.country).toBe("PT");
    for (const key of ["foreign_bank_accounts", "tax_id_foreign", "tax_id_type"]) expect(payload).not.toHaveProperty(key);
  });
  it("edição lê US e mudar para PT retira blocos e preserva dados existentes por omissão", async () => {
    f.readCountry = "US"; mount(supplier);
    await waitFor(() => expect(screen.getByLabelText("País")).toHaveValue("US"));
    await waitFor(() => expect(screen.getAllByLabelText("ABA / Routing")[0]).toBeEnabled());
    change("Identificador fiscal estrangeiro", "EIN"); change("País", "PT");
    const payload = await save(); expect(payload.country).toBe("PT");
    for (const key of ["foreign_bank_accounts", "tax_id_foreign", "tax_id_type"]) expect(payload).not.toHaveProperty(key);
  });
  it("US continua estrangeiro com IBAN válido ou vazio", async () => {
    f.readCountry = "US"; mount({ ...supplier, iban: "PT50000201231234567890154" });
    await waitFor(() => expect(screen.getByLabelText("País")).toHaveValue("US"));
    expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toBeInTheDocument();
    expect(screen.getAllByLabelText("ABA / Routing")).toHaveLength(3);
    change("IBAN 1", "");
    expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toBeInTheDocument();
  });
  it("empresa BR herda BR por omissão", () => {
    f.country = "BR"; mount(); expect(screen.getByLabelText("País")).toHaveValue("BR");
    expect(screen.queryByLabelText("Identificador fiscal estrangeiro")).toBeNull();
  });
  it("empresa BR usa o mesmo critério ao escolher US e regressar a BR", async () => {
    f.country = "BR"; mount(); change("País", "US");
    expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toBeInTheDocument();
    expect(screen.getAllByLabelText("ABA / Routing")).toHaveLength(3);
    change("País", "BR");
    expect(screen.queryByLabelText("Identificador fiscal estrangeiro")).toBeNull();
  });
  it("leitura falhada usa país da empresa, avisa e permite gravar", async () => {
    f.readError = { code: "42501" }; mount(supplier);
    expect(await screen.findByText(/Não foi possível ler o país/)).toBeInTheDocument();
    expect(screen.getByLabelText("País")).toHaveValue("PT"); expect((await save()).country).toBe("PT");
  });
  it("não preenche PT quando a empresa não tem país e valida vazio", async () => {
    f.country = ""; mount(); change("Nome da Entidade *", "Fornecedor");
    expect(screen.getByLabelText("País")).toHaveValue("");
    fireEvent.submit(document.querySelector("form")!);
    expect(await screen.findByText("Selecione um país")).toBeInTheDocument(); expect(f.writes).toEqual([]);
  });
});
