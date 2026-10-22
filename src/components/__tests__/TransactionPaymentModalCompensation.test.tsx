import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Cliente Supabase falso: cadeia infinita que resolve vazio; regista tabelas e inserts.
const tables: string[] = [];
const inserts: string[] = [];
let control: any = [{ enabled: true, reverse_enabled: true }];
function chain(table: string): any {
  const result = { data: [], error: null };
  const p: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any) => res(result);
      if (prop === "maybeSingle" || prop === "single") return async () => ({ data: null, error: null });
      if (prop === "insert") return () => { inserts.push(table); return p; };
      return () => p;
    },
  });
  return p;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => { tables.push(t); return chain(t); },
    rpc: async (fn: string) => (fn === "transaction_offset_control_status" ? { data: control, error: null } : { data: null, error: null }),
  },
}));
let role = "admin";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role, user: { id: "u", email: "p@x" }, isAdmin: true, isManager: false }) }));
vi.mock("@/lib/bank-link-date", () => ({ fetchKnownBankDate: async () => null }));
vi.mock("@/lib/supplier-bank", () => ({ fetchSupplierBankRows: async () => [] }));
vi.mock("@/lib/account-balance-rpc", () => ({
  accountHasBalanceFor: async () => true,
  useAccountTrueBalance: () => null,
  insufficientBalanceMessage: () => "",
}));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: any[]) => toastSpy(...a) }));

const assistantProps: any[] = [];
vi.mock("@/components/bank/BankLineOffsetModal", async () => {
  const actual: any = await vi.importActual("@/components/bank/BankLineOffsetModal");
  return {
    ...actual,
    BankLineOffsetModal: (p: any) => {
      assistantProps.push(p);
      return <actual.BankLineOffsetModal {...p} />;
    },
  };
});

import { TransactionPaymentModal } from "../TransactionPaymentModal";
import { OFFSET_DISABLED_MESSAGE } from "@/components/bank/BankLineOffsetModal";

const tx = (over: any = {}) => ({
  id: "t1", type: "income", supplier_id: "s1", amount: 100, iva_rate: 0, paid_amount: 0,
  status: "approved", description: "Receita Casino", currency: "EUR", ...over,
});

function mount(transaction: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TransactionPaymentModal transaction={transaction} onClose={() => {}} />
    </QueryClientProvider>,
  );
}
const compBtn = () => screen.getByRole("button", { name: /Compensação/ });
const transferBtn = () => screen.getByRole("button", { name: /Transferência/ });

beforeEach(() => {
  tables.length = 0; inserts.length = 0; assistantProps.length = 0; toastSpy.mockReset();
  control = [{ enabled: true, reverse_enabled: true }]; role = "admin";
});

describe("#337 — método Compensação do modal de pagamento", () => {
  it.each([["income", "income"], ["expense", "expense"]])("(a) %s com entidade abre o assistente em modo launch, sem registar pagamento", async (type, sign) => {
    mount(tx({ type }));
    fireEvent.click(compBtn());
    expect(await screen.findByText("Encontro de contas")).toBeTruthy();
    const p = assistantProps[assistantProps.length - 1];
    expect(p.launch).toEqual({ transactionId: "t1", supplierId: "s1", originSign: sign });
    expect(p.line).toBeUndefined();
    expect(inserts).not.toContain("transaction_payments");
    expect(inserts).not.toContain("transaction_audit_log");
  });

  it("(b) sem entidade mostra 'Sem entidade' e não abre", () => {
    mount(tx({ supplier_id: null }));
    fireEvent.click(compBtn());
    expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Sem entidade" }));
    expect(assistantProps).toHaveLength(0);
  });

  it("(c) fechar o assistente volta ao pagamento sem mudar o método", async () => {
    mount(tx());
    expect(transferBtn().className).toContain("border-primary");
    fireEvent.click(compBtn());
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByText("Encontro de contas")).toBeNull());
    expect(screen.getByText("Registar Recebimento")).toBeTruthy();
    expect(transferBtn().className).toContain("border-primary");
    expect(compBtn().className).not.toContain("border-primary");
  });

  it("transação com método 'compensation' abre com Transferência (não regista compensação solta)", () => {
    mount(tx({ payment_method: "compensation" }));
    expect(transferBtn().className).toContain("border-primary");
  });

  it("(d) em N1 o assistente abre com a mensagem de fecho e sem confirmar", async () => {
    control = [{ enabled: false, reverse_enabled: true }];
    mount(tx());
    fireEvent.click(compBtn());
    expect(await screen.findByText(OFFSET_DISABLED_MESSAGE)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar encontro" })).toBeNull();
  });
});
