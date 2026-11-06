import { createHash } from "node:crypto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TransactionOffsetsBlock } from "@/components/TransactionOffsetsBlock";
import { TransactionPaymentModal } from "@/components/TransactionPaymentModal";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";
import { resolveCompanyLocale } from "@/lib/company-locale";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, any>, keys: [] as string[],
  writer: undefined as undefined | (() => Promise<any>),
  writes: [] as { table: string; operation: string; payload: any }[],
  hasBalance: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/useCompanyLocale", () => ({
  useCompanyLocale: () => resolveCompanyLocale({ country: "PT", currency: "EUR" }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "fixture@example.invalid" }, isAdmin: true, isManager: false,
}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => {
    f.keys.push(queryKey[0]);
    return { data: f.queries[queryKey[0]], isLoading: false };
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: ({ mutationFn }: any) => {
    f.writer = mutationFn;
    return { mutate: vi.fn(), isPending: false };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const q: any = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: { paid_amount: 0 }, error: null }),
      insert: (payload: any) => { f.writes.push({ table, operation: "insert", payload }); return q; },
      update: (payload: any) => { f.writes.push({ table, operation: "update", payload }); return q; },
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return q;
  },
  rpc: () => { throw new Error("#337: RPC proibida"); },
} }));
vi.mock("@/hooks/use-toast", () => ({ toast: f.toast, useToast: () => ({ toast: f.toast }) }));
vi.mock("@/lib/account-balance-rpc", () => ({
  accountHasBalanceFor: f.hasBalance, useAccountTrueBalance: () => 5000,
  insufficientBalanceMessage: () => "Saldo insuficiente",
}));
vi.mock("@/lib/offset-plan/groups", () => ({
  OFFSET_GROUP_STATUS_LABEL: { applied: "Aplicado" },
  useOffsetGroupsForTransaction: () => ({ data: f.queries.groups }),
}));
vi.mock("@/components/OffsetGroupDetailDialog", () => ({
  OffsetGroupDetailDialog: ({ groupId }: { groupId: string }) => <div role="dialog">Encontro {groupId}</div>,
}));
vi.mock("@/components/bank/BankLineOffsetModal", () => ({
  BankLineOffsetModal: ({ launch, onClose }: { launch: unknown; onClose: () => void }) =>
    <div role="dialog" aria-label="Assistente"><pre>{JSON.stringify(launch)}</pre><button onClick={onClose}>Fechar assistente</button></div>,
}));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

const bank = { id: "bank", name: "Banco sintético", type: "bank" };
const tx = {
  id: "tx", description: "Serviço sintético", type: "expense", amount: 100,
  iva_rate: 0, paid_amount: 0, status: "approved", currency: "EUR",
  payment_date: "2026-11-03", account_id: bank.id, supplier_id: "supplier",
  payment_method: "transfer", payment_entity: "10611", payment_reference: "123456789",
};
function modal(overrides = {}) {
  return <TransactionPaymentModal transaction={{ ...tx, ...overrides }} onClose={() => {}} />;
}
function payment() { return f.writes.find(w => w.table === "transaction_payments")?.payload; }
function domHash() {
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  vi.clearAllMocks();
  f.keys = []; f.writes = []; f.writer = undefined;
  f.hasBalance.mockResolvedValue(true);
  f.queries = { "financial-accounts-active": [bank], "category-code": "10.4.01" };
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#337: rede proibida"); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  cleanup(); vi.unstubAllGlobals(); vi.useRealTimers();
});
afterAll(() => vi.useRealTimers());

describe("#337 3c — remoção da criação legada", () => {
  it.each(["income", "expense"])("ficha %s preserva legados/grupos sem botão nem query de candidatos", type => {
    f.queries["transaction-offsets"] = [{
      id: "offset", receivable_transaction_id: "tx", payable_transaction_id: "other", amount: 25,
      pay: { description: "Despesa legada" }, applied: true,
    }];
    f.queries.groups = [{ group_id: "group", operation_date: "2026-11-03", supplier_name: "Entidade",
      movement_amount: 75, status: "applied" }];
    render(<TransactionOffsetsBlock transaction={{ ...tx, type }} canEdit />);
    expect(screen.queryByRole("button", { name: "Compensa com…" })).not.toBeInTheDocument();
    expect(f.keys).not.toContain("offset-candidates");
    expect(screen.getByText("Despesa legada")).toBeInTheDocument();
    expect(screen.getByTestId("legacy-offset-badge")).toHaveTextContent("Aplicada");
    expect(screen.getByTestId("offset-group-participation")).toHaveTextContent("03/11/2026 · Entidade");
    fireEvent.click(screen.getByRole("button", { name: "Ver encontro" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Encontro group");
    expect(f.writes).toEqual([]);
  });

  it.each(["income", "expense"])("%s: compensação abre/fecha o assistente sem gravar e conserva o método", async type => {
    render(modal({ type, payment_method: "direct_debit" }));
    const before = domHash();
    fireEvent.click(screen.getByRole("button", { name: "Compensação" }));
    expect(screen.getByRole("dialog", { name: "Assistente" })).toHaveTextContent(JSON.stringify({
      transactionId: "tx", supplierId: "supplier", originSign: type,
    }));
    expect(f.writes).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Fechar assistente" }));
    expect(domHash()).toBe(before);
    await f.writer!();
    expect(payment()).toMatchObject({ payment_method: "direct_debit", account_id: "bank" });
  });

  it.each(["income", "expense"])("%s: parcela planeada compensation exige conta e grava transferência", async type => {
    const view = render(modal({ type, payment_method: "compensation", account_id: null }));
    fireEvent.click(screen.getByRole("button", { name: "Compensação" }));
    expect(screen.getByRole("dialog", { name: "Assistente" })).toBeInTheDocument();
    await expect(f.writer!()).rejects.toThrow("Selecione a conta");
    expect(f.writes).toEqual([]);
    view.unmount();
    render(modal({ type, payment_method: "compensation" }));
    await f.writer!();
    expect(payment()).toMatchObject({ payment_method: "transfer", account_id: "bank" });
  });

  it("sem entidade recusa o assistente sem gravar", () => {
    render(modal({ supplier_id: null }));
    fireEvent.click(screen.getByRole("button", { name: "Compensação" }));
    expect(screen.queryByRole("dialog", { name: "Assistente" })).not.toBeInTheDocument();
    expect(f.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Sem entidade" }));
    expect(f.writes).toEqual([]);
  });

  it("a saída de dinheiro continua a recusar saldo insuficiente antes de gravar", async () => {
    f.hasBalance.mockResolvedValue(false);
    render(modal());
    await expect(f.writer!()).rejects.toThrow("Saldo insuficiente");
    expect(f.hasBalance).toHaveBeenCalledWith("bank", 100);
    expect(f.writes).toEqual([]);
  });

  it("baseline PT: preserva DOM e payloads de todos os outros métodos (capturada antes do 3c)", async () => {
    const hashes: Record<string, string> = {};
    for (const method of ["transfer", "service_payment", "direct_debit", "state_payment"] as const) {
      render(modal());
      fireEvent.click(screen.getByRole("button", { name: PAYMENT_METHOD_LABELS[method] }));
      hashes[method] = domHash();
      f.writes = [];
      await f.writer!();
      const fields = { account_id: "bank", payment_method: method,
        payment_entity: method === "service_payment" ? "10611" : null,
        payment_reference: method === "transfer" ? null : "123456789" };
      expect(payment()).toEqual({
        transaction_id: "tx", amount: 100, payment_date: "2026-11-03", ...fields,
        invoice_ref: null, withholding_amount: 0, credit_amount: 0, notes: null,
        created_by: "fixture@example.invalid",
      });
      expect(f.writes.find(w => w.table === "transactions")?.payload).toEqual(fields);
      expect(f.hasBalance).toHaveBeenLastCalledWith("bank", 100);
      cleanup();
    }
    expect(hashes).toMatchInlineSnapshot(`
      {
        "direct_debit": "b82e4a989bf03ad6ec4676d7db7ca77b7b82c28e11f6fa04ba0f8423ca277e91",
        "service_payment": "d95497e57f60448591672858b96ecd7b5a6ca608004dd07e14242baf7526e40b",
        "state_payment": "cf88eca0c579ceb3f61f30ed305f8cdbb0edb7c9078c579d21d838b89da46e8d",
        "transfer": "a29ec0abefedc98a05742883de67568a83e58a8a21e9dd1dea14c8e7882b09fa",
      }
    `);
  });
});
