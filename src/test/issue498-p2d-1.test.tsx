import { createHash } from "node:crypto";
import SharedCostFields from "@/components/SharedCostFields";
import { resolveCompanyLocale } from "@/lib/company-locale";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionEditModal } from "@/components/TransactionEditModal";
import { MemoryRouter } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, any>, writes: [] as { table: string; payload: any }[],
  mutations: [] as Promise<any>[], toast: vi.fn(), invoke: vi.fn(),
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
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
      select: () => q, eq: () => q, in: () => q, is: () => q, order: () => q,
      single: async () => ({ data: { id: "created" }, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
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

function company(country = "PT", currency = "EUR", overrides = {}) {
  vi.mocked(useCompany).mockReturnValue({
    company: { id: "company", country, currency }, companyId: "company", isLoading: false, isError: false, ...overrides,
  } as ReturnType<typeof useCompany>);
}
const fixture = {
  id: "transaction", description: "Fixture", amount: 1000, date: "2026-11-02",
  supplier_id: "supplier", type: "expense", status: "pending", currency: "EUR",
  event_id: null, category_id: null, account_id: null, iva_rate: 23,
  is_transitory: false, is_confidential: false, is_reimbursement: false,
  excluded_from_partner_settlement: false, exclude_from_result: false, payment_method: "transfer",
  declared_withholding_rate: null, declared_withholding_amount: null,
};
function modal(overrides = {}) {
  return <MemoryRouter><TransactionEditModal onClose={() => {}} canApprove transaction={{ ...fixture, ...overrides }} /></MemoryRouter>;
}
function dom(container: HTMLElement) {
  return createHash("sha256").update(container.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function currencySelect() {
  return screen.getAllByRole("combobox").find(node => node.querySelector('option[value="USD"]'))!;
}
function shared(split?: Partial<NonNullable<React.ComponentProps<typeof SharedCostFields>["split"]>>, context = {}) {
  return <SharedCostFields accountId="circuit" counterpartyId="" onChange={vi.fn()} grossAmount={1230}
    suppliers={[]} {...context} {...(split ? { split: {
      totalNet: 1000, ivaRate: 23, mode: "absolute" as const, value: "250",
      onModeChange: vi.fn(), onValueChange: vi.fn(), ...split,
    } } : {})} />;
}
async function save(container: HTMLElement) {
  fireEvent.change(screen.getByDisplayValue("Fixture"), { target: { value: "Fixture editada" } });
  fireEvent.submit(document.body.querySelector("form")!);
  await waitFor(() => expect(f.mutations).toHaveLength(1));
  await Promise.all(f.mutations);
  expect(f.invoke).toHaveBeenCalledTimes(1);
  expect(f.invoke.mock.calls[0][0]).toBe("update-transaction");
  return f.invoke.mock.calls[0][1].body.updates;
}
beforeEach(() => {
  vi.clearAllMocks(); company(); f.writes = []; f.mutations = [];
  f.queries = { "event-iva-country": ["Portugal"], "circuit-accounts": [{ id: "circuit", name: "Circuito fixture" }] };
  f.invoke.mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P2d-1: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#498 P2d-1: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#498 P2d-1: rede proibida"); } });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(f.writes).toEqual([]);
  cleanup(); vi.unstubAllGlobals();
});

describe("#498 P2d-1 — hashes PT capturados antes de alterar os componentes", () => {
  it("preserva o DOM EUR/PT e o payload", async () => {
    const { container } = render(modal());
    expect(dom(document.body)).toMatchInlineSnapshot(`"0eb537e28ef08fdf2cc655fbcb5960ff47f890cf39d0e77023d1f5662125b0c3"`);
    expect(await save(container)).toMatchObject({
      amount: 1000, currency: "EUR", iva_rate: 23, original_amount: null, fx_rate: null, fx_rate_source: null,
    });
  });
  it("preserva o DOM USD/PT com câmbio e os metadados originais", async () => {
    const { container } = render(modal({ currency: "USD", amount: 92, original_amount: 100, fx_rate: 0.92 }));
    expect(dom(document.body)).toMatchInlineSnapshot(`"a4099f3e01f64501ae9455a6ee2a95b9694502eba77865547bf991340e0dfba1"`);
    expect(screen.getByText("Câmbio (1 USD = X €)")).toBeInTheDocument();
    expect(await save(container)).toMatchObject({ amount: 92, currency: "USD", original_amount: 100, fx_rate: 0.92, fx_rate_source: "manual" });
  });
  it("preserva o rateio PT em todos os estados monetários", () => {
    const outputs: Record<string, string> = {};
    for (const [name, split] of [
      ["inteira", undefined], ["repartida", {}], ["invalida", { value: "1000" }],
      ["vazia", { totalNet: 0 }], ["multiIva", { multiIvaLineCount: 2, mode: "percentage" as const, value: "25" }],
    ] as const) {
      const { container, unmount } = render(shared(split));
      outputs[name] = dom(container);
      unmount();
    }
    expect(outputs).toMatchInlineSnapshot(`
      {
        "inteira": "69ce853a0ef3f1a06d703e74e0e0a65ce304415c491541f2e5f896f1044c00e6",
        "invalida": "1c963e038319cda0ee55fe23f438315143034dbf5368a609294777581bee953e",
        "multiIva": "a714a9a0d4cf73ba4ebb3d4e6c97f896d828144bb3b782fc0a41b2e4b9749524",
        "repartida": "01ebac0a99f287cf77bf42a46054f87b23c6fc007146b4a53409b47c020d0edc",
        "vazia": "097b9e9fa3445cc2641fa4b973042ddf718b8ee11ebfe583794ce95a12830d3b",
      }
    `);
  });
});

describe("#498 P2d-1 — edição BR nativa", () => {
  it.each(["expense", "income"])("grava %s em BRL directamente, sem IVA nem FX", async type => {
    company("BR", "BRL");
    const { container } = render(modal({ type, currency: "BRL", iva_rate: 23, account_id: type === "income" ? "account" : null }));
    expect(screen.getByText("Valor Base (R$) *")).toBeInTheDocument();
    expect(currencySelect()).toHaveValue("BRL");
    expect([...currencySelect().querySelectorAll("option")].map(node => node.value)).toEqual(["EUR", "BRL", "USD"]);
    expect(screen.getByText(/Total: R\$\s1\.000,00/)).toBeInTheDocument();
    expect(screen.queryByText("Taxa IVA")).not.toBeInTheDocument();
    expect(screen.queryByText(/Câmbio|valor original|Define o câmbio/i)).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("€");
    expect(await save(container)).toMatchObject({
      amount: 1000, currency: "BRL", iva_rate: 0, original_amount: null, fx_rate: null, fx_rate_source: null,
    });
  });

  it("ignora os metadados FX legados e edita o valor BRL sem derivar EUR", async () => {
    company("BR", "BRL");
    const { container } = render(modal({ currency: "BRL", original_amount: 5000, fx_rate: 0.2, fx_rate_source: "suggested" }));
    expect(screen.getByDisplayValue("1000")).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("1000"), { target: { value: "1230.45" } });
    expect(screen.getByText(/Total: R\$\s1\.230,45/)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("€");
    expect(await save(container)).toMatchObject({
      amount: 1230.45, currency: "BRL", iva_rate: 0, original_amount: null, fx_rate: null, fx_rate_source: null,
    });
  });

  it("normaliza os metadados BR legados ao gravar sem outra edição", async () => {
    company("BR", "BRL");
    // Match every audited field to the initial form so only native normalization is dirty.
    render(modal({ currency: "BRL", original_amount: 5000, fx_rate: 0.2, fx_rate_source: "suggested" }));
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await Promise.all(f.mutations);
    expect(f.invoke).toHaveBeenCalledTimes(1);
    expect(f.invoke.mock.calls[0][1].body.updates).toMatchObject({
      amount: 1000, currency: "BRL", iva_rate: 0, original_amount: null, fx_rate: null, fx_rate_source: null,
    });
  });

  it("resolve o contexto BR tardio sem reaplicar câmbio ao valor nativo", async () => {
    company("BR", "BRL", { isLoading: true });
    const tx = { currency: "BRL", original_amount: 5000, fx_rate: 0.2 };
    const { container, rerender } = render(modal(tx));
    company("BR", "BRL"); rerender(modal(tx));
    expect(screen.queryByText(/Câmbio|Taxa IVA/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("1000"), { target: { value: "1250" } });
    rerender(modal(tx));
    expect(screen.getByText(/Total: R\$\s1\.250,00/)).toBeInTheDocument();
    expect(await save(container)).toMatchObject({ amount: 1250, currency: "BRL", iva_rate: 0, original_amount: null, fx_rate: null });
  });

  it("passa o contexto ao rateio e usa base sem IVA no montante explicado", () => {
    company("BR", "BRL");
    render(modal({ currency: "BRL", iva_rate: 23, shared_cost_account_id: "circuit" }));
    expect(screen.getByText(/Esta linha não é custo da MP/)).toHaveTextContent(/R\$\s1\.000,00/);
    expect(document.body.innerHTML).not.toContain("€");
  });

  it("apresenta divergências e totais de splits em R$", () => {
    company("BR", "BRL");
    f.queries["child-transactions-full"] = [
      { id: "child", amount: 900, event_name: "Evento fixture", split_percentage: 90 },
    ];
    render(modal({ currency: "BRL" }));
    expect(screen.getByText(/Divergência já existente/)).toHaveTextContent(/mãe R\$\s1\.000,00 vs soma das filhas R\$\s900,00/);
    fireEvent.change(screen.getByDisplayValue("1000"), { target: { value: "1200" } });
    expect(screen.getByText(/\(esperado:/)).toHaveTextContent(/R\$\s1\.200,00/);
    expect(document.body.innerHTML).not.toContain("€");
  });

  it("apresenta os montantes da fatura repartida em R$", () => {
    company("BR", "BRL");
    f.queries["partner-extra-sibling"] = { id: "extra", amount: 250 };
    render(modal({ currency: "BRL", invoice_group_id: "group" }));
    expect(screen.getByText(/Esta fatura está repartida/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s250,00/)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s1\.250,00/)).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("€");
  });

  it("apresenta a reversão parcial do Extra do Sócio em R$", () => {
    company("BR", "BRL");
    f.queries["partner-extra-link"] = { id: "extra", event_partners: { suppliers: { name: "Sócio fixture" } } };
    render(modal({ currency: "BRL" }));
    fireEvent.click(screen.getByText("Reverter apenas parte para o evento").closest("label")!.querySelector('button[role="switch"]')!);
    expect(screen.getByText("Valor a reverter para o evento (R$)")).toBeInTheDocument();
    expect(screen.getByText(/O valor do Extra do Sócio passa a/)).toHaveTextContent(/R\$\s1\.000,00/);
    expect(document.body.innerHTML).not.toContain("€");
  });
});

describe("#498 P2d-1 — moeda estrangeira PT mantém câmbio obrigatório", () => {
  it.each(["USD", "BRL"])("recusa %s sem câmbio e permite-o com metadados reais", async currency => {
    const { container } = render(modal({ currency, amount: 100, original_amount: 100, fx_rate: null }));
    expect(screen.getByText(`Câmbio (1 ${currency} = X €)`)).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("Fixture"), { target: { value: "Fixture editada" } });
    fireEvent.submit(document.body.querySelector("form")!);
    expect(f.mutations).toEqual([]);
    expect(f.invoke).not.toHaveBeenCalled();
    expect(f.toast).toHaveBeenCalledWith({ title: "Preencha os campos obrigatórios", variant: "destructive" });
    fireEvent.change(screen.getByPlaceholderText("Ex.: 0.18"), { target: { value: "0.92" } });
    fireEvent.submit(document.body.querySelector("form")!);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await Promise.all(f.mutations);
    expect(f.invoke.mock.calls[0][1].body.updates).toMatchObject({
      amount: 92, currency, iva_rate: 23, original_amount: 100, fx_rate: 0.92, fx_rate_source: "manual",
    });
  });
});

describe("#498 P2d-1 — contexto opcional do rateio", () => {
  it("contexto PT explícito preserva o DOM legado sem contexto", () => {
    const { container, rerender } = render(shared({}));
    const legacy = dom(container);
    rerender(shared({}, { companyLocale: resolveCompanyLocale({ country: "PT", currency: "EUR" }) }));
    expect(dom(container)).toBe(legacy);
  });

  it.each([
    ["inteira", undefined], ["repartida", {}], ["invalida", { value: "1000" }],
    ["vazia", { totalNet: 0 }], ["multiIva", { multiIvaLineCount: 2, mode: "percentage" as const, value: "25" }],
  ] as const)("formata o estado %s em R$, incluindo atributos", (_name, split) => {
    const { container } = render(shared(split && { ...split, ivaRate: 0 }, {
      companyLocale: resolveCompanyLocale({ country: "BR", currency: "BRL" }),
    }));
    expect(container.innerHTML).not.toContain("€");
    expect(container.innerHTML).toContain("R$");
    if (_name === "repartida") {
      expect(screen.getByText(/R\$\s750,00 s\/IVA/)).toBeInTheDocument();
      expect(screen.getByText(/R\$\s250,00 s\/IVA/)).toBeInTheDocument();
    }
  });
});
