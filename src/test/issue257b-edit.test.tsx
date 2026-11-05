import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { useCompany } from "@/hooks/useCompany";
import { resolveCompanyLocale } from "@/lib/company-locale";
import { vatNonRecoverableEdit } from "@/lib/vat-non-recoverable";
import * as sharedPaymentMethods from "../../supabase/functions/_shared/payment-methods";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, any>, writes: [] as { table: string; payload: any }[],
  queryFns: {} as Record<string, () => Promise<any>>, selects: [] as { table: string; columns: string }[],
  updates: [] as { table: string; payload: any }[], filters: [] as { table: string; column: string; value: any }[],
  mutations: [] as Promise<any>[], toast: vi.fn(), invoke: vi.fn(),
  isAdmin: true, isManager: false, localeOverride: null as any,
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "fixture@example.invalid" }, isAdmin: f.isAdmin, isManager: f.isManager, hasPermission: () => true,
}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, queryFn }: any) => {
    f.queryFns[queryKey[0]] = queryFn;
    return { data: f.queries[queryKey[0]], isLoading: false };
  },
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
      update: (payload: any) => { f.updates.push({ table, payload }); return q; },
      select: (columns: string) => { f.selects.push({ table, columns }); return q; },
      eq: (column: string, value: any) => { f.filters.push({ table, column, value }); return q; },
      in: () => q, is: () => q, order: () => q, limit: () => q, range: () => q, or: () => q,
      single: async () => ({ data: { id: "created" }, error: null }),
      maybeSingle: async () => ({ data: table === "event_forecasts" ? f.queries["linked-forecast"] ?? null : null, error: null }),
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




vi.mock("@/hooks/useCompanyLocale", async original => {
  const actual = await original<typeof import("@/hooks/useCompanyLocale")>();
  return { useCompanyLocale: () => f.localeOverride ?? actual.useCompanyLocale() };
});
const row = {
  id: "transaction", description: "Despesa fixture", amount: 100, date: "2026-11-02",
  supplier_id: "supplier", type: "expense", status: "pending", currency: "EUR",
  event_id: null, category_id: null, account_id: "account", iva_rate: 21,
  is_transitory: false, is_confidential: false, is_reimbursement: false,
  excluded_from_partner_settlement: false, exclude_from_result: false, payment_method: "transfer",
  declared_withholding_rate: null, declared_withholding_amount: null,
};
const checkboxName = /^IVA não recuperável \(vai ao custo\)/;
function edit(overrides = {}, canApprove = true) {
  return render(<MemoryRouter><TransactionEditModal onClose={vi.fn()} canApprove={canApprove}
    transaction={{ ...row, ...overrides }} /></MemoryRouter>);
}
async function submit() {
  fireEvent.submit(document.body.querySelector("form")!);
  await waitFor(() => expect(f.mutations).toHaveLength(1));
  await Promise.all(f.mutations);
}
function payload() { return f.invoke.mock.calls.find(([name]) => name === "update-transaction")![1].body; }
function changeDescription() {
  const input = document.body.querySelector<HTMLInputElement>('input[value="Despesa fixture"]')!;
  fireEvent.change(input, { target: { value: "Despesa revista" } });
}
beforeEach(() => {
  vi.clearAllMocks(); f.isAdmin = true; f.isManager = false; f.localeOverride = null;
  f.queries = { "event-iva-country": ["Espanha"] }; f.mutations = [];
  f.queryFns = {}; f.selects = []; f.updates = []; f.filters = []; f.writes = [];
  vi.mocked(useCompany).mockReturnValue({ company: { id: "company", country: "PT", currency: "EUR" },
    companyId: "company", isLoading: false, isError: false } as ReturnType<typeof useCompany>);
  f.invoke.mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#257b: rede proibida"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); cleanup(); vi.unstubAllGlobals(); });

describe("#257b C1 — edição real", () => {
  it.each([false, true])("inicializa %s e grava a alteração inversa com auditoria", async original => {
    edit({ vat_non_recoverable: original });
    const checkbox = screen.getByRole("checkbox", { name: checkboxName });
    expect(checkbox).toHaveProperty("checked", original);
    expect(screen.getByText("O IVA desta fatura não é dedutível (ex.: IVA estrangeiro). Conta como custo, pela taxa da transação."))
      .toBeInTheDocument();
    fireEvent.click(checkbox);
    await submit();
    expect(payload().updates).toMatchObject({ vat_non_recoverable: !original, amount: 100, iva_rate: 21 });
    expect(payload().changes).toContainEqual({ field_name: "IVA não recuperável",
      old_value: original ? "sim" : "não", new_value: original ? "não" : "sim" });
  });
  it.each([undefined, false, true])("sem tocar na marcação %s não envia chave nem auditoria", async original => {
    edit({ vat_non_recoverable: original }); changeDescription(); await submit();
    expect(payload().updates).not.toHaveProperty("vat_non_recoverable");
    expect(payload().changes).toEqual([{ field_name: "Descrição", old_value: "Despesa fixture", new_value: "Despesa revista" }]);
  });
  it("preserva o no-op de uma marcada", async () => {
    edit({ vat_non_recoverable: true }); await submit(); expect(f.invoke).not.toHaveBeenCalled();
  });
  it("IVA zero limpa a marcação original", async () => {
    edit({ vat_non_recoverable: true });
    fireEvent.change(screen.getAllByRole("combobox").find(node => node.querySelector('option[value="21"]'))!,
      { target: { value: "0" } });
    expect(screen.queryByRole("checkbox", { name: checkboxName })).not.toBeInTheDocument();
    await submit();
    expect(payload().updates).toMatchObject({ iva_rate: 0, vat_non_recoverable: false });
    expect(payload().changes).toContainEqual({ field_name: "IVA não recuperável", old_value: "sim", new_value: "não" });
  });
  it.each([{ type: "income" }, { iva_rate: 0 }])("oculta para %j", overrides => {
    edit(overrides); expect(screen.queryByRole("checkbox", { name: checkboxName })).not.toBeInTheDocument();
  });
  it.each(["sem capability", "sem IVA"])("oculta com empresa %s", state => {
    const locale = resolveCompanyLocale({ country: "PT", currency: "EUR" });
    f.localeOverride = state === "indisponível" ? { status: "unavailable" }
      : state === "sem IVA" ? resolveCompanyLocale({ country: "BR", currency: "BRL" })
      : { ...locale, capabilities: { ...(locale as any).capabilities, iva: false } };
    edit(); expect(screen.queryByRole("checkbox", { name: checkboxName })).not.toBeInTheDocument();
  });
  it("mantém caixa oculta e fora do payload pago sem permissão", async () => {
    edit({ status: "paid", vat_non_recoverable: true }, false);
    expect(screen.queryByRole("checkbox", { name: checkboxName })).not.toBeInTheDocument();
    const input = screen.getByText("Especificação").parentElement!.querySelector("input")!;
    fireEvent.change(input, { target: { value: "Conferida" } });
    await submit();
    expect(payload().updates).not.toHaveProperty("vat_non_recoverable");
  });
  it("bloqueia a caixa no grupo de parcelas e não envia a chave", async () => {
    f.queries["installment-group"] = [row, { ...row, id: "installment-2" }];
    edit({ vat_non_recoverable: true });
    expect(screen.getByRole("checkbox", { name: checkboxName })).toBeDisabled();
    changeDescription(); await submit();
    expect(payload().updates).not.toHaveProperty("vat_non_recoverable");
  });
  it("inclui a caixa na proteção contra descartar alterações", () => {
    edit(); fireEvent.click(screen.getByRole("checkbox", { name: checkboxName }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar transação" }));
    expect(screen.getByText("Descartar alterações?")).toBeInTheDocument();
  });
});

describe("#257b C1 — normalização pura da edição", () => {
  it.each([
    { original: false, checked: true, next: true, dirty: true },
    { original: true, checked: false, next: false, dirty: true },
    { original: undefined, checked: false, next: false, dirty: false },
    { original: true, checked: true, next: true, dirty: false },
  ])("$original → $checked", ({ next, dirty, ...input }) => {
    expect(vatNonRecoverableEdit({ ...input, type: "expense", ivaRate: 21, hasIva: true, noIva: false }))
      .toEqual({ next, dirty });
  });
});

// Handler real transpilado; clientes, sessão e filhos são exclusivamente sintéticos.
const edgeCode = ts.transpileModule(readFileSync("supabase/functions/update-transaction/index.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function edgeFixture(original = false, paidLocked = false) {
  let handler: (req: Request) => Promise<Response>;
  const writes: { table: string; value: any; id?: string }[] = [];
  const tx = { id: "tx", company_id: "company", status: paidLocked ? "paid" : "pending",
    payment_method: "transfer", vat_non_recoverable: original };
  const children = [
    { id: "split", split_percentage: 50, status: "pending" },
    { id: "installment", split_percentage: null, status: "pending" },
    { id: "approved", split_percentage: null, status: "approved" },
    { id: "paid", split_percentage: null, status: "paid" },
  ];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "actor", user_metadata: {} } }, error: null }) },
    rpc: async (name: string) => ({ data: name === "is_platform_admin" ? !paidLocked : false, error: null }),
    from: (table: string) => {
      const data = table === "transactions" ? tx : table === "user_roles" ? [{ role: "editor", company_id: "company" }]
        : table === "profiles" ? { company_id: "company" } : [];
      const result = { data, error: null };
      let write: typeof writes[number] | undefined;
      const q: any = {
        select: () => q, in: () => q, limit: () => q,
        eq: (key: string, value: string) => { if (write && key === "id") write.id = value; return q; },
        single: async () => result, maybeSingle: async () => result,
        update: (value: any) => { write = { table, value }; writes.push(write); return q; },
        insert: (value: any) => { writes.push({ table, value }); return q; },
        then: (resolve: any) => Promise.resolve(result).then(resolve),
      };
      return q;
    },
  };
  runInNewContext(edgeCode, {
    exports: {}, Response, console,
    Deno: { serve: (fn: typeof handler) => { handler = fn; }, env: { get: () => "inert-fixture" } },
    require: (name: string) => {
      if (name === "npm:@supabase/supabase-js@2") return { createClient: () => client };
      if (name === "../_shared/paging.ts") return { fetchAllPagedQuery: async () => ({ data: children }) };
      if (name === "../_shared/payment-methods.ts") return sharedPaymentMethods;
      throw new Error(`Importação não autorizada: ${name}`);
    },
  });
  return { writes, update: (updates: Record<string, unknown>, changes: unknown[] = []) => handler!(new Request("https://fixture.invalid", {
    method: "POST", headers: { Authorization: "Bearer inert-fixture" }, body: JSON.stringify({ transaction_id: "tx", updates, changes }),
  })) };
}
describe("#257b C1 — edge real escreve e propaga", () => {
  it.each([false, true])("propaga a mudança para %s a rateio e parcelas pendentes", async next => {
    const edge = edgeFixture(!next);
    const change = { field_name: "IVA não recuperável", old_value: next ? "não" : "sim", new_value: next ? "sim" : "não" };
    expect((await edge.update({ vat_non_recoverable: next }, [change])).status).toBe(200);
    expect(edge.writes.filter(w => w.table === "transactions")).toEqual(
      ["tx", "split", "installment", "approved"].map(id => ({ table: "transactions", id, value: { vat_non_recoverable: next } })),
    );
    expect(edge.writes.find(w => w.table === "transaction_audit_log")?.value).toEqual([expect.objectContaining(change)]);
  });
  it("sem alteração não propaga nem aceita auditoria sem escrita", async () => {
    const edge = edgeFixture();
    expect((await edge.update({ description: "revista" }, [{ field_name: "IVA não recuperável" }])).status).toBe(200);
    expect(edge.writes.filter(w => w.table === "transactions").every(w => !("vat_non_recoverable" in w.value))).toBe(true);
    expect(edge.writes.find(w => w.table === "transaction_audit_log")?.value)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ field_name: "IVA não recuperável" })]));
  });
  it("recusa o campo em paga sem permissão sem alargar paidAllowedFields", async () => {
    const edge = edgeFixture(false, true);
    expect((await edge.update({ vat_non_recoverable: true })).status).toBe(422);
    expect(edge.writes).toEqual([]);
  });
});
