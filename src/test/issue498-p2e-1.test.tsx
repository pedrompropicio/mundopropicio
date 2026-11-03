import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany } from "@/hooks/useCompany";
import { TransactionPaymentModal } from "@/components/TransactionPaymentModal";
import { TransactionPaymentsListModal } from "@/components/TransactionPaymentsListModal";
import { PaymentTimeline } from "@/components/PaymentTimeline";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return {
    queries: {} as Record<string, any>, writers: [] as ((...args: any[]) => Promise<any>)[],
    writes: [] as { table: string; operation: string; payload: any }[],
    allowMemory: false, hasBalance: vi.fn(), suggestRate: vi.fn(),
  };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Queries never execute; mutations explicitly invoked below use the in-memory recorder only.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => ({ data: f.queries[queryKey[0]], isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: any) => {
    f.writers.push(mutationFn);
    return { mutate: vi.fn(), reset: vi.fn(), isPending: false };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (!f.allowMemory) throw new Error("#498 P2e-1: serviço MP proibido");
    const q: any = {
      insert: (payload: any) => { f.writes.push({ table, operation: "insert", payload }); return q; },
      update: (payload: any) => { f.writes.push({ table, operation: "update", payload }); return q; },
      delete: () => { f.writes.push({ table, operation: "delete", payload: null }); return q; },
      select: () => q, eq: () => q, not: () => q, range: () => q,
      maybeSingle: async () => ({ data: { paid_amount: 34.56 }, error: null }),
      then: (resolve: any) => Promise.resolve({ data: [{ id: "memory-row" }], error: null }).then(resolve),
    };
    return q;
  },
  rpc: () => { throw new Error("#498 P2e-1: RPC proibida"); },
  functions: { invoke: () => { throw new Error("#498 P2e-1: edge proibida"); } },
} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" }, role: "admin", isAdmin: true, isManager: false,
}) }));
vi.mock("@/lib/account-balance-rpc", () => ({
  accountHasBalanceFor: f.hasBalance, useAccountTrueBalance: () => 5000,
  insufficientBalanceMessage: (balance: number, formatter: (n: number) => string) => `Saldo insuficiente: ${formatter(balance)}`,
}));
vi.mock("@/lib/currency", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/currency")>(), fetchSuggestedFxRate: f.suggestRate,
}));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

const bank = { id: "bank", name: "Banco sintético", type: "bank" };
const tx = {
  id: "tx", description: "Serviço sintético", type: "expense", amount: 1234.56, paid_amount: 34.56,
  currency: "EUR", original_amount: null, fx_rate: null, iva_rate: 0, status: "approved",
  date: "2026-11-01", payment_date: "2026-11-03", account_id: bank.id,
  payment_method: "transfer", invoice_ref: "TEST-498", supplier_id: "supplier",
};
const usdTx = { ...tx, currency: "USD", original_amount: 1371.73, fx_rate: 0.9 };
const payment = {
  id: "payment", amount: 34.56, payment_date: "2026-11-03", status: "paid", currency: "EUR",
  account_id: bank.id, financial_accounts: { name: bank.name }, payment_method: "transfer",
  invoice_ref: "TEST-498", withholding_amount: 1.23, credit_amount: 2.34,
  created_by: "fixture", created_at: "2026-11-03T12:00:00Z",
};
const noop = () => {};
function setCompany(country = "PT", currency = "EUR", unavailable = false) {
  vi.mocked(useCompany).mockReturnValue({
    company: { id: "company", country, currency }, companyId: "company", isLoading: unavailable, isError: false,
  } as ReturnType<typeof useCompany>);
}
function setPayments(payments = [payment]) {
  f.queries["transaction_payments"] = payments;
  f.queries["payment-timeline"] = {
    payments, paymentListItems: [], reimbursementItems: [], partnerPaid: [],
    creditUsages: [{ id: "credit", amount: 2.34, supplier_credits: { reason: "Crédito sintético", document_ref: "TEST-C" } }],
  };
}
function domHash() {
  // Only generated React/Radix IDs are normalised; all other DOM bytes are frozen.
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
beforeEach(() => {
  vi.clearAllMocks(); setCompany();
  f.queries = { "financial-accounts-active": [bank], "payment-timeline-accounts": [bank] };
  setPayments(); f.writers = []; f.writes = []; f.allowMemory = false;
  f.hasBalance.mockResolvedValue(true); f.suggestRate.mockResolvedValue(0.95);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P2e-1: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#498 P2e-1: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#498 P2e-1: rede proibida"); } });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); cleanup(); vi.unstubAllGlobals(); });
afterAll(() => { vi.useRealTimers(); });

describe("#498 P2e-1 — hashes PT capturados antes de alterar os componentes (não regenerar)", () => {
  it("registo PT/EUR e PT/USD conserva DOM inicial e com câmbio editado", () => {
    const hashes: Record<string, any> = {};
    for (const transaction of [tx, usdTx]) {
      const view = render(<TransactionPaymentModal transaction={transaction} onClose={noop} />);
      const initial = domHash();
      if (transaction.currency === "USD") {
        expect(screen.getByText("Câmbio do dia (1 USD = X €)")).toBeInTheDocument();
        fireEvent.change(view.container.querySelector('input[type="number"]')!, { target: { value: "0.95" } });
      }
      hashes[transaction.currency] = { initial, edited: domHash() };
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "EUR": {
          "edited": "3f9514ea0572adc06cfd30b887b11dd45f1d5fb5279fde494a1a291bb61a6534",
          "initial": "3f9514ea0572adc06cfd30b887b11dd45f1d5fb5279fde494a1a291bb61a6534",
        },
        "USD": {
          "edited": "17b37f08592555dd01720a8ad8618336c4d184ecfd7149603aa25889980eb4cc",
          "initial": "715d9007b94ceb64331075909460cea0e4493c32a318bf9e90b23d0d90ee5a05",
        },
      }
    `);
  });
  it("histórico PT/EUR e PT/USD conserva DOM de consulta e edição", () => {
    const hashes: Record<string, any> = {};
    for (const transaction of [tx, usdTx]) {
      setPayments([{ ...payment, currency: transaction.currency, original_amount: 38.4, fx_rate: 0.9 } as any]);
      render(<TransactionPaymentsListModal transaction={transaction} canApprove onClose={noop} />);
      const initial = domHash();
      fireEvent.click(screen.getByTitle("Editar"));
      hashes[transaction.currency] = { initial, edited: domHash() };
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "EUR": {
          "edited": "09423dd91ccf25075d93b39e7f50004ddd3d869e9ca6edf7362a0326a75ae19d",
          "initial": "aa432269eb40391568de717d7b8667a47364ea68495f35cb1734d7ce1bc511b8",
        },
        "USD": {
          "edited": "09423dd91ccf25075d93b39e7f50004ddd3d869e9ca6edf7362a0326a75ae19d",
          "initial": "47a69a28e5f6002430c0beaf68cc318e45a54664971a0699107a575b6d34a4f9",
        },
      }
    `);
  });
  it("timeline PT/EUR e PT/USD conserva consulta, estorno e modal de pagamentos", () => {
    const hashes: Record<string, any> = {};
    for (const transaction of [tx, usdTx]) {
      setPayments([{ ...payment, currency: transaction.currency, original_amount: 38.4, fx_rate: 0.9 } as any]);
      render(<PaymentTimeline transaction={transaction} canApprove />);
      const initial = domHash();
      fireEvent.click(screen.getByTitle("Estornar esta parcela"));
      const reversal = domHash();
      fireEvent.click(screen.getByTitle("Editar parcelas"));
      hashes[transaction.currency] = { initial, reversal, modal: domHash() };
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "EUR": {
          "initial": "d4f0ed3d7c643d7c3382df67b65db9911510c0e741f79d2747bf59f556f0f475",
          "modal": "eb402c92f4841a63632c365d3010766a20a59c1cf24fe4ae01736e70239bdfa5",
          "reversal": "94028895b6ee6a5922488688aefb3877966a1654739fcb5d934bdec487e00715",
        },
        "USD": {
          "initial": "df3cd13b27fbbfdaa2c80963c1a77f796cbac3c58bf3828aeb57d8df71ff9865",
          "modal": "d141dc7fb72d3d5ff2a9a9d5199e0b5e170ef316feecb7de0f72132e43a1acdc",
          "reversal": "939c3aa8fcb5709880db906a87ada39d454a006e2462ce5cce714444676b05b3",
        },
      }
    `);
  });
  it("histórico e timeline PT conservam ajuste de pagamento direto", () => {
    const hashes: Record<string, any> = {};
    setPayments([]); f.queries["payment-timeline"].creditUsages = [];
    for (const kind of ["histórico", "timeline"]) {
      render(kind === "histórico"
        ? <TransactionPaymentsListModal transaction={tx} canApprove onClose={noop} />
        : <PaymentTimeline transaction={tx} canApprove />);
      const initial = domHash();
      fireEvent.click(screen.getByTitle("Editar valor pago"));
      hashes[kind] = { initial, edited: domHash() };
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "histórico": {
          "edited": "408d5bb9f73369fe11c09b0abb5526ca74cbfd31d81a8e407bf2e8e4af38c9f1",
          "initial": "0bec0aa2317747e36d1af3c22086db24f3dff2ac90ddafa77a1ba8daa95e4203",
        },
        "timeline": {
          "edited": "c90435997c14256819794f0a56a1dd6abee8aca300a9d0aaafe5ca11fb692b61",
          "initial": "2f112c7534ceab4cc3be0c463231f32f7d2b4376c0656a3b4492ec22f51845e8",
        },
      }
    `);
  });
});

function paymentWriter() { return f.writers[f.writers.length - 1]; }
function paymentInsert() { return f.writes.find(w => w.table === "transaction_payments" && w.operation === "insert")?.payload; }
function amountInput(label: string) {
  return screen.getByText(label).parentElement!.querySelector("input")!;
}
function expectNoEuros() { expect(document.body.innerHTML).not.toContain("€"); }

describe("#498 P2e-1 — registo nativo e estrangeiro sem serviços reais", () => {
  it.each(["expense", "income"])("BRL/BRL: %s mostra R$, oculta IRS/FX e grava montante nativo sem metadados FX", async type => {
    setCompany("BR", "BRL");
    render(<TransactionPaymentModal transaction={{ ...tx, type, currency: "BRL", original_amount: 999, fx_rate: 0.2 }} onClose={noop} />);
    expect(screen.getByText(`Valor a ${type === "expense" ? "pagar" : "receber"} (R$)`)).toBeInTheDocument();
    expect(document.body.textContent).toContain("R$\u00a01.234,56");
    expect(document.body.textContent).toContain("R$\u00a01.200,00");
    expect(screen.getByText("Nota Fiscal/Doc")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Câmbio do dia|Retenção IRS/);
    expectNoEuros();
    f.allowMemory = true;
    await paymentWriter()();
    expect(paymentInsert()).toMatchObject({ amount: 1200, currency: "BRL", withholding_amount: 0, credit_amount: 0 });
    for (const field of ["original_amount", "fx_rate", "fx_rate_source"]) expect(paymentInsert()).not.toHaveProperty(field);
    expect(f.writes.filter(w => w.table === "transaction_payments")).toHaveLength(1);
    expect(f.writes.find(w => w.table === "transaction_audit_log")?.payload).toEqual([
      expect.objectContaining({ field_name: type === "expense" ? "Pagamento parcial" : "Recebimento parcial", new_value: "R$\u00a01.200,00 — Banco sintético" }),
    ]);
    expect(f.hasBalance).toHaveBeenCalledTimes(type === "expense" ? 1 : 0);
    if (type === "expense") expect(f.hasBalance).toHaveBeenCalledWith(bank.id, 1200);
  });

  it("PT/EUR mantém o payload nativo anterior, sem acrescentar FX ou currency", async () => {
    render(<TransactionPaymentModal transaction={tx} onClose={noop} />);
    f.allowMemory = true; await paymentWriter()();
    expect(paymentInsert()).toEqual({
      transaction_id: "tx", amount: 1200, payment_date: "2026-11-03", account_id: "bank",
      payment_method: "transfer", payment_entity: null, payment_reference: null, invoice_ref: "TEST-498",
      withholding_amount: 0, credit_amount: 0, notes: null, created_by: "fixture@example.invalid",
    });
  });

  it.each(["PT", "BR"])("USD/%s conserva câmbio manual e montante original no insert", async country => {
    setCompany(country, country === "BR" ? "BRL" : "EUR");
    render(<TransactionPaymentModal transaction={usdTx} onClose={noop} />);
    const symbol = country === "BR" ? "R$" : "€";
    expect(screen.getByText(`Câmbio do dia (1 USD = X ${symbol})`)).toBeInTheDocument();
    fireEvent.change(amountInput(`Câmbio do dia (1 USD = X ${symbol})`), { target: { value: "0.95" } });
    fireEvent.change(amountInput(`Valor a pagar (${symbol})`), { target: { value: "100" } });
    f.allowMemory = true; await paymentWriter()();
    expect(paymentInsert()).toMatchObject({ amount: 100, currency: "USD", original_amount: 105.26, fx_rate: 0.95, fx_rate_source: "dia (manual)" });
    expect(f.writes.find(w => w.table === "transaction_audit_log")?.payload).toEqual([
      expect.objectContaining({ field_name: "Pagamento parcial" }),
      expect.objectContaining({ field_name: "Câmbio do dia (USD)", old_value: "0.900000", new_value: "0.950000 (variação: 0.050000)" }),
    ]);
    if (country === "BR") expectNoEuros();
  });

  it("USD/PT sem câmbio do dia conserva o fallback ao câmbio original", async () => {
    render(<TransactionPaymentModal transaction={usdTx} onClose={noop} />);
    fireEvent.change(amountInput("Câmbio do dia (1 USD = X €)"), { target: { value: "" } });
    fireEvent.change(amountInput("Valor a pagar (€)"), { target: { value: "100" } });
    f.allowMemory = true; await paymentWriter()();
    expect(paymentInsert()).toMatchObject({ amount: 100, currency: "USD", original_amount: 111.11, fx_rate: 0.9, fx_rate_source: "original da transação" });
    expect(f.writes.find(w => w.table === "transaction_audit_log")?.payload).toHaveLength(1);
  });

  it("BRL/PT continua estrangeira e mantém o contrato FX", async () => {
    render(<TransactionPaymentModal transaction={{ ...usdTx, currency: "BRL", fx_rate: 0.2 }} onClose={noop} />);
    expect(screen.getByText("Câmbio do dia (1 BRL = X €)")).toBeInTheDocument();
    fireEvent.change(amountInput("Valor a pagar (€)"), { target: { value: "100" } });
    f.allowMemory = true; await paymentWriter()();
    expect(paymentInsert()).toMatchObject({ amount: 100, currency: "BRL", original_amount: 500, fx_rate: 0.2, fx_rate_source: "dia (manual)" });
  });

  it("EUR/BRL exige o bloco FX e aceita apenas uma taxa manual", async () => {
    setCompany("BR", "BRL");
    render(<TransactionPaymentModal transaction={{ ...usdTx, currency: "EUR", fx_rate: 6 }} onClose={noop} />);
    expect(screen.getByRole("button", { name: "Sugerir" })).toBeDisabled();
    fireEvent.change(amountInput("Câmbio do dia (1 EUR = X R$)"), { target: { value: "6.1" } });
    fireEvent.change(amountInput("Valor a pagar (R$)"), { target: { value: "100" } });
    f.allowMemory = true; await paymentWriter()();
    expect(paymentInsert()).toMatchObject({ amount: 100, currency: "EUR", original_amount: 16.39, fx_rate: 6.1, fx_rate_source: "dia (manual)" });
    expect(f.suggestRate).not.toHaveBeenCalled();
  });

  it.each(["USD", "EUR"])("BRL: Sugerir nunca consulta uma sugestão EUR para transação %s", currency => {
    setCompany("BR", "BRL");
    render(<TransactionPaymentModal transaction={{ ...usdTx, currency, fx_rate: null }} onClose={noop} />);
    expect(screen.getByRole("button", { name: "Sugerir" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Sugerir" }));
    expect(f.suggestRate).not.toHaveBeenCalled();
    expect(amountInput(`Câmbio do dia (1 ${currency} = X R$)`)).toHaveValue(null);
    expect(f.writes).toEqual([]);
  });

  it("PT: Sugerir conserva o helper de sugestão EUR e recalcula o montante", async () => {
    render(<TransactionPaymentModal transaction={usdTx} onClose={noop} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Sugerir" })); });
    expect(f.suggestRate).toHaveBeenCalledWith("USD", expect.any(Object));
    expect(amountInput("Câmbio do dia (1 USD = X €)")).toHaveValue(0.95);
    expect(amountInput("Valor a pagar (€)")).toHaveValue(1266.66);
  });

  it("a moeda configurada decide o percurso nativo independentemente do locale PT", async () => {
    setCompany("PT", "BRL");
    render(<TransactionPaymentModal transaction={{ ...tx, currency: "BRL" }} onClose={noop} />);
    expect(document.body.textContent).not.toContain("Câmbio do dia");
    expect(screen.getByText("Retenção IRS (R$)")).toBeInTheDocument();
    f.allowMemory = true; await paymentWriter()();
    expect(paymentInsert()).toMatchObject({ amount: 1200, currency: "BRL" });
    expect(paymentInsert()).not.toHaveProperty("fx_rate");
  });

  it.each([false, true])("conta-espelho conserva o aviso e usa a moeda resolvida (indisponível=%s)", unavailable => {
    setCompany("BR", "BRL", unavailable);
    f.queries["mirror-partner-accounts"] = { [bank.id]: { partnerName: "Sócio sintético" } };
    render(<TransactionPaymentModal transaction={{ ...tx, currency: "BRL" }} onClose={noop} />);
    expect(screen.getByText("Sócio sintético")).toBeInTheDocument();
    expect(document.body.textContent).toContain(unavailable
      ? "automaticamente um aporte de — para o sócio."
      : "automaticamente um aporte de R$\u00a01.200,00 para o sócio.");
    expectNoEuros();
    if (unavailable) expect(document.body.innerHTML).not.toContain("R$");
  });
});

describe("#498 P2e-1 — apresentação, edição e auditoria monetária", () => {
  it("BR: histórico e timeline usam R$, Nota Fiscal/Doc e rótulos monetários locais", () => {
    setCompany("BR", "BRL"); setPayments([{ ...payment, currency: "BRL" }]);
    render(<TransactionPaymentsListModal transaction={{ ...tx, currency: "BRL" }} canApprove onClose={noop} />);
    expect(document.body.textContent).toContain("R$\u00a01.234,56");
    expect(screen.getByText("Nota Fiscal/Doc:")).toBeInTheDocument(); expectNoEuros();
    fireEvent.click(screen.getByTitle("Editar"));
    expect(screen.getByText("Valor (R$)")).toBeInTheDocument();
    expect(screen.getByText("Nota Fiscal/Doc")).toBeInTheDocument(); expectNoEuros();
    cleanup();
    render(<PaymentTimeline transaction={{ ...tx, currency: "BRL" }} canApprove />);
    expect(document.body.textContent).toContain("R$\u00a01.234,56");
    expect(screen.getByText("Nota Fiscal/Doc: TEST-498")).toBeInTheDocument(); expectNoEuros();
    fireEvent.click(screen.getByTitle("Estornar esta parcela"));
    expect(screen.getByText("Valor do crédito (R$) — editável para menos (ex.: fatura renegociada)")).toBeInTheDocument(); expectNoEuros();
    fireEvent.click(screen.getByTitle("Editar parcelas"));
    expect(screen.getByText("Nota Fiscal/Doc:")).toBeInTheDocument(); expectNoEuros();
  });

  it.each(["histórico", "timeline"])("BR: %s usa R$ no ajuste direto e no texto de auditoria", async kind => {
    setCompany("BR", "BRL"); setPayments([]); f.queries["payment-timeline"].creditUsages = [];
    render(kind === "histórico"
      ? <TransactionPaymentsListModal transaction={{ ...tx, currency: "BRL" }} canApprove onClose={noop} />
      : <PaymentTimeline transaction={{ ...tx, currency: "BRL" }} canApprove />);
    fireEvent.click(screen.getByTitle("Editar valor pago"));
    expect(screen.getByText("Valor pago (R$)")).toBeInTheDocument(); expectNoEuros();
    fireEvent.change(amountInput("Valor pago (R$)"), { target: { value: "100" } });
    f.allowMemory = true;
    await f.writers[f.writers.length - (kind === "histórico" ? 1 : 3)]();
    expect(paymentInsert()).toMatchObject({ amount: 100, notes: "Ajuste de pagamento direto" });
    expect(f.writes.find(w => w.table === "transaction_audit_log")?.payload).toEqual([
      expect.objectContaining({ field_name: "Valor pago (ajuste admin)", old_value: "R$\u00a034,56", new_value: "R$\u00a0100,00" }),
    ]);
  });

  it("BR: editar montante e documento conserva field_name fiscal na auditoria", async () => {
    setCompany("BR", "BRL"); setPayments([{ ...payment, currency: "BRL" }]);
    render(<TransactionPaymentsListModal transaction={{ ...tx, currency: "BRL" }} canApprove onClose={noop} />);
    fireEvent.click(screen.getByTitle("Editar"));
    fireEvent.change(amountInput("Valor (R$)"), { target: { value: "40" } });
    fireEvent.change(amountInput("Nota Fiscal/Doc"), { target: { value: "TEST-NF" } });
    f.allowMemory = true; await f.writers[f.writers.length - 3](payment.id);
    expect(f.writes.find(w => w.table === "transaction_payments")?.payload).toMatchObject({ amount: 40, invoice_ref: "TEST-NF" });
    expect(f.writes.find(w => w.table === "transaction_audit_log")?.payload).toEqual([
      expect.objectContaining({ field_name: "Parcela #1 — Valor", old_value: "R$\u00a034,56", new_value: "R$\u00a040,00" }),
      expect.objectContaining({ field_name: "Parcela #1 — Nº Fatura", old_value: "TEST-498", new_value: "TEST-NF" }),
    ]);
  });

  it.each(["registo", "histórico", "timeline"])("contexto indisponível: %s apresenta — e mantém FX relativo a EUR", async kind => {
    setCompany("BR", "BRL", true);
    const element = () => kind === "registo"
      ? <TransactionPaymentModal transaction={usdTx} onClose={noop} />
      : kind === "histórico"
        ? <TransactionPaymentsListModal transaction={usdTx} canApprove onClose={noop} />
        : <PaymentTimeline transaction={usdTx} canApprove />;
    render(element());
    expect(document.body.textContent).toContain("—");
    expect(document.body.innerHTML).not.toMatch(/€|R\$/);
    if (kind === "registo") {
      expect(screen.getByText("Câmbio do dia (1 USD = X —)")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sugerir" })).toBeEnabled();
      await expect(paymentWriter()()).rejects.toThrow("configuração da empresa incompleta");
      expect(f.writes).toEqual([]);
    }
  });

  it("mudar empresa reavalia o FX nativo e regressa ao mesmo DOM PT", () => {
    const transaction = { ...tx, currency: "BRL", original_amount: 6000, fx_rate: 0.2 };
    const view = render(<TransactionPaymentModal transaction={transaction} onClose={noop} />);
    const before = domHash();
    expect(screen.getByText("Câmbio do dia (1 BRL = X €)")).toBeInTheDocument();
    setCompany("BR", "BRL"); view.rerender(<TransactionPaymentModal transaction={transaction} onClose={noop} />);
    expect(document.body.textContent).not.toContain("Câmbio do dia");
    expect(screen.getByText("Valor a pagar (R$)")).toBeInTheDocument(); expectNoEuros();
    setCompany(); view.rerender(<TransactionPaymentModal transaction={transaction} onClose={noop} />);
    expect(domHash()).toBe(before);
  });

  it("os três componentes usam o adapter e preservam o field_name fiscal de auditoria", () => {
    for (const name of ["TransactionPaymentModal", "TransactionPaymentsListModal", "PaymentTimeline"]) {
      const source = readFileSync(`src/components/${name}.tsx`, "utf8");
      expect(source).toContain("useCompanyLocale()");
      expect(source).toContain("formatMoney(value, companyLocale)");
      expect(source.match(/formatLegacyCurrency\(/g)).toHaveLength(1);
      expect(source).not.toMatch(/\b(?:if|switch)\s*\([^)]*\bcountry\b|\bcountry\s*={2,3}/);
      expect(source).not.toContain('type="date"');
    }
    const source = readFileSync("src/components/TransactionPaymentsListModal.tsx", "utf8");
    expect(source).toContain('field_name: `${parcela} — Nº Fatura`');
  });
});
