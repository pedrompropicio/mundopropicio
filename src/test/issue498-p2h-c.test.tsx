import { createHash } from "node:crypto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierBankDetails } from "@/components/SupplierBankDetails";
import { SupplierFormModal } from "@/components/SupplierFormModal";
import { fetchOptionalSupplierBrData } from "@/lib/supplier-bank";
import { optionalBankColumns } from "@/components/SupplierBankDetails";

const f = vi.hoisted(() => ({
  country: "PT", companyId: "company", role: "admin", rpc: vi.fn(), projection: vi.fn(),
  selects: [] as string[], writes: [] as Record<string, unknown>[],
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  company: { id: f.companyId, country: f.country, currency: f.country === "BR" ? "BRL" : "EUR" },
  companyId: f.companyId, isLoading: false, isError: false,
}) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user" }, role: f.role, isAdmin: f.role === "admin", isManager: false, hasPermission: () => true,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: f.rpc,
  from: () => {
    const q = {
      select: (columns: string) => {
        f.selects.push(columns);
        if (/foreign_bank_accounts|tax_id_foreign|tax_id_type|\*/.test(columns)) {
          throw new Error("#498: SELECT direto dos campos BR proibido");
        }
        return q;
      },
      update: (payload: Record<string, unknown>) => { f.writes.push(payload); return q; },
      eq: () => q,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return q;
  },
} }));
vi.mock("@/components/SupplierPortalUserLink", () => ({ SupplierPortalUserLink: () => null }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn(), getAuditUser: () => "fixture" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const supplier = {
  id: "11111111-1111-4111-8111-111111111111", name: "Fornecedor fixture", nif: "PT-OLD",
  iban: "PT50000201231234567890154", swift_bic: "CGDIPTPL",
  iban_2: "DE89370400440532013000", swift_bic_2: "COBADEFFXXX", notes: "Fixture",
};
const otherBank = { slot: 2, account_type: "aba_us", routing_number: "0123", notes: "reter" };
const brBank = {
  slot: 1, account_type: "br_banco_agencia_conta", bank_name: "Banco fixture", routing_number: "0001",
  account_number: "00123", account_digit: "X", account_kind: "poupanca", pix_key: "fixture@example.invalid",
  notes: "  metadado retido  ",
};
const brRow = { id: supplier.id, foreign_bank_accounts: [brBank, otherBank], tax_id_foreign: "12345678000199", tax_id_type: "cpf" };
function rpcResult(data: unknown, error: unknown = null) {
  f.projection.mockResolvedValue({ data, error });
  f.rpc.mockReturnValue({ select: f.projection });
}
let client: QueryClient;
function mount(ui: React.ReactNode) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
function form(editingSupplier: Record<string, unknown> | undefined) {
  return <SupplierFormModal open onOpenChange={() => {}} editingSupplier={editingSupplier} />;
}
// Snapshot compacto de todo o DOM; apenas IDs gerados pelo Radix são normalizados.
function dom() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
beforeEach(() => {
  vi.clearAllMocks();
  f.country = "PT"; f.companyId = "company"; f.role = "admin"; f.selects = []; f.writes = [];
  rpcResult([brRow]);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498: rede proibida"); }));
});

describe("#498 P2h-c — formulário BR lê exclusivamente a RPC", () => {
  it("hidrata banco/agência/conta/dígito/tipo/Pix e identificador fiscal da RPC", async () => {
    f.country = "BR";
    mount(form({ ...supplier, foreign_bank_accounts: [{ ...brBank, bank_name: "PROP PROIBIDA" }], tax_id_foreign: "PROP" }));
    await waitFor(() => expect(screen.getAllByLabelText("Banco")[0]).toHaveValue("Banco fixture"));
    expect(screen.getAllByLabelText("Agência")[0]).toHaveValue("0001");
    expect(screen.getAllByLabelText("Conta")[0]).toHaveValue("00123");
    expect(screen.getAllByLabelText("Dígito")[0]).toHaveValue("X");
    expect(screen.getAllByLabelText("Tipo de conta")[0]).toHaveValue("poupanca");
    expect(screen.getAllByLabelText("Chave Pix")[0]).toHaveValue("fixture@example.invalid");
    expect(screen.getByLabelText("CPF")).toHaveValue("12345678000199");
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("get_supplier_bank_details", { p_supplier_ids: [supplier.id] });
    expect(f.projection).toHaveBeenCalledExactlyOnceWith("id,foreign_bank_accounts,tax_id_foreign,tax_id_type");
    expect(f.selects).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("continua a atualizar slots pelo formulário, retendo outros tipos e metadados", async () => {
    f.country = "BR";
    mount(form(supplier));
    await waitFor(() => expect(screen.getAllByLabelText("Conta")[0]).toHaveValue("00123"));
    expect(screen.getAllByLabelText("Banco")[1]).toBeDisabled();
    fireEvent.change(screen.getAllByLabelText("Conta")[0], { target: { value: "00999" } });
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.writes).toHaveLength(1));
    expect(f.writes[0].foreign_bank_accounts).toEqual([otherBank, { ...brBank, account_number: "00999" }]);
    expect(f.writes[0]).not.toHaveProperty("tax_id_foreign");
    expect(f.writes[0]).not.toHaveProperty("tax_id_type");
    expect(f.writes[0].nif).toBe("PT-OLD");
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.selects).toEqual([]);
  });

  it("criação verifica a projeção com IDs vazios, sem ler outros fornecedores", async () => {
    f.country = "BR"; rpcResult([]);
    mount(form(undefined));
    await waitFor(() => expect(screen.getAllByLabelText("Banco")[0]).toBeEnabled());
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("get_supplier_bank_details", { p_supplier_ids: [] });
    expect(screen.getAllByLabelText("Banco")[0]).toHaveValue("");
    expect(f.selects).toEqual([]);
  });

  it.each(["PGRST202", "42703", "PGRST204", "42501", "XX000", "rejeição"])(
    "RPC indisponível (%s) permite guardar dados base e omite slots BR", async code => {
      f.country = "BR";
      if (code === "rejeição") f.projection.mockRejectedValue(new Error("offline"));
      else rpcResult(null, { code, message: "fixture" });
      mount(form({ ...supplier, ...brRow }));
      await waitFor(() => expect(f.projection).toHaveBeenCalledTimes(1));
      expect(screen.getByText("Dados bancários indisponíveis para edição.")).toBeInTheDocument();
      expect(screen.getAllByLabelText("Banco")[0]).toBeDisabled();
      expect(screen.getAllByLabelText("Banco")[0]).toHaveValue("");
      expect(screen.getByLabelText("CNPJ")).toHaveValue("");
      fireEvent.change(screen.getByLabelText("Nome da Entidade *"), { target: { value: "Nome atualizado" } });
      fireEvent.submit(document.body.querySelector("form")!);
      await waitFor(() => expect(f.writes).toHaveLength(1));
      expect(f.writes[0].name).toBe("Nome atualizado");
      expect(f.writes[0]).not.toHaveProperty("foreign_bank_accounts");
      expect(f.rpc).toHaveBeenCalledTimes(1);
      expect(f.selects).toEqual([]);
    },
  );

  it.each([undefined, supplier])("erro na RPC durante criação/edição deixa os campos indisponíveis", async editing => {
    f.country = "BR"; rpcResult(null, { code: "PGRST202" });
    mount(form(editing));
    await waitFor(() => expect(f.projection).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Dados bancários indisponíveis para edição.")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Banco").every(input => input.closest("fieldset")?.disabled)).toBe(true);
  });

  it("não consulta a RPC nem usa props BR para um papel sem acesso", () => {
    f.country = "BR"; f.role = "viewer";
    mount(form({ ...supplier, ...brRow }));
    expect(f.rpc).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText("Banco")[0]).toBeDisabled();
    expect(screen.getAllByLabelText("Banco")[0]).toHaveValue("");
  });

  it("não reutiliza dados após mudar de fornecedor ou de empresa", async () => {
    f.country = "BR";
    const { rerender } = mount(form(supplier));
    await waitFor(() => expect(screen.getAllByLabelText("Banco")[0]).toHaveValue("Banco fixture"));
    const next = { ...supplier, id: "22222222-2222-4222-8222-222222222222" };
    rpcResult(null, { code: "42501" });
    rerender(<QueryClientProvider client={client}>{form(next)}</QueryClientProvider>);
    await waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(2));
    expect(f.rpc).toHaveBeenLastCalledWith("get_supplier_bank_details", { p_supplier_ids: [next.id] });
    expect(screen.getAllByLabelText("Banco")[0]).toHaveValue("");
    f.companyId = "outra-empresa";
    rerender(<QueryClientProvider client={client}>{form(next)}</QueryClientProvider>);
    await waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(3));
    expect(screen.getAllByLabelText("Banco")[0]).toHaveValue("");
    expect(f.selects).toEqual([]);
  });

  it("RPC antiga recusa a projeção mesmo sem linhas na criação", async () => {
    f.country = "BR";
    // A chamada existe, mas as colunas não fazem parte do RETURNS TABLE anterior à 0305.
    f.rpc.mockReturnValue({ select: (columns: string) => {
      expect(columns).toContain("foreign_bank_accounts");
      return Promise.resolve({ data: null, error: { code: "42703" } });
    } });
    mount(form(undefined));
    await waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(1));
    expect(screen.getAllByLabelText("Banco")[0]).toBeDisabled();
    expect(screen.getByText("Dados bancários indisponíveis para edição.")).toBeInTheDocument();
    expect(f.rpc).toHaveBeenCalledWith("get_supplier_bank_details", { p_supplier_ids: [] });
  });
});

describe("#498 P2h-c — detalhe e contrato opcionais", () => {
  it("detalhes apresentam apenas os dados BR retornados pela RPC", async () => {
    f.country = "BR";
    mount(<SupplierBankDetails supplier={supplier} defaultExpanded />);
    await screen.findByText("Conta: 00123");
    expect(screen.getByText("CPF: 12345678000199")).toBeInTheDocument();
    expect(screen.getByText("Tipo de conta: Poupança")).toBeInTheDocument();
    expect(screen.queryByText(/PT-OLD/)).not.toBeInTheDocument();
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.selects).toEqual([]);
  });
  it("não recupera dados BR das props quando a RPC falha", async () => {
    f.country = "BR"; rpcResult(null, { code: "42501" });
    mount(<SupplierBankDetails supplier={{ ...supplier, ...brRow }} defaultExpanded />);
    await waitFor(() => expect(f.projection).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Dados bancários indisponíveis.")).toBeInTheDocument();
    expect(screen.queryByText("Conta: 00123")).not.toBeInTheDocument();
  });
  it.each([null, [], [{ id: supplier.id }], [{ ...brRow, id: "outro" }], [{ ...brRow, tax_id_type: 123 }]])(
    "resultado vazio/antigo/inválido não é confundido com campos editáveis: %j", async data => {
      rpcResult(data);
      await expect(fetchOptionalSupplierBrData(supplier.id)).resolves.toEqual({ available: false, details: null });
      expect(f.selects).toEqual([]);
    },
  );
  it("campos nulos num contrato 0305 válido são editáveis", async () => {
    rpcResult([{ id: supplier.id, foreign_bank_accounts: null, tax_id_foreign: null, tax_id_type: null }]);
    await expect(fetchOptionalSupplierBrData(supplier.id)).resolves.toEqual({
      available: true, details: { foreign_bank_accounts: null, tax_id_foreign: null, tax_id_type: null },
    });
  });
  it("optionalBankColumns para fornecedores verifica só a RPC sem SELECT direto", async () => {
    rpcResult([]);
    await expect(optionalBankColumns("suppliers", "foreign_bank_accounts,tax_id_foreign,tax_id_type")).resolves.toBe(true);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("get_supplier_bank_details", { p_supplier_ids: [] });
    rpcResult(null, { code: "42501" });
    await expect(optionalBankColumns("suppliers", "foreign_bank_accounts")).resolves.toBe(false);
    expect(f.selects).toEqual([]);
  });
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

describe("#498 P2h-c — snapshots PT capturados antes da alteração", () => {
  it("preserva o DOM dos formulários PT de criação e edição", () => {
    const hashes: string[] = [];
    for (const editing of [undefined, supplier]) {
      const { unmount } = mount(form(editing));
      hashes.push(dom());
      unmount(); cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      [
        "22258efe1e47b6cf22186236816e1c5be1c9f8f0ca9f562b65e8fedd02655de2",
        "51893fc10bafe7600322f3804e6520f32951c050eb030684ceaf47615b0bd5b6",
      ]
    `);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.selects).toEqual([]);
  });
  it("preserva o DOM dos detalhes PT recolhidos e expandidos", () => {
    const hashes: string[] = [];
    for (const expanded of [false, true]) {
      const { unmount } = mount(<SupplierBankDetails supplier={supplier} defaultExpanded={expanded} />);
      hashes.push(dom());
      unmount(); cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      [
        "bcd3a2b9d87cad0ebe8f6b45ff795f2e95f2a15af76ccbdb8cdcee03b759e99b",
        "f0adb33fb154d87bc5917c86868fa188010f47ffc22cd31e8591046c56970880",
      ]
    `);
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
