import { createHash } from "node:crypto";
import type { HTMLAttributes } from "react";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompany } from "@/hooks/useCompany";
import { useAccountTrueBalance } from "@/lib/account-balance-rpc";
import { TransactionPaymentModal } from "@/components/TransactionPaymentModal";
import { BatchPaymentModal } from "@/components/BatchPaymentModal";
import { TransferFormModal } from "@/components/TransferFormModal";

const f = vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  return {
    queries: {} as Record<string, any>, queryOptions: {} as Record<string, any>, fetching: false,
    mutation: null as any, allowMemory: false,
    writes: [] as { table: string; operation: string; payload: any }[],
    hasBalance: vi.fn(), invalidate: vi.fn(), recordUndo: vi.fn(), undoToast: vi.fn(),
  };
});
vi.mock("@/hooks/useCompany", () => ({ useCompany: vi.fn() }));
// Query functions never run; the real balance hook receives cached data and fetching state.
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: any) => {
    const key = options.queryKey[0];
    f.queryOptions[key] = options;
    return { data: f.queries[key], isLoading: false, isFetching: key === "account-true-balance" && f.fetching };
  },
  useQueryClient: () => ({ invalidateQueries: f.invalidate }),
  useMutation: (options: any) => {
    f.mutation = options;
    return { mutate: vi.fn(), reset: vi.fn(), isPending: false };
  },
}));
// Explicitly invoked mutation functions can only write to this in-memory recorder.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    if (!f.allowMemory) throw new Error("#498 P1n: serviço MP proibido");
    let written = false;
    const q: any = {
      insert: (payload: any) => { written = true; f.writes.push({ table, operation: "insert", payload }); return q; },
      update: (payload: any) => { written = true; f.writes.push({ table, operation: "update", payload }); return q; },
      select: () => q, eq: () => q, not: () => q, order: () => q, range: () => q,
      maybeSingle: async () => ({ data: { paid_amount: 34.56 }, error: null }),
      single: async () => ({ data: { id: `memory-${f.writes.length}` }, error: null }),
      then: (resolve: any) => Promise.resolve({ data: written ? [{ id: "memory-row" }] : [], error: null }).then(resolve),
    };
    return q;
  },
  rpc: () => { throw new Error("#498 P1n: RPC proibida"); },
  functions: { invoke: () => { throw new Error("#498 P1n: edge proibida"); } },
} }));
vi.mock("@/lib/account-balance-rpc", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/account-balance-rpc")>(),
  accountHasBalanceFor: f.hasBalance,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "fixture-user", email: "fixture@example.invalid" }, isAdmin: true, isManager: false,
}) }));
vi.mock("@/lib/undo", () => ({ recordUndo: f.recordUndo }));
vi.mock("@/hooks/useUndoToast", () => ({ showUndoToast: f.undoToast }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/components/ui/overlay-layer", () => ({
  OverlayLayer: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

const bank = { id: "bank", name: "Banco sintético", type: "bank" };
const destination = { id: "destination", name: "Destino sintético", type: "bank" };
const tx = {
  id: "tx", description: "Serviço sintético", type: "expense", amount: 1234.56, paid_amount: 34.56,
  currency: "EUR", original_amount: null, fx_rate: null, iva_rate: 0, status: "approved",
  date: "2026-11-01", payment_date: "2026-11-03", account_id: bank.id,
  payment_method: "transfer", invoice_ref: "TEST-498", supplier_id: "supplier",
  suppliers: { name: "Fornecedor sintético", iban: "PT50000201231234567890154" },
};
const noop = () => {};
const kinds = ["registo", "lote", "transferência"] as const;
type Kind = typeof kinds[number];
function setCompany(country = "PT", currency = "EUR") {
  vi.mocked(useCompany).mockReturnValue({
    company: { id: "company", country, currency }, companyId: "company", isLoading: false, isError: false,
  } as ReturnType<typeof useCompany>);
}
function element(kind: Kind, type = "expense") {
  const transaction = { ...tx, type, currency: vi.mocked(useCompany)().company!.currency };
  if (kind === "registo") return <TransactionPaymentModal transaction={transaction} onClose={noop} />;
  if (kind === "lote") return <BatchPaymentModal transactions={[transaction]} initialPaymentDate="2026-11-03" onClose={noop} />;
  return <TransferFormModal onClose={noop} />;
}
function selectAccount(index: number, name: string) {
  fireEvent.click(screen.getAllByRole("button", { name: "Selecionar conta…" })[index]);
  fireEvent.click(screen.getByRole("button", { name }));
}
function open(kind: Kind, type = "expense") {
  const view = render(element(kind, type));
  if (kind !== "registo") selectAccount(0, bank.name);
  return view;
}
function domHash() {
  // As in P2e-1, only generated React/Radix IDs are normalised.
  return createHash("sha256").update(document.body.innerHTML.replace(/radix-:[^"\s]+:/g, "radix-:fixture:")).digest("hex");
}
beforeEach(() => {
  vi.clearAllMocks(); setCompany();
  f.queries = { "financial-accounts-active": [bank, destination], "account-true-balance": 5000, "transfer-category": { id: "category" } };
  f.queryOptions = {}; f.fetching = false; f.mutation = null; f.allowMemory = false; f.writes = [];
  f.hasBalance.mockResolvedValue(true); f.recordUndo.mockResolvedValue({ id: "undo" });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#498 P1n: rede proibida"); }));
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("#498 P1n: rede proibida"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("#498 P1n: rede proibida"); } });
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); cleanup(); vi.unstubAllGlobals(); });
afterAll(() => { vi.useRealTimers(); });

describe("#498 P1n — hashes PT/EUR com saldo 5000 capturados antes da correção", () => {
  const hashes: Record<Kind, string> = {
    registo: "3f9514ea0572adc06cfd30b887b11dd45f1d5fb5279fde494a1a291bb61a6534",
    lote: "2b56ebdc772fd42e29d443ec8221dabfdf5a6253c3728e6066b83ca40c06e38c",
    transferência: "f0e59aa55a4bf72700f8da1d09ec9f982976752480540b351b57d8459f046ab9",
  };
  it.each(kinds)("%s conserva o DOM", kind => {
    open(kind);
    expect(domHash()).toBe(hashes[kind]);
  });
});

describe("#498 P1n — leitura fresca para apresentação", () => {
  it("exige nova leitura em cada montagem, sem herdar os 30 segundos de cache", () => {
    const hook = renderHook(({ accountId }) => useAccountTrueBalance(accountId), { initialProps: { accountId: bank.id } });
    expect(f.queryOptions["account-true-balance"]).toMatchObject({
      queryKey: ["account-true-balance", bank.id], enabled: true, staleTime: 0, refetchOnMount: "always",
    });
    expect(hook.result.current).toBe(5000);
    hook.rerender({ accountId: "" });
    expect(hook.result.current).toBeUndefined();
    expect(f.queryOptions["account-true-balance"].enabled).toBe(false);
  });

  it.each([0, 5000, null, undefined])("oculta cache %s durante isFetching e conserva o resultado fresco", data => {
    f.queries["account-true-balance"] = data; f.fetching = true;
    const hook = renderHook(() => useAccountTrueBalance(bank.id));
    expect(hook.result.current).toBeUndefined();
    f.fetching = false; hook.rerender();
    expect(hook.result.current).toBe(data);
  });

  it.each(kinds)("BR: %s oculta 0 em cache, apresenta 5000 fresco e conserva o aviso de 0 fresco", kind => {
    setCompany("BR", "BRL");
    f.queries["account-true-balance"] = 0; f.fetching = true;
    const view = open(kind);
    expect(document.body.textContent).not.toMatch(/Saldo (disponível|atual):|Sem saldo!|Saldo insuficiente!/);
    f.queries["account-true-balance"] = 5000; f.fetching = false;
    view.rerender(element(kind));
    expect(screen.getByText(/Saldo (disponível|atual):/).textContent).toBe(
      `${kind === "lote" ? "Saldo atual" : "Saldo disponível"}: R$\u00a05.000,00`,
    );
    expect(document.body.textContent).not.toMatch(/Sem saldo!|Saldo insuficiente!/);
    f.queries["account-true-balance"] = 0;
    view.rerender(element(kind));
    expect(screen.getByText(/Saldo (disponível|atual):/).textContent).toContain("R$\u00a00,00");
    if (kind === "registo") expect(document.body.textContent).toContain(" — Sem saldo!");
    if (kind === "lote") expect(document.body.textContent).toContain("— Saldo insuficiente!");
    // A second fetch also hides an already displayed balance.
    f.fetching = true; view.rerender(element(kind));
    expect(document.body.textContent).not.toMatch(/Saldo (disponível|atual):|Sem saldo!|Saldo insuficiente!/);
  });

  it.each(kinds)("%s não revela saldo quando a RPC devolve null", kind => {
    f.queries["account-true-balance"] = null;
    open(kind);
    expect(document.body.textContent).not.toMatch(/Saldo (disponível|atual):|Sem saldo!|Saldo insuficiente!/);
  });
});

function prepareMutation(kind: Kind, type = "expense") {
  open(kind, type);
  if (kind === "transferência") {
    selectAccount(0, destination.name);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "100" } });
  }
  f.allowMemory = true;
  return f.mutation;
}

describe("#498 P1n — invalidação e decisão da trava sem serviços", () => {
  it.each(kinds)("%s invalida toda a família de saldos depois de mutationFn + onSuccess", async kind => {
    const mutation = prepareMutation(kind);
    const result = await mutation.mutationFn();
    expect(f.writes.some(w => w.table === (kind === "transferência" ? "transactions" : "transaction_payments") && w.operation === "insert")).toBe(true);
    expect(f.invalidate).not.toHaveBeenCalled();
    await mutation.onSuccess(result);
    expect(f.invalidate).toHaveBeenCalledWith({ queryKey: ["account-true-balance"] });
    expect(f.invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] });
  });

  it("registar recebimento também invalida os saldos, sem consultar a trava de saída", async () => {
    const mutation = prepareMutation("registo", "income");
    await mutation.onSuccess(await mutation.mutationFn());
    expect(f.hasBalance).not.toHaveBeenCalled();
    expect(f.invalidate).toHaveBeenCalledWith({ queryKey: ["account-true-balance"] });
  });

  it("Desfazer invalida os saldos pelo callback existente", async () => {
    const mutation = prepareMutation("registo");
    await mutation.onSuccess(await mutation.mutationFn());
    expect(f.recordUndo).toHaveBeenCalledOnce();
    expect(f.undoToast).toHaveBeenCalledOnce();
    f.invalidate.mockClear();
    f.undoToast.mock.calls[0][0].onUndone();
    expect(f.invalidate).toHaveBeenCalledWith({ queryKey: ["account-true-balance"] });
  });

  it.each(kinds)("%s recusa sem gravar quando o servidor nega, mesmo com saldo visível 5000", async kind => {
    setCompany("BR", "BRL"); f.hasBalance.mockResolvedValue(false);
    const mutation = prepareMutation(kind);
    const expected = kind === "lote"
      ? "Saldo insuficiente na conta. Disponível: R$\u00a05.000,00, Necessário: R$\u00a01.200,00"
      : "Saldo insuficiente na conta. Disponível: R$\u00a05.000,00";
    await expect(mutation.mutationFn()).rejects.toThrow(expected);
    expect(f.hasBalance).toHaveBeenCalledExactlyOnceWith(bank.id, kind === "transferência" ? 100 : kind === "lote" ? 1199.95 : 1200);
    expect(f.writes).toEqual([]);
    expect(f.invalidate).not.toHaveBeenCalled();
  });

  it.each(kinds)("%s grava quando o servidor autoriza, mesmo com saldo visível 0", async kind => {
    setCompany("BR", "BRL"); f.queries["account-true-balance"] = 0;
    const mutation = prepareMutation(kind);
    await mutation.mutationFn();
    expect(f.hasBalance).toHaveBeenCalledExactlyOnceWith(bank.id, kind === "transferência" ? 100 : kind === "lote" ? 1199.95 : 1200);
    expect(f.writes.some(w => w.operation === "insert")).toBe(true);
  });

  it("a recusa durante refetch usa insufficientBalanceMessage sem revelar o valor em cache", async () => {
    f.fetching = true; f.hasBalance.mockResolvedValue(false);
    const mutation = prepareMutation("registo");
    await expect(mutation.mutationFn()).rejects.toThrow(/^Saldo insuficiente na conta\.$/);
    expect(f.writes).toEqual([]);
  });
});
