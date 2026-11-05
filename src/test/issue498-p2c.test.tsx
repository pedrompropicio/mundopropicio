import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { CurrencyAmountInput } from "@/components/CurrencyAmountInput";
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
function dom(container: HTMLElement) {
  return createHash("sha256").update(container.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function currencySelect() {
  return screen.getAllByRole("combobox").find(node => node.querySelector('option[value="USD"]'))!;
}
function submit(container: HTMLElement) { fireEvent.submit(container.querySelector("form")!); }
beforeEach(() => {
  vi.clearAllMocks(); company(); f.writes = []; f.mutations = [];
  f.queries = { "event-iva-country": ["Portugal"] };
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P2c: rede proibida"); }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("#498 P2c — baseline PT capturada antes da alteração", () => {
  it("preserva o DOM e os payloads de despesa e receita", async () => {
    const outputs: Record<string, unknown> = {};
    for (const type of ["expense", "income"] as const) {
      f.writes = []; f.mutations = [];
      const { container, unmount } = render(form(type));
      const hash = dom(container);
      submit(container);
      await waitFor(() => expect(f.mutations).toHaveLength(1));
      await Promise.all(f.mutations);
      outputs[type] = { hash, payload: f.writes.find(w => w.table === "transactions")?.payload };
      unmount();
    }
    expect(outputs).toMatchInlineSnapshot(`
      {
        "expense": {
          "hash": "416b7b86513b41f28a00c4f857d8c0b838579102b0aabe84b38233c7d3a54a17",
          "payload": {
            "account_id": null,
            "amount": 1000,
            "category_id": null,
            "currency": "EUR",
            "date": "2026-11-02",
            "declared_withholding_amount": null,
            "declared_withholding_rate": null,
            "description": "Fixture",
            "due_date": null,
            "event_id": null,
            "exclude_from_result": false,
            "excluded_from_partner_settlement": false,
            "forecast_id": null,
            "fx_rate": null,
            "fx_rate_source": null,
            "invoice_group_id": null,
            "invoice_ref": null,
            "is_confidential": false,
            "is_reimbursement": false,
            "is_transitory": false,
            "iva_rate": 23,
            "ordering_partner_id": null,
            "original_amount": null,
            "paid_amount": 0,
            "paying_partner_id": null,
            "payment_date": null,
            "payment_entity": null,
            "payment_method": "transfer",
            "payment_reference": null,
            "pl_override_note": null,
            "reimbursement_to": null,
            "shared_cost_account_id": null,
            "shared_cost_counterparty_id": null,
            "specification": null,
            "status": "pending",
            "supplier_id": "supplier",
            "transitory_reason": null,
            "type": "expense",
          },
        },
        "income": {
          "hash": "cfacde7354728433d5d2320368bb64f377a061b8a78457d9b6dade7532aec26d",
          "payload": {
            "account_id": null,
            "amount": 1000,
            "category_id": null,
            "currency": "EUR",
            "date": "2026-11-02",
            "declared_withholding_amount": null,
            "declared_withholding_rate": null,
            "description": "Fixture",
            "due_date": null,
            "event_id": null,
            "exclude_from_result": false,
            "excluded_from_partner_settlement": false,
            "forecast_id": null,
            "fx_rate": null,
            "fx_rate_source": null,
            "invoice_group_id": null,
            "invoice_ref": null,
            "is_confidential": false,
            "is_reimbursement": false,
            "is_transitory": false,
            "iva_rate": 23,
            "ordering_partner_id": null,
            "original_amount": null,
            "paid_amount": 0,
            "paying_partner_id": null,
            "payment_date": null,
            "payment_entity": null,
            "payment_method": "transfer",
            "payment_reference": null,
            "pl_override_note": null,
            "reimbursement_to": null,
            "shared_cost_account_id": null,
            "shared_cost_counterparty_id": null,
            "specification": null,
            "status": "pending",
            "supplier_id": "supplier",
            "transitory_reason": null,
            "type": "income",
          },
        },
      }
    `);
  });
  it("preserva DOM USD/PT e exige câmbio antes de criar", () => {
    const { container } = render(form());
    fireEvent.change(currencySelect(), { target: { value: "USD" } });
    expect(dom(container)).toMatchInlineSnapshot(`"7c9d668c8adbead9a755d3a6ae882a745ea607eec06f636e55ad5be2890f1e35"`);
    expect(screen.getByText("Câmbio (1 USD = X €)")).toBeInTheDocument();
    submit(container);
    expect(f.writes).toEqual([]);
  });

  it("grava USD/PT com a conversão legada e os metadados originais", async () => {
    const { container } = render(form());
    fireEvent.change(currencySelect(), { target: { value: "USD" } });
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="number"]');
    fireEvent.change(inputs[0], { target: { value: "100" } });
    submit(container);
    expect(f.writes).toEqual([]);
    fireEvent.change(inputs[1], { target: { value: "0.92" } });
    submit(container);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await Promise.all(f.mutations);
    expect(f.writes.find(w => w.table === "transactions")?.payload).toMatchObject({
      amount: 92, currency: "USD", original_amount: 100, fx_rate: 0.92, fx_rate_source: "manual", iva_rate: 23,
    });
  });
});

describe("#498 P2c — criação BR nativa", () => {
  it.each(["expense", "income"] as const)("grava %s de 1.000 BRL sem FX e com IVA zero", async type => {
    company("BR", "BRL");
    // A caller supplying PT defaults must still persist zero under the BR policy.
    const { container } = render(<TransactionFormModal onClose={() => {}} defaults={{ ...defaults, type, iva_rate: 23 }} />);
    expect(currencySelect()).toHaveValue("BRL");
    expect(screen.getByText("Valor Base (R$) *")).toBeInTheDocument();
    expect(screen.getByText(/Total: R\$\s1\.000,00/)).toBeInTheDocument();
    expect(screen.queryByText("Taxa IVA")).not.toBeInTheDocument();
    expect(screen.queryByText(/Dividir por IVA|Câmbio|valor original|Define o câmbio/i)).not.toBeInTheDocument();
    submit(container);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await Promise.all(f.mutations);
    expect(f.writes.filter(w => w.table === "transactions")).toHaveLength(1);
    expect(f.writes.find(w => w.table === "transactions")?.payload).toMatchObject({
      type, amount: 1000, currency: "BRL", iva_rate: 0, original_amount: null, fx_rate: null, fx_rate_source: null,
    });
    expect(f.invoke).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("edita o valor nativo directamente sem derivar EUR", async () => {
    company("BR", "BRL");
    const { container } = render(form("income"));
    fireEvent.change(container.querySelector('input[type="number"]')!, { target: { value: "1230.45" } });
    expect(screen.getByText(/Total: R\$\s1\.230,45/)).toBeInTheDocument();
    submit(container);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await Promise.all(f.mutations);
    expect(f.writes.find(w => w.table === "transactions")?.payload).toMatchObject({ amount: 1230.45, currency: "BRL", iva_rate: 0, fx_rate: null, original_amount: null });
  });

  it("resolve o contexto BR que chega depois do primeiro render", async () => {
    company("BR", "BRL", { isLoading: true });
    const { container, rerender } = render(form("income"));
    company("BR", "BRL");
    rerender(form("income"));
    expect(currencySelect()).toHaveValue("BRL");
    expect(screen.queryByText("Taxa IVA")).not.toBeInTheDocument();
    submit(container);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await Promise.all(f.mutations);
    expect(f.writes.find(w => w.table === "transactions")?.payload).toMatchObject({ amount: 1000, currency: "BRL", iva_rate: 0 });
  });

  it("não grava enquanto a configuração da empresa está indisponível", async () => {
    company("BR", "BRL", { isLoading: true });
    const { container } = render(form("income"));
    submit(container);
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await expect(f.mutations[0]).rejects.toThrow("configuração da empresa incompleta");
    expect(f.writes).toEqual([]);
  });
});

describe("#498 P2c — CurrencyAmountInput", () => {
  it.each(["EUR", "BRL", "USD", "GBP"] as const)("passa %s nativo sem FX nem derivação EUR", currency => {
    const onAmount = vi.fn();
    const onRate = vi.fn();
    const { container } = render(<CurrencyAmountInput currency={currency} companyCurrency={currency}
      originalAmount="1000" onOriginalAmountChange={vi.fn()} onCurrencyChange={vi.fn()}
      fxRate="0.17" onFxRateChange={onRate} onEurAmountChange={onAmount} />);
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(1);
    expect(onAmount).toHaveBeenCalledWith(1000);
    expect(onRate).toHaveBeenCalledWith("");
    expect(screen.queryByText(/Câmbio|calcular o valor em EUR|Sugerir/)).not.toBeInTheDocument();
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it("preserva o default EUR e a exigência de FX em USD/PT", () => {
    const onAmount = vi.fn();
    const { container, rerender } = render(<CurrencyAmountInput currency="USD" originalAmount="100"
      onOriginalAmountChange={vi.fn()} onCurrencyChange={vi.fn()} fxRate="" onFxRateChange={vi.fn()} onEurAmountChange={onAmount} />);
    expect(screen.getByText("Define o câmbio para calcular o valor em EUR.")).toBeInTheDocument();
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(2);
    rerender(<CurrencyAmountInput currency="USD" originalAmount="100" onOriginalAmountChange={vi.fn()}
      onCurrencyChange={vi.fn()} fxRate="0.92" onFxRateChange={vi.fn()} onEurAmountChange={onAmount} />);
    expect(onAmount).toHaveBeenLastCalledWith(92);
    expect(screen.getByText("Câmbio (1 USD = X €)")).toBeInTheDocument();
  });
});
