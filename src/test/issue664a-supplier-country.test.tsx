import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { isForeignSupplier, readSupplierCountry, type SupplierCountryReader } from "@/lib/supplier-bank";

const f = vi.hoisted(() => ({
  country: "PT", companyId: "company", role: "admin", readCountry: "PT" as string | null,
  taxId: null as string | null, taxType: null as string | null,
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
  f.readCountry = "PT"; f.readError = null; f.writes = []; f.taxId = null; f.taxType = null;
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
      data: args.p_supplier_ids.map((id: string) => ({ id, foreign_bank_accounts: [], tax_id_foreign: f.taxId, tax_id_type: f.taxType })), error: null,
    }) };
    return Promise.resolve({ data: name === "check_supplier_similar" ? [] : { exists: false }, error: null });
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network blocked"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); cleanup(); client.clear(); vi.unstubAllGlobals(); });

async function foreignCountry(country = "ES") {
  change("País", country);
  await waitFor(() => expect(screen.getByLabelText("Identificador fiscal estrangeiro")).toBeEnabled());
}
describe("#664 ajuste 6643775338 — país e decisão fiscal explícitos", () => {
  it("criação abre vazia numa empresa PT; submit sem país dá erro e não escreve", async () => {
    mount();
    expect(screen.getByLabelText("País")).toHaveValue("");
    change("Nome da Entidade *", "Novo fornecedor");
    fireEvent.submit(document.querySelector("form")!);
    expect(await screen.findByText("Selecione um país")).toBeInTheDocument();
    expect(f.writes).toEqual([]);
  });
  it("não deduz o país de um IBAN PT, mesmo com empresa BR", () => {
    f.country = "BR"; mount();
    expect(screen.getByLabelText("País")).toHaveValue("");
  });
  it("edição com falha de leitura não propõe país da empresa e bloqueia mesmo após escolha", async () => {
    f.readError = { code: "42501" }; mount(supplier);
    expect(await screen.findByText(/Não foi possível ler o país/)).toBeInTheDocument();
    expect(screen.getByLabelText("País")).toHaveValue("");
    change("País", "PT"); fireEvent.submit(document.querySelector("form")!);
    expect(await screen.findByText(/Volte a abrir o formulário/)).toBeInTheDocument();
    expect(f.writes).toEqual([]);
  });
  it("país ausente lido com sucesso exige escolha e pode ser corrigido", async () => {
    f.readCountry = null; mount(supplier);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    fireEvent.submit(document.querySelector("form")!);
    expect(await screen.findByText("Selecione um país")).toBeInTheDocument();
    change("País", "PT"); expect(await save()).toMatchObject({ country: "PT" });
  });
  it("readSupplierCountry separa ausência, falha, invisibilidade e formato inesperado", async () => {
    const reader = (data: unknown, error: unknown = null): SupplierCountryReader => ({ from: () => ({ select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data, error }) }),
    }) }) });
    for (const country of [null, ""]) expect(await readSupplierCountry(reader({ id: "supplier", country }), "supplier"))
      .toEqual({ status: "available", country: null });
    expect(await readSupplierCountry(reader({ id: "supplier", country: "ES" }), "supplier"))
      .toEqual({ status: "available", country: "ES" });
    for (const data of [null, {}, { id: "other", country: "ES" }, { id: "supplier", country: "es" }, { id: "supplier", country: 42 }]) {
      expect(await readSupplierCountry(reader(data), "supplier")).toEqual({ status: "unavailable" });
    }
    expect(await readSupplierCountry(reader({ id: "supplier", country: "ES" }, { code: "42501" }), "supplier"))
      .toEqual({ status: "unavailable" });
    expect(await readSupplierCountry({ from: () => { throw Error("transport"); } }, "supplier"))
      .toEqual({ status: "unavailable" });
  });
  it("criação ES numa empresa PT sem NIF estrangeiro dá erro", async () => {
    mount(); change("Nome da Entidade *", "Novo ES"); await foreignCountry();
    fireEvent.submit(document.querySelector("form")!);
    expect(await screen.findByText(/Indique o NIF estrangeiro/)).toBeInTheDocument();
    expect(f.writes).toEqual([]);
  });
  it("criação ES com Sem NIF regista sem_nif e limpa o identificador", async () => {
    mount(); change("Nome da Entidade *", "Particular ES"); await foreignCountry();
    change("Identificador fiscal estrangeiro", "descartar");
    fireEvent.click(screen.getByLabelText("Sem NIF (particular ou sem registo)"));
    expect(await save()).toMatchObject({ country: "ES", tax_id_type: "sem_nif", tax_id_foreign: null });
  });
  it("criação ES com NIF regista o identificador, sem alterar a lógica do IBAN", async () => {
    mount(); change("Nome da Entidade *", "Empresa ES"); await foreignCountry();
    change("Identificador fiscal estrangeiro", "ES123456789");
    change("Tipo de identificador fiscal", "vat");
    expect(await save()).toMatchObject({ country: "ES", tax_id_type: "vat", tax_id_foreign: "ES123456789" });
  });
  it("edição PT → ES sem NIF dá erro", async () => {
    mount(supplier); await waitFor(() => expect(screen.getByLabelText("País")).toHaveValue("PT"));
    await foreignCountry(); fireEvent.submit(document.querySelector("form")!);
    expect(await screen.findByText(/Indique o NIF estrangeiro/)).toBeInTheDocument();
    expect(f.writes).toEqual([]);
  });
  it("edição ES antiga sem NIF mantém país e grava com aviso sem inventar sem_nif", async () => {
    f.readCountry = "ES"; mount(supplier);
    expect(await screen.findByText(/Este fornecedor estrangeiro antigo não tem NIF/)).toBeInTheDocument();
    const payload = await save(); expect(payload.country).toBe("ES");
    expect(payload).not.toHaveProperty("tax_id_type"); expect(payload).not.toHaveProperty("tax_id_foreign");
  });
  it("usa país diferente da empresa: PT numa empresa BR também exige decisão fiscal", async () => {
    f.country = "BR"; mount(); change("Nome da Entidade *", "Português"); await foreignCountry("PT");
    fireEvent.submit(document.querySelector("form")!);
    expect(await screen.findByText(/Indique o NIF estrangeiro/)).toBeInTheDocument(); expect(f.writes).toEqual([]);
  });
  it("conserva a decisão Sem NIF na edição sem mudar país", async () => {
    f.readCountry = "ES"; f.taxType = "sem_nif"; mount(supplier);
    await waitFor(() => expect(screen.getByLabelText("Sem NIF (particular ou sem registo)")).toBeChecked());
    expect(await save()).toMatchObject({ country: "ES", tax_id_type: "sem_nif", tax_id_foreign: null });
  });
});

// Cada predicado aponta ao escritor/fonte no ficheiro real, sem executar edges nem rede.
function source(path: string, token: string) {
  const text = readFileSync(path, "utf8");
  const index = text.indexOf(token);
  expect(index, `${path}: token de inventário ausente: ${token}`).toBeGreaterThanOrEqual(0);
  return { text, at: `${path}:${text.slice(0, index).split("\n").length}` };
}
describe("#664 critério 2 — inventário dos escritores e fonte de país", () => {
  it("formulário (também atalho OCR/entrada em TransactionFormModal) envia a escolha", () => {
    const s = source("src/components/SupplierFormModal.tsx", "const raw:");
    expect(s.text, s.at).toContain("name: fd.get(\"name\") as string,\n      country,");
    expect(s.text, s.at).toContain('useState("")');
    const caller = source("src/components/TransactionFormModal.tsx", "<SupplierFormModal");
    expect(caller.text, caller.at).toContain("<SupplierFormModal");
  });
  it("atalho bancário envia país escolhido e valida antes do insert", () => {
    const s = source("src/components/bank/BankLineLaunchModal.tsx", "const insertSupplier");
    expect(s.text, s.at).toContain('const [newSupplierCountry, setNewSupplierCountry] = useState("")');
    expect(s.text, s.at).toContain("country: newSupplierCountry");
    expect(s.text.indexOf('test(newSupplierCountry)'), s.at).toBeLessThan(s.text.indexOf('.insert({ name,'));
    expect(s.text, s.at).toContain('País do fornecedor novo');
  });
  it("patrocinadores lê coluna por linha, recusa sem fonte e envia p_country", () => {
    const s = source("src/components/SponsorsImportModal.tsx", "const missingCountries");
    expect(s.text, s.at).toContain('["pais", "country"]');
    expect(s.text, s.at).toContain("matrix[row.rowIndex - 1]?.[column]");
    expect(s.text, s.at).toContain("countryByRow[row.rowIndex] || newSupplierCountry");
    expect(s.text, s.at).toContain("p_country: countryForNewSupplier(name)");
    expect(s.text.indexOf("if (missingCountries.length) throw"), s.at).toBeLessThan(s.text.indexOf('supabase.rpc("supplier_resolve_or_create"'));
  });
  it("Coala exige fonte explícita nos três ramos antes dos efeitos e passa-a à RPC", () => {
    const s = source("supabase/functions/apply-coala-bp/index.ts", "const supplierCountryRequired");
    expect(s.text, s.at).toContain('json({ error: "supplier_country_required", missingSuppliers: names }, 400)');
    expect(s.text, s.at).toContain('if (phase !== "compare" && phase !== "preview" && phase !== "auto_apply")');
    expect(s.text.indexOf("supplierCountryRequired(requiredNewSuppliers)"), s.at).toBeLessThan(s.text.indexOf('// Snapshot BP (STRICT'));
    expect(s.text.match(/resolveSupplierFlagged\(admin, ev.company_id, name, supplierCountry!, flaggedCounter\)/g), s.at).toHaveLength(3);
    expect(s.text, s.at).toContain('p_country: country');
    const ui = source("src/components/CoalaImportWizard.tsx", "País dos fornecedores novos");
    expect(ui.text.match(/newSupplierCountry: newSupplierCountry \|\| null/g), ui.at).toHaveLength(2);
    expect(ui.text, ui.at).toContain('setNewSupplierNames(detail.missingSuppliers ?? [])');
    expect(ui.text.slice(ui.text.indexOf("async function handleParse()"), ui.text.indexOf("async function handleCompare()")), ui.at)
      .toContain('setNewSupplierCountry("")');
  });
  it("edge de isolamento: as três escritas usam país fixo sintético", () => {
    const s = source("supabase/functions/test-multi-tenant-isolation/index.ts", '__iso_sup_A_');
    expect(s.text.match(/name: `__iso_(?:sup_A|sup_B|attack)_\$\{stamp\}`, company_id: co[12]\.id, country: "PT"/g), s.at).toHaveLength(3);
  });
  it("SQL vivo: resolvedor recebe p_country, camarim tem excepção documentada e RLS usa país sintético", () => {
    const s = source("drizzle/migrations/0335_issue664_supplier_country_required.sql", "INSERT INTO public.suppliers");
    expect(s.text, s.at).toContain("nullif(upper(btrim(p_country)), '')");
    expect(s.text, s.at).toContain("marcador interno, não uma contraparte real");
    expect(s.text, s.at).toContain("_company_id, v_country");
    expect(s.text, s.at).toContain("VALUES ('FAKE_RLS_TEST', v_mp_id, 'PT')");
    expect(s.text).not.toContain("CREATE OR REPLACE FUNCTION public._seed_coala_from_mp");
    const historical = source("supabase/migrations/20260429225802_6f685f39-831e-4467-95de-8bc01ad2aa85.sql", "DROP FUNCTION public._seed_coala_from_mp()");
    expect(historical.text, historical.at).toContain("DROP FUNCTION public._seed_coala_from_mp()");
  });
  it("restauro pelo Lixo preserva país do snapshot e recusa snapshot sem país", () => {
    const s = source("src/pages/Trash.tsx", "const cleanData = { ...entityData }");
    expect(s.text, s.at).toContain('tableName === "suppliers"');
    expect(s.text, s.at).toContain('cleanData.country');
  });
  it("restauro backup v2 transporta linhas originais e o restauro v4 transporta p_rows para a shadow", () => {
    const v2 = source("supabase/functions/database-restore-v2/index.ts", "const rows = tables[t]");
    expect(v2.text, v2.at).toContain("stripUnknownCols(rows, cols)");
    expect(v2.text, v2.at).toContain("admin.from(t).upsert(batch");
    const v4 = source("supabase/functions/database-restore/index.ts", "p_table: t, p_rows: batch");
    expect(v4.text, v4.at).toContain('"suppliers"');
    const sql = source("supabase/migrations/20260918213949_6198d6fe-858e-444b-a986-3f4c6f75b9cd.sql", "-- Reposição (pais primeiro).");
    expect(sql.text, sql.at).toContain("s.column_name = p.column_name");
    expect(sql.text, sql.at).toContain("INSERT INTO %I.%I (%s) SELECT %s FROM restore_shadow.%I");
  });
});
