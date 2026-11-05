import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { showVatNonRecoverable, withVatNonRecoverable } from "@/lib/vat-non-recoverable";
import { resolveCompanyLocale, type CompanyLocale } from "@/lib/company-locale";
import { useCompany } from "@/hooks/useCompany";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, any>, writes: [] as { table: string; payload: any }[],
  localeOverride: null as CompanyLocale | null,
  mutations: [] as Promise<any>[], toast: vi.fn(), invoke: vi.fn(),
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/hooks/useCompanyLocale", async importOriginal => {
  const actual = await importOriginal<typeof import("@/hooks/useCompanyLocale")>();
  return { ...actual, useCompanyLocale: () => {
    const locale = actual.useCompanyLocale();
    return f.localeOverride ? { ...locale, ...f.localeOverride } : locale;
  } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "fixture@example.invalid" }, isAdmin: true, isManager: false, hasPermission: () => true,
}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({ data: f.queries[queryKey[0]], isLoading: false }),
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
      update: () => q,
      select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q, limit: () => q, neq: () => q, not: () => q, range: () => q,
      single: async () => ({ data: { id: `created-${f.writes.length}` }, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return q;
  },
} }));
vi.mock("@/hooks/use-toast", () => ({ toast: f.toast }));
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
vi.mock("@/components/ui/overlay-layer", () => ({ OverlayLayer: ({ children }: any) => <div>{children}</div> }));

function company(country = "PT", currency = "EUR", overrides = {}) {
  vi.mocked(useCompany).mockReturnValue({
    company: { id: "company", country, currency }, companyId: "company", isLoading: false, isError: false, ...overrides,
  } as ReturnType<typeof useCompany>);
}
const defaults = { description: "Fixture", amount: "1000", date: "2026-11-02", supplier_id: "supplier" };
function form(type: "expense" | "income" = "expense") {
  return <TransactionFormModal onClose={() => {}} defaults={{ ...defaults, type }} />;
}
function dom() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function submit(container: HTMLElement) { fireEvent.submit(container.querySelector("form")!); }
beforeEach(() => {
  vi.clearAllMocks(); company(); f.writes = []; f.mutations = []; f.localeOverride = null;
  f.queries = { "event-iva-country": ["Portugal"] };
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#257: rede proibida"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Capturados com o formulário original, antes de acrescentar a caixa #257.
describe("#257 — hashes PT/EUR anteriores à alteração", () => {
  it("preserva a receita com IVA 23", () => {
    render(form("income"));
    expect(dom()).toMatchInlineSnapshot(`"e595bd824d74fbe26a1378488c1ba2d6a8ed3a2f128d9199c425c6cbd0a6d483"`);
  });
  it("preserva a despesa com IVA 0", () => {
    render(<TransactionFormModal onClose={() => {}} defaults={{ ...defaults, type: "expense", iva_rate: 0 }} />);
    expect(dom()).toMatchInlineSnapshot(`"554d3a9f8a5486cb84fe8562ba912f6ef272c1e57f33c8a5370aeade1ce41779"`);
  });
});

const checkboxName = /^IVA não recuperável \(vai ao custo\)/;
async function saved(container: HTMLElement) {
  submit(container);
  await waitFor(() => expect(f.mutations).toHaveLength(1));
  await Promise.all(f.mutations);
  expect(fetch).not.toHaveBeenCalled();
  expect(f.invoke).not.toHaveBeenCalled();
  return f.writes.filter(w => w.table === "transactions").flatMap(w => w.payload);
}

describe("#257 — criação com IVA não recuperável", () => {
  it.each([false, true, "desmarcada novamente"] as const)("grava a marcação %s sem alterar base/taxa", async checked => {
    const { container } = render(form());
    const checkbox = screen.getByRole("checkbox", { name: checkboxName });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("O IVA desta fatura não é dedutível (ex.: IVA estrangeiro). Conta como custo, pela taxa da transação."))
      .toBeInTheDocument();
    if (checked) fireEvent.click(checkbox);
    if (checked === "desmarcada novamente") fireEvent.click(checkbox);
    const txs = await saved(container);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ type: "expense", amount: 1000, iva_rate: 23 });
    if (checked === true) expect(txs[0].vat_non_recoverable).toBe(true);
    else expect(txs[0]).not.toHaveProperty("vat_non_recoverable");
  });

  it.each([
    { type: "expense", iva_rate: 0 },
    { type: "income", iva_rate: 23 },
  ] as const)("não mostra caixa nem acrescenta chave para $type a $iva_rate%", async data => {
    const { container } = render(<TransactionFormModal onClose={() => {}} defaults={{ ...defaults, ...data }} />);
    expect(screen.queryByRole("checkbox", { name: checkboxName })).not.toBeInTheDocument();
    const txs = await saved(container);
    expect(txs).toHaveLength(1);
    expect(txs[0]).not.toHaveProperty("vat_non_recoverable");
  });

  it("usa capabilities.iva=false mesmo com política PT e taxa 23", () => {
    const locale = resolveCompanyLocale({ country: "PT", currency: "EUR" }) as CompanyLocale;
    f.localeOverride = { ...locale, capabilities: { ...locale.capabilities, iva: false } };
    render(form());
    expect(screen.getByText("Taxa IVA")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: checkboxName })).not.toBeInTheDocument();
  });

  it("não mostra caixa para empresa BR sem IVA", async () => {
    company("BR", "BRL");
    const { container } = render(form());
    expect(screen.queryByRole("checkbox", { name: checkboxName })).not.toBeInTheDocument();
    const txs = await saved(container);
    expect(txs[0]).toMatchObject({ iva_rate: 0, amount: 1000, currency: "BRL" });
    expect(txs[0]).not.toHaveProperty("vat_non_recoverable");
  });

  it("uma caixa marcada deixa de escrever a chave quando a taxa passa a zero", async () => {
    const { container } = render(form());
    fireEvent.click(screen.getByRole("checkbox", { name: checkboxName }));
    const ivaSelect = screen.getAllByRole("combobox").find(node => node.querySelector('option[value="23"]'))!;
    fireEvent.change(ivaSelect, { target: { value: "0" } });
    expect(screen.queryByRole("checkbox", { name: checkboxName })).not.toBeInTheDocument();
    const txs = await saved(container);
    expect(txs[0]).toMatchObject({ iva_rate: 0 });
    expect(txs[0]).not.toHaveProperty("vat_non_recoverable");
  });

  it("aceita IVA 21 da transação sem depender do país do fornecedor", async () => {
    f.queries["event-iva-country"] = ["Espanha"];
    const { container } = render(<TransactionFormModal onClose={() => {}} defaults={{ ...defaults, type: "expense", iva_rate: 21 }} />);
    fireEvent.click(screen.getByRole("checkbox", { name: checkboxName }));
    const txs = await saved(container);
    expect(txs[0]).toMatchObject({ amount: 1000, iva_rate: 21, vat_non_recoverable: true });
  });

  it.each([false, true])("propaga a marcação %s a todas as parcelas pela interface", async checked => {
    const { container } = render(form());
    if (checked) fireEvent.click(screen.getByRole("checkbox", { name: checkboxName }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Pagar em parcelas/ }));
    fireEvent.change(screen.getByText("Nº parcelas").parentElement!.querySelector("input")!, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Distribuir igualmente/ }));
    const txs = await saved(container);
    expect(txs).toHaveLength(3);
    expect(txs.reduce((sum, tx) => sum + tx.amount, 0)).toBeCloseTo(1000, 4);
    for (const tx of txs) {
      expect(tx.iva_rate).toBe(23);
      if (checked) expect(tx.vat_non_recoverable).toBe(true);
      else expect(tx).not.toHaveProperty("vat_non_recoverable");
    }
  });

  it.each([false, true])("propaga a marcação %s à mãe e às filhas do rateio", async checked => {
    f.queries["events-active"] = [
      { id: "event-a", name: "Evento A", pl_mode: "passive", event_type: "single" },
      { id: "event-b", name: "Evento B", pl_mode: "passive", event_type: "single" },
    ];
    const { container } = render(form());
    if (checked) fireEvent.click(screen.getByRole("checkbox", { name: checkboxName }));
    fireEvent.click(screen.getByRole("button", { name: /Dividir por vários eventos/ }));
    for (const name of ["Evento A", "Evento B"]) {
      fireEvent.click(screen.getByRole("button", { name: "Adicionar evento…" }));
      fireEvent.click(screen.getByRole("button", { name }));
    }
    const txs = await saved(container);
    expect(txs).toHaveLength(3);
    expect(txs.map(tx => [tx.event_id, tx.amount])).toEqual([[null, 1000], ["event-a", 500], ["event-b", 500]]);
    expect(txs.slice(1).every(tx => tx.parent_transaction_id === "created-1")).toBe(true);
    for (const tx of txs) {
      expect(tx.iva_rate).toBe(23);
      if (checked) expect(tx.vat_non_recoverable).toBe(true);
      else expect(tx).not.toHaveProperty("vat_non_recoverable");
    }
  });

  it.each([false, true])("propaga a marcação %s às duas pernas do custo partilhado", async checked => {
    f.queries["events-active"] = [{ id: "event", name: "Evento fixture", pl_mode: "passive", event_type: "single" }];
    f.queries["circuit-accounts"] = [{ id: "circuit", name: "Circuito fixture" }];
    const { container } = render(<TransactionFormModal onClose={() => {}} defaults={{ ...defaults, type: "expense", event_id: "event" }} />);
    if (checked) fireEvent.click(screen.getByRole("checkbox", { name: checkboxName }));
    fireEvent.click(screen.getByRole("button", { name: "Custo partilhado com terceiros" }));
    fireEvent.change(screen.getAllByRole("combobox").find(node => node.querySelector('option[value="circuit"]'))!, { target: { value: "circuit" } });
    fireEvent.change(screen.getByPlaceholderText("Vazio = a linha inteira é de terceiros"), { target: { value: "25" } });
    const txs = await saved(container);
    expect(txs).toHaveLength(2);
    expect(txs.map(tx => tx.amount)).toEqual([750, 250]);
    expect(txs[0].invoice_group_id).toBe(txs[1].invoice_group_id);
    expect(txs[1].shared_cost_account_id).toBe("circuit");
    for (const tx of txs) {
      expect(tx.iva_rate).toBe(23);
      if (checked) expect(tx.vat_non_recoverable).toBe(true);
      else expect(tx).not.toHaveProperty("vat_non_recoverable");
    }
  });
});

const rates = [23, "21", 0, "0", -1, "", "inválida", null, undefined, NaN];
const visibilityCases = ["expense", "income", "transfer"].flatMap(type => rates.flatMap(ivaRate =>
  [false, true].flatMap(hasIva => [false, true].map(noIva => ({
    type, ivaRate, hasIva, noIva,
    expected: hasIva && !noIva && type === "expense" && (ivaRate === 23 || ivaRate === "21"),
  }))),
));
describe("#257 — funções puras", () => {
  it.each(visibilityCases)("visibilidade $type/$ivaRate, hasIva=$hasIva, noIva=$noIva", ({ expected, ...input }) => {
    expect(showVatNonRecoverable(input)).toBe(expected);
  });

  it.each(["expense", "income", "transfer"].flatMap(type => rates.flatMap(iva_rate =>
    [false, true].map(checked => ({ type, iva_rate, checked })),
  )))("payload $type/$iva_rate, checked=$checked", ({ type, iva_rate, checked }) => {
    const payload = Object.freeze({ type, iva_rate, amount: 243.98, invoice_ref: "FIXTURE" });
    const before = JSON.stringify(payload);
    const result = withVatNonRecoverable(payload, checked);
    if (checked && type === "expense" && (iva_rate === 23 || iva_rate === "21")) {
      expect(result).toEqual({ ...payload, vat_non_recoverable: true });
      expect(result).not.toBe(payload);
    } else {
      expect(result).toBe(payload);
      expect(JSON.stringify(result)).toBe(before);
      expect(result).not.toHaveProperty("vat_non_recoverable");
    }
    expect(JSON.stringify(payload)).toBe(before);
    expect(payload).not.toHaveProperty("vat_non_recoverable");
  });
});
