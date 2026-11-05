import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Suppliers from "@/pages/Suppliers";
import Trash from "@/pages/Trash";
import { COUNTRIES } from "@/lib/crm/countries";

const f = vi.hoisted(() => ({
  from: vi.fn(), snapshot: vi.fn(), supplierDelete: vi.fn(), insert: vi.fn(), update: vi.fn(),
  toast: vi.fn(), errorToast: vi.fn(), readError: false, country: "ES" as string | null,
  snapshotCountry: undefined as unknown, cascade: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: f.from } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "fixture@example.invalid" }, role: "admin", hasPermission: () => true,
}) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: "company", company: { country: "PT", currency: "EUR" } }) }));
vi.mock("@/lib/trash", () => ({ moveToTrash: f.snapshot, entityTypeLabels: { supplier: "Fornecedor" } }));
vi.mock("@/hooks/use-toast", () => ({ toast: f.toast }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: f.errorToast } }));
vi.mock("@/lib/supplier-lifecycle", () => ({
  fetchSupplierUsage: async () => ({ canDelete: true, blocking: [], cascade: [] }),
  fetchSupplierCascadeRows: f.cascade, deactivateSupplier: vi.fn(), reactivateSupplier: vi.fn(), describeUsage: () => "",
}));
vi.mock("@/components/SupplierFormModal", () => ({ SupplierFormModal: () => null }));
vi.mock("@/components/SupplierTransactions", () => ({ SupplierTransactions: () => null }));
vi.mock("@/components/SupplierCreditsPanel", () => ({ SupplierCreditsPanel: () => null }));
vi.mock("@/components/supplier-credits/SupplierCreditsTab", () => ({ SupplierCreditsTab: () => null }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));

const supplier = { id: "supplier", name: "Fornecedor", is_active: true };
let client: QueryClient;
function mount(element: React.ReactElement) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(["suppliers"], [supplier]);
  return render(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);
}
async function deleteSupplier() {
  mount(<Suppliers />);
  fireEvent.click(screen.getByTitle("Eliminar"));
  const ready = await screen.findByText("Não há registos associados a apagar.");
  fireEvent.click(within(ready.parentElement!).getByRole("button", { name: "Eliminar" }));
}
async function restoreDialog() {
  mount(<Trash />);
  fireEvent.click(await screen.findByRole("button", { name: "Restaurar" }));
  return within(screen.getByRole("alertdialog"));
}
beforeEach(() => {
  vi.clearAllMocks(); f.readError = false; f.country = "ES"; f.snapshotCountry = undefined;
  f.snapshot.mockResolvedValue(true); f.supplierDelete.mockResolvedValue({ error: null });
  f.insert.mockResolvedValue({ error: null }); f.update.mockResolvedValue({ error: null }); f.cascade.mockResolvedValue({});
  f.from.mockImplementation((table: string) => {
    if (table === "suppliers") return {
      select: (columns: string) => {
        expect(columns).toBe("id,country");
        return { eq: (column: string, id: string) => {
          expect([column, id]).toEqual(["id", "supplier"]);
          return { maybeSingle: async () => ({ data: { id, country: f.country }, error: f.readError ? { message: "denied" } : null }) };
        } };
      },
      delete: () => ({ eq: f.supplierDelete }), insert: f.insert,
    };
    if (table === "trash") return {
      select: () => ({ is: () => ({ order: async () => ({ data: [{
        id: "trash", entity_id: "supplier", entity_type: "supplier",
        entity_data: { ...supplier, ...(f.snapshotCountry === undefined ? {} : { country: f.snapshotCountry }), updated_at: "old" },
        deleted_at: "2026-11-01T00:00:00Z", expires_at: "2026-12-01T00:00:00Z",
      }], error: null }) }) }),
      update: (payload: unknown) => ({ eq: (...args: unknown[]) => f.update(payload, ...args) }),
    };
    throw new Error(`Unexpected table ${table}`);
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("network forbidden"); }));
});
afterEach(() => { cleanup(); client?.clear(); expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("#664b critério 4 — snapshot de fornecedor", () => {
  it("lê o país cadastral e guarda-o antes de apagar", async () => {
    await deleteSupplier();
    await waitFor(() => expect(f.supplierDelete).toHaveBeenCalledWith("id", "supplier"));
    expect(f.snapshot).toHaveBeenCalledWith(expect.objectContaining({ entity_data: { ...supplier, country: "ES" } }));
    expect(f.snapshot.mock.invocationCallOrder[0]).toBeLessThan(f.supplierDelete.mock.invocationCallOrder[0]);
  });
  it("falha de leitura não guarda snapshot nem apaga e mostra o erro", async () => {
    f.readError = true;
    await deleteSupplier();
    await waitFor(() => expect(f.errorToast).toHaveBeenCalledWith("Erro ao eliminar", expect.objectContaining({ description: expect.stringContaining("Não foi possível ler o país") })));
    expect(f.snapshot).not.toHaveBeenCalled(); expect(f.supplierDelete).not.toHaveBeenCalled();
    expect(f.cascade).not.toHaveBeenCalled();
  });
  it("país ilegível não produz snapshot sem país", async () => {
    f.country = "es";
    await deleteSupplier();
    await waitFor(() => expect(f.errorToast).toHaveBeenCalled());
    expect(f.snapshot).not.toHaveBeenCalled(); expect(f.supplierDelete).not.toHaveBeenCalled();
  });
  it("NULL cadastral lido com sucesso fica explícito no snapshot e exige escolha no restauro", async () => {
    f.country = null;
    await deleteSupplier();
    await waitFor(() => expect(f.supplierDelete).toHaveBeenCalled());
    expect(f.snapshot).toHaveBeenCalledWith(expect.objectContaining({ entity_data: { ...supplier, country: null } }));
  });
  it("snapshot recusado pelo Lixo não apaga o fornecedor", async () => {
    f.snapshot.mockResolvedValue(false);
    await deleteSupplier();
    await waitFor(() => expect(f.errorToast).toHaveBeenCalled());
    expect(f.supplierDelete).not.toHaveBeenCalled();
  });
});

describe("#664b critério 4 — restauro de fornecedor", () => {
  it.each([undefined, null, "", "es", "XYZ"])("snapshot antigo/inválido %s pede país vazio e restaura só com escolha", async (country) => {
    f.snapshotCountry = country;
    const dialog = await restoreDialog();
    const select = dialog.getByLabelText("País do fornecedor");
    expect(select).toHaveValue("");
    expect(dialog.getAllByRole("option").map(o => o.getAttribute("value"))).toEqual(["", ...Object.keys(COUNTRIES)]);
    fireEvent.change(select, { target: { value: "DE" } });
    fireEvent.click(dialog.getByRole("button", { name: "Restaurar" }));
    await waitFor(() => expect(f.insert).toHaveBeenCalledWith({ ...supplier, country: "DE" }));
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ restored_at: expect.any(String) }), "id", "trash");
  });
  it("sem escolha conserva a guarda e não escreve fornecedor nem marca restauro", async () => {
    const dialog = await restoreDialog();
    fireEvent.click(dialog.getByRole("button", { name: "Restaurar" }));
    await waitFor(() => expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Erro ao restaurar", description: expect.stringContaining("escolha explícita") })));
    expect(f.insert).not.toHaveBeenCalled(); expect(f.update).not.toHaveBeenCalled();
    expect(dialog.getByLabelText("País do fornecedor")).toHaveValue("");
  });
  it("snapshot com país válido preserva-o sem pedir nova escolha", async () => {
    f.snapshotCountry = "BR";
    const dialog = await restoreDialog();
    expect(dialog.queryByLabelText("País do fornecedor")).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Restaurar" }));
    await waitFor(() => expect(f.insert).toHaveBeenCalledWith({ ...supplier, country: "BR" }));
  });
  it("cancelar e reabrir limpa uma escolha não confirmada", async () => {
    const dialog = await restoreDialog();
    fireEvent.change(dialog.getByLabelText("País do fornecedor"), { target: { value: "ES" } });
    fireEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(screen.getByLabelText("País do fornecedor")).toHaveValue("");
    expect(f.insert).not.toHaveBeenCalled();
  });
});
