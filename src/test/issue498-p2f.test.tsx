import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { TransactionInstallmentsEditor } from "@/components/TransactionInstallmentsEditor";
import { ScheduleInstallmentsModal } from "@/components/ScheduleInstallmentsModal";
import { TransactionInstallmentGroupEditor } from "@/components/TransactionInstallmentGroupEditor";
import { TransactionRenegotiateInstallmentsModal } from "@/components/TransactionRenegotiateInstallmentsModal";
import { FOREIGN_INSTALLMENT_CHANGE } from "@/lib/installment-original";
import { useCompany } from "@/hooks/useCompany";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, any>, writes: [] as { table: string; kind: string; payload: any }[],
  rpc: vi.fn(), mutations: [] as Promise<any>[], toast: vi.fn(), invoke: vi.fn(),
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
  rpc: f.rpc, functions: { invoke: f.invoke },
  from: (table: string) => {
    const q: any = {
      insert: (payload: any) => { f.writes.push({ table, kind: "insert", payload }); return q; },
      update: (payload: any) => { f.writes.push({ table, kind: "update", payload }); return q; },
      not: () => q, limit: () => q, range: () => q,
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

// Synthetic fixtures only; transport never leaves this process.
function company(country = "PT", currency = "EUR", overrides = {}) {
  vi.mocked(useCompany).mockReturnValue({
    company: { id: "company", country, currency }, companyId: "company", isLoading: false, isError: false, ...overrides,
  } as ReturnType<typeof useCompany>);
}
const defaults = { description: "Fixture", amount: "1000", date: "2026-11-02", due_date: "2026-11-02", supplier_id: "supplier" };
const transaction = (currency = "EUR") => ({
  id: "tx", description: "Fixture", currency, amount: 1000, iva_rate: 0, date: "2026-11-02", due_date: "2026-11-02",
  type: "expense", status: "approved", paid_amount: 0, installment_group_id: "group",
});
function group(currency = "EUR") {
  f.queries["installment-group"] = [
    { ...transaction(currency), id: "tx", amount: 500, isRoot: true },
    { ...transaction(currency), id: "sister", amount: 500, due_date: "2026-12-02", isRoot: false },
  ];
}
function editor() {
  return <TransactionInstallmentsEditor grossTotal={1000} defaultFirstDate="2026-11-02"
    installments={[{ amount: 500, scheduled_date: "2026-11-02" }, { amount: 500, scheduled_date: "2026-12-02" }]}
    onChange={vi.fn()} count={2} firstDate="2026-11-02" interval="monthly" onWizardChange={vi.fn()} />;
}
function schedule(onConfirm = vi.fn()) {
  return <ScheduleInstallmentsModal open onOpenChange={vi.fn()} forecast={{ id: "bp", description: "Fixture", amount: 1000, type: "expense" }} onConfirm={onConfirm} />;
}
function renegotiate(currency = "EUR") {
  return <TransactionRenegotiateInstallmentsModal transaction={transaction(currency)} onClose={vi.fn()} />;
}
function dom() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
function currencySelect() {
  return screen.getAllByRole("combobox").find(node => node.querySelector('option[value="USD"]'))!;
}
beforeEach(() => {
  vi.clearAllMocks(); company(); f.writes = []; f.mutations = []; f.queries = {};
  f.rpc.mockResolvedValue({ data: "group", error: null });
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P2f: rede proibida"); }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("#498 P2f — hashes PT capturados antes de alterar produção; não regenerar", () => {
  it("preserva os quatro editores EUR e BRL/PT, incluindo avisos e confirmação", () => {
    const hashes: Record<string, string> = {};
    for (const currency of ["EUR", "BRL"]) {
      render(editor()); hashes[`${currency}/editor`] = dom(); cleanup();
      render(schedule()); hashes[`${currency}/schedule-wizard`] = dom();
      fireEvent.click(screen.getByRole("button", { name: /Ajustar manualmente/ }));
      hashes[`${currency}/schedule-manual`] = dom(); cleanup();
      group(currency);
      render(<TransactionInstallmentGroupEditor transaction={transaction(currency)} canApprove />);
      fireEvent.click(screen.getByRole("button", { name: "Editar parcelas" }));
      hashes[`${currency}/group`] = dom();
      fireEvent.click(screen.getByRole("button", { name: "%" }));
      hashes[`${currency}/group-percent`] = dom(); cleanup();
      render(renegotiate(currency));
      fireEvent.click(screen.getByRole("button", { name: /Distribuir igualmente/ }));
      hashes[`${currency}/renegotiate`] = dom();
      if (currency === "EUR") {
        fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
        hashes[`${currency}/renegotiate-confirm`] = dom();
      } else {
        expect(screen.getByText(FOREIGN_INSTALLMENT_CHANGE)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
      }
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "BRL/editor": "ec5678fadb73f8151fabc934f2aed4236246c4f31b3e93069a9557d8f0ce2ae2",
        "BRL/group": "30c7de56d38f6b9e2a12444075c8c1e1a25fc6a3546c838650525f9675d9490e",
        "BRL/group-percent": "494982cb929b060666a8b6c436054404bb6d8b0ed02986b047746d0e07e661ac",
        "BRL/renegotiate": "1bb7f4f491c0f67a700f17650f5504b847d596143c85fe5ebbb7f56aa32ec6eb",
        "BRL/schedule-manual": "4405354169635ccaf2a5036181df1f5daea6c1ef9460c0ed6253aaa3b76bb5ac",
        "BRL/schedule-wizard": "b3d7bf89526083e9bef7a5257d020a0a4d62f69d0d6be944cf7dbfe8f8534ab4",
        "EUR/editor": "ec5678fadb73f8151fabc934f2aed4236246c4f31b3e93069a9557d8f0ce2ae2",
        "EUR/group": "dab39471e5b8a9deb2133d95b6e3347304de67e80756f6418835c669c86537ef",
        "EUR/group-percent": "f2bb69ce0d72fa5d78704917c0929f0af87fde486ce53e4bfee65d7603566bd2",
        "EUR/renegotiate": "f5885a0c1634f715eb5dd97fc85d81941e9b59baad3246034e999cf854deda52",
        "EUR/renegotiate-confirm": "cc0fdfa3ff4d5da5ddb9770e6d1cf07787faa100fadf9f30d0172e99beaa27b4",
        "EUR/schedule-manual": "4405354169635ccaf2a5036181df1f5daea6c1ef9460c0ed6253aaa3b76bb5ac",
        "EUR/schedule-wizard": "b3d7bf89526083e9bef7a5257d020a0a4d62f69d0d6be944cf7dbfe8f8534ab4",
      }
    `);
  });
});


function expectNativeDom() {
  expect(screen.getByText("Valor (R$)")).toBeInTheDocument();
  expect(document.body.innerHTML).not.toContain("€");
  expect(screen.queryByText(FOREIGN_INSTALLMENT_CHANGE)).not.toBeInTheDocument();
}
function changeMoney(input: HTMLElement, value: string) {
  fireEvent.focus(input); fireEvent.change(input, { target: { value } }); fireEvent.blur(input);
}
async function completedMutation() {
  await waitFor(() => expect(f.mutations).toHaveLength(1));
  await Promise.all(f.mutations);
  expect(fetch).not.toHaveBeenCalled();
}
function installmentForm(currency?: string) {
  const result = render(<TransactionFormModal onClose={vi.fn()} defaults={{ ...defaults, type: "expense", iva_rate: 23 }} />);
  fireEvent.click(screen.getByRole("checkbox", { name: /Pagar em parcelas/ }));
  const count = screen.getByText("Nº parcelas").parentElement!.querySelector("input")!;
  fireEvent.change(count, { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: /Distribuir igualmente/ }));
  if (currency) {
    if (currency === "GBP") fireEvent.change(currencySelect(), { target: { value: "USD" } });
    fireEvent.change(currencySelect(), { target: { value: currency } });
    fireEvent.change(result.container.querySelector('input[type="number"]')!, { target: { value: "1000" } });
  }
  return result;
}

describe("#498 P2f — BRL nativo pela interface", () => {
  it("cria três parcelas após preflight real, sem originais/FX/IVA", async () => {
    company("BR", "BRL");
    const { container } = installmentForm();
    expectNativeDom();
    expect(screen.queryByText(/Câmbio|Taxa IVA|Valor original/i)).not.toBeInTheDocument();
    fireEvent.submit(container.querySelector("form")!);
    await completedMutation();
    const txs = f.writes.filter(w => w.table === "transactions" && w.kind === "insert").map(w => w.payload);
    expect(txs).toHaveLength(3);
    expect(txs.map(t => t.amount)).toEqual([333.34, 333.33, 333.33]);
    const rootMetadata = f.writes.find(w => w.table === "transactions" && w.kind === "update" && w.payload.installment_number === 1)?.payload;
    expect(rootMetadata).toMatchObject({ installment_number: 1, installment_total: 3 });
    expect(rootMetadata.installment_group_id).toEqual(expect.any(String));
    expect(txs.slice(1).map(t => t.installment_number)).toEqual([2, 3]);
    expect(txs.slice(1).every(t => t.installment_group_id === rootMetadata.installment_group_id)).toBe(true);
    for (const tx of txs) expect(tx).toMatchObject({
      currency: "BRL", original_amount: null, fx_rate: null, fx_rate_source: null, iva_rate: 0,
    });
    expect(f.toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
  });
  it("agenda e ajusta manualmente os valores em R$ antes de confirmar o plano", () => {
    company("BR", "BRL");
    const confirm = vi.fn(); render(schedule(confirm));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Ajustar manualmente/ }));
    expectNativeDom();
    const amounts = screen.getAllByRole("textbox").filter(e => e.getAttribute("inputmode") === "decimal");
    expect(amounts[0]).toHaveValue("R$\u00a0333,34");
    changeMoney(amounts[0], "333,35"); changeMoney(amounts[2], "333,32");
    fireEvent.click(screen.getByRole("button", { name: "Criar 3 transação(ões)" }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith([
      { amount: 333.35, date: "2026-11-02", description: "Fixture (1/3)" },
      { amount: 333.33, date: "2026-12-02", description: "Fixture (2/3)" },
      { amount: 333.32, date: "2027-01-02", description: "Fixture (3/3)" },
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("edita monetariamente um grupo BRL e mantém o modo percentual sem €", async () => {
    company("BR", "BRL"); group("BRL");
    render(<TransactionInstallmentGroupEditor transaction={transaction("BRL")} canApprove />);
    fireEvent.click(screen.getByRole("button", { name: "Editar parcelas" }));
    expectNativeDom();
    const amounts = screen.getAllByRole("textbox");
    changeMoney(amounts[0], "600,00");
    fireEvent.click(screen.getByRole("button", { name: "Gravar parcelas" }));
    await completedMutation();
    expect(f.writes.filter(w => w.table === "transactions")).toEqual([{ table: "transactions", kind: "update", payload: { amount: 600 } }]);
    fireEvent.click(screen.getByRole("button", { name: "%" }));
    expect(screen.getByText("% / R$")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("€");
  });
  it("renegocia BRL com o plano nativo pela RPC existente", async () => {
    company("BR", "BRL"); render(renegotiate("BRL"));
    fireEvent.click(screen.getByRole("button", { name: /Distribuir igualmente/ }));
    expectNativeDom(); expect(screen.queryByText(/c\/IVA/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(document.body.innerHTML).not.toContain("€");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar renegociação" }));
    await completedMutation();
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("renegotiate_transaction_installments", {
      p_transaction_id: "tx", p_changed_by: "fixture@example.invalid",
      p_installments: [{ amount: 500, due_date: "2026-11-02" }, { amount: 500, due_date: "2026-12-02" }],
    });
    expect(f.writes).toEqual([]);
  });
});

describe("#498 P2f — guardas estrangeiras e fallback EUR", () => {
  it.each(["BRL", "USD", "GBP"])("exige FX na criação de %s/PT antes de qualquer escrita", async currency => {
    const { container } = installmentForm(currency);
    expect(screen.getByText("Define o câmbio para calcular o valor em EUR.")).toBeInTheDocument();
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(f.mutations).toEqual([]); expect(f.writes).toEqual([]);
  });
  it.each(["BRL", "USD", "GBP"])("bloqueia valores de grupo %s/PT e renegociação", async currency => {
    group(currency); render(<TransactionInstallmentGroupEditor transaction={transaction(currency)} canApprove />);
    fireEvent.click(screen.getByRole("button", { name: "Editar parcelas" }));
    expect(screen.getByText(FOREIGN_INSTALLMENT_CHANGE, { exact: false })).toBeInTheDocument();
    changeMoney(screen.getAllByRole("textbox")[0], "600,00");
    fireEvent.click(screen.getByRole("button", { name: "Gravar parcelas" }));
    await waitFor(() => expect(f.mutations).toHaveLength(1));
    await expect(f.mutations[0]).rejects.toThrow(FOREIGN_INSTALLMENT_CHANGE);
    expect(f.writes).toEqual([]); cleanup();
    render(renegotiate(currency));
    fireEvent.click(screen.getByRole("button", { name: /Distribuir igualmente/ }));
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(screen.getByText(FOREIGN_INSTALLMENT_CHANGE)).toBeInTheDocument();
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("mantém fallback EUR nos editores sem configuração disponível", () => {
    company("BR", "BRL", { isLoading: true });
    render(editor()); expect(screen.getByText("Valor (€)")).toBeInTheDocument(); cleanup();
    group(); render(<TransactionInstallmentGroupEditor transaction={transaction()} canApprove />);
    fireEvent.click(screen.getByRole("button", { name: "Editar parcelas" }));
    expect(screen.queryByText(FOREIGN_INSTALLMENT_CHANGE, { exact: false })).not.toBeInTheDocument(); cleanup();
    render(renegotiate()); fireEvent.click(screen.getByRole("button", { name: /Distribuir igualmente/ }));
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });
});
