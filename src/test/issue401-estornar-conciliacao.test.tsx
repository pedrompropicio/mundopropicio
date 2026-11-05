import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BankLineRefundSection } from "@/components/bank/BankLineRefundSection";
import BankReconciliation from "@/pages/BankReconciliation";
import { resolveCompanyLocale } from "@/lib/company-locale";

type Row = Record<string, any>;
type Filter = ["eq" | "neq" | "is" | "in", string, unknown];
interface Read { table: string; filters: Filter[]; columns: string; order: string[]; from: number; to: number }
const f = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>,
  page: {} as Record<string, any>,
  reads: [] as Read[],
  keys: [] as unknown[][],
  readError: null as { message: string } | null,
  locale: { country: "PT", currency: "EUR" },
  rpc: vi.fn(), success: vi.fn(), error: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: f.rpc,
  from: (table: string) => {
    if (!["transaction_payments", "transactions"].includes(table)) throw new Error("#401: leitura não autorizada");
    const filters: Filter[] = [];
    const order: string[] = [];
    let columns = "";
    const q = {
      select: (value: string) => { columns = value; return q; },
      eq: (key: string, value: unknown) => { filters.push(["eq", key, value]); return q; },
      neq: (key: string, value: unknown) => { filters.push(["neq", key, value]); return q; },
      is: (key: string, value: unknown) => { filters.push(["is", key, value]); return q; },
      in: (key: string, value: unknown[]) => { filters.push(["in", key, value]); return q; },
      order: (key: string) => { order.push(key); return q; },
      range: async (from: number, to: number) => {
        f.reads.push({ table, columns, filters: [...filters], order: [...order], from, to });
        if (f.readError) return { data: null, error: f.readError };
        const rows = (f.rows[table] ?? []).filter((row) => filters.every(([op, key, value]) =>
          op === "in" ? (value as unknown[]).includes(row[key]) :
            op === "neq" ? row[key] !== value : row[key] === value));
        rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        return { data: rows.slice(from, to + 1), error: null };
      },
      // Não se disponibiliza nenhum writer de tabela: só a RPC pode gravar.
    };
    return q;
  },
} }));
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: (options: any) => {
    if (options.queryKey[0] === "bank-recon-refund-candidates") {
      f.keys.push(options.queryKey);
      return actual.useQuery(options);
    }
    // A página recebe fixtures; apenas a nova query executa o seu código real.
    return { data: f.page[options.queryKey[0]], isSuccess: true, isLoading: false };
  } };
});
vi.mock("@/hooks/useCompanyLocale", () => ({ useCompanyLocale: () => resolveCompanyLocale(f.locale) }));
vi.mock("sonner", () => ({ toast: { success: f.success, error: f.error, warning: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: true, hasPermission: () => true, user: { email: "fixture@example.invalid" } }) }));
vi.mock("@/hooks/useRealtimeInvalidation", () => ({ useRealtimeInvalidation: () => {} }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/bank/BankLineDocumentsDialog", () => ({ default: () => null }));
vi.mock("@/components/bank/BankLineLaunchModal", () => ({ BankLineLaunchModal: () => null }));
vi.mock("@/components/bank/BankLineOffsetModal", () => ({ BankLineOffsetModal: () => null, OffsetLineButton: () => null }));
vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({ value, onValueChange, placeholder, disabled, options }: any) => (
    <select aria-label={placeholder} value={value} disabled={disabled} onChange={(event) => onValueChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option: any) => <optgroup key={option.value} label={option.group ?? ""}>
        <option value={option.value}>{option.label}</option>
      </optgroup>)}
    </select>
  ),
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => <select aria-label="Conta" value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: () => null, SelectValue: () => null,
}));

const line = { id: "refund-line", amount: 300, description: "DEVOLUÇÃO TRF CRED SEPA+ — teste", value_date: "2026-10-26", booking_date: "2026-10-26", status: "unmatched" };
const transaction = { id: "expense", type: "expense", reversed_at: null, date: "2026-10-21", description: "Despesa sintética", suppliers: { name: "Fornecedor sintético" } };
const payment = { id: "payment", transaction_id: transaction.id, account_id: "account", amount: 300, status: "paid", reversed_at: null, reversal_kind: null, offset_group_id: null, payment_method: "transfer", payment_date: "2026-10-21" };
const payload = { p_line_id: line.id, p_items: [{ transaction_id: transaction.id, mode: "devolucao", amount: 300 }] };
const unavailable = "Estorno pela conciliação ainda não disponível no servidor (modo «devolução» por aplicar). Nada foi gravado.";
const clients: QueryClient[] = [];

function mount(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  return { ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client, invalidate };
}
async function selectExpense(id = transaction.id) {
  const select = screen.getByRole("combobox", { name: "Escolher despesa para estornar" });
  await waitFor(() => expect(within(select).getByRole("option", { name: /Despesa sintética/ })).toBeInTheDocument());
  fireEvent.change(select, { target: { value: id } });
}
async function openPage(amount = 300) {
  f.page["bank-recon-lines"] = [
    { ...line, amount },
    { ...line, id: "sepa-line", amount: -300, status: "matched", matched_sepa_export_id: "sepa", description: "LOTE TRF CRED SEPA+ — teste" },
  ];
  const view = mount(<BankReconciliation />);
  fireEvent.change(screen.getByRole("combobox", { name: "Conta" }), { target: { value: "account" } });
  fireEvent.click(screen.getByRole("button", { name: "Conciliar" }));
  expect(screen.getByRole("dialog", { name: "Conciliar manualmente" })).toBeInTheDocument();
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  f.rows = { transaction_payments: [{ ...payment }], transactions: [{ ...transaction }] };
  f.reads = []; f.keys = []; f.readError = null;
  f.locale = { country: "PT", currency: "EUR" };
  f.rpc.mockReset().mockResolvedValue({ error: null });
  f.page = {
    "bank-recon-accounts": [{ id: "account", name: "Banco sintético", type: "bank" }],
    "bank-recon-statements": [{ id: "statement", period_from: "2026-10-20", period_to: "2026-10-29", n_lines: 2 }],
    "bank-recon-sepa": [{ id: "sepa", payment_list_id: "list", total_amount: 300, transaction_ids: [transaction.id] }],
    "bank-recon-account-links": { direct: [], bridge: [], sepaExportIds: ["sepa"] },
  };
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#401: rede proibida"); }));
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

describe("#401 E2b — estornar pela conciliação (fixtures, sem rede)", () => {
  it("C1: preserva todos os bytes da página original, retirando apenas as duas adições autorizadas", () => {
    const page = readFileSync("src/pages/BankReconciliation.tsx", "utf8");
    const original = page
      .replace(/^import \{ BankLineRefundSection \} from "@\/components\/bank\/BankLineRefundSection";\n/m, "")
      .replace(/^ {14}\{manualSign === "income" && \(\n[\s\S]*?^ {14}\)\}\n/m, "");
    // Baseline 00de327d5: inclui confirmManual e todo o DOM anterior a esta entrega.
    expect(createHash("sha256").update(original).digest("hex")).toBe("1bc78250084076fa50efbc87002302fd1d9cc485556d7ba9b1fec06efea4e941");
  });

  it("C1: o modal a débito não monta a secção nem consulta devoluções; settle mantém o payload", async () => {
    f.page["bank-recon-open-txns"] = [{ ...transaction, open_amount: 300 }];
    await openPage(-300);
    expect(screen.queryByRole("button", { name: "Estornar" })).not.toBeInTheDocument();
    expect(f.keys).toEqual([]);
    expect(f.reads).toEqual([]);
    fireEvent.change(screen.getByRole("combobox", { name: "Procurar e adicionar transação" }), { target: { value: transaction.id } });
    fireEvent.click(screen.getByRole("button", { name: "Ligar e liquidar" }));
    await waitFor(() => expect(f.rpc).toHaveBeenCalledExactlyOnceWith("reconcile_bank_line", {
      p_line_id: line.id, p_items: [{ transaction_id: transaction.id, mode: "settle", amount: 300 }],
    }));
  });

  it("C2: oferece a despesa já ligada ao SEPA mesmo com txns vazio e fecha com as cinco invalidações", async () => {
    f.page["bank-recon-txns"] = [];
    const { invalidate } = await openPage();
    await selectExpense();
    expect(screen.getByRole("option", { name: "21/10/2026 · 300,00 € · Despesa sintética · Fornecedor sintético" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Devolução de pagamento — despesas pagas nesta conta" })).toBeInTheDocument();
    expect(f.keys).toContainEqual(["bank-recon-refund-candidates", line.id, "account"]);
    fireEvent.click(screen.getByRole("button", { name: "Estornar" }));
    await waitFor(() => expect(f.success).toHaveBeenCalledWith("Pagamento estornado e linha conciliada."));
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("reconcile_bank_line", payload);
    expect(screen.queryByRole("dialog", { name: "Conciliar manualmente" })).not.toBeInTheDocument();
    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: ["bank-recon-lines", "statement"] }], [{ queryKey: ["bank-recon-bridge"] }],
      [{ queryKey: ["bank-recon-txns"] }], [{ queryKey: ["bank-recon-open-txns"] }], [{ queryKey: ["transactions"] }],
    ]);
  });

  it("C3: servidor sem modo devolucao mantém o modal aberto, sem invalidar nem tentar fallback", async () => {
    f.rpc.mockResolvedValue({ error: { message: 'Modo inválido (devolucao) — só "link" ou "settle".' } });
    const { invalidate } = await openPage();
    await selectExpense();
    fireEvent.click(screen.getByRole("button", { name: "Estornar" }));
    await waitFor(() => expect(f.error).toHaveBeenCalledExactlyOnceWith(unavailable));
    expect(screen.getByRole("dialog", { name: "Conciliar manualmente" })).toBeInTheDocument();
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("reconcile_bank_line", payload);
    expect(invalidate).not.toHaveBeenCalled();
    expect(f.success).not.toHaveBeenCalled();
  });

  it.each([
    'Modo inválido (devolucao) — só "link" ou "settle".',
    "Devolução ambígua — duas pernas pagas.",
    "Devolução parcial não suportada.",
    "Sem permissão",
  ])("C3: erro %s não chama onDone nem invalida", async (message) => {
    const done = vi.fn();
    f.rpc.mockResolvedValue({ error: { message } });
    const { invalidate } = mount(<BankLineRefundSection line={line} accountId="account" onDone={done} />);
    await selectExpense();
    fireEvent.click(screen.getByRole("button", { name: "Estornar" }));
    await waitFor(() => expect(f.error).toHaveBeenCalledWith(message.startsWith("Modo inválido") ? unavailable : "Erro ao estornar: " + message));
    expect(done).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });

  it("C4: conta apenas cash_refund reversed, exige a checkbox e limpa o consentimento ao mudar seleção", async () => {
    f.rows.transaction_payments.push(
      { ...payment, id: "refund-1", status: "reversed", reversal_kind: "cash_refund", account_id: "old-account" },
      { ...payment, id: "refund-2", status: "reversed", reversal_kind: "cash_refund" },
      { ...payment, id: "wrong-status", reversal_kind: "cash_refund" },
      { ...payment, id: "wrong-kind", status: "reversed", reversal_kind: "correction" },
    );
    const done = vi.fn();
    mount(<BankLineRefundSection line={line} accountId="account" onDone={done} />);
    await selectExpense();
    expect(screen.getByRole("alert")).toHaveTextContent("Esta despesa já teve 2 devolução(ões) — confirme que é uma nova devolução");
    expect(screen.getByRole("button", { name: "Estornar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Estornar" })).toBeEnabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    await selectExpense();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Estornar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Estornar" }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("reconcile_bank_line", payload);
  });

  it("C2: filtra todas as condições das pernas e das transações sem usar paid_amount", async () => {
    const invalid = [
      { account_id: "other" }, { amount: 299.99 }, { amount: 300.01 }, { status: "pending" },
      { reversed_at: "2026-10-20" }, { reversal_kind: "cash_refund" },
      { offset_group_id: "offset" }, { payment_method: "compensation" },
    ];
    invalid.forEach((override, index) => {
      const id = `invalid-${index}`;
      f.rows.transaction_payments.push({ ...payment, id, transaction_id: id, ...override });
      f.rows.transactions.push({ ...transaction, id });
    });
    for (const override of [{ type: "income" }, { reversed_at: "2026-10-20" }]) {
      const id = JSON.stringify(override);
      f.rows.transaction_payments.push({ ...payment, id, transaction_id: id });
      f.rows.transactions.push({ ...transaction, id, ...override });
    }
    mount(<BankLineRefundSection line={line} accountId="account" onDone={vi.fn()} />);
    await selectExpense();
    expect(screen.getAllByRole("option")).toHaveLength(2); // placeholder + única candidata
    expect(f.reads[0].filters).toEqual([
      ["eq", "account_id", "account"], ["eq", "status", "paid"], ["is", "reversed_at", null],
      ["is", "reversal_kind", null], ["is", "offset_group_id", null],
      ["neq", "payment_method", "compensation"], ["eq", "amount", 300],
    ]);
  });

  it("C2/C4: pagina pernas e 1001 estornos anteriores, divide IDs e apresenta uma opção por despesa", async () => {
    f.rows.transaction_payments = Array.from({ length: 1001 }, (_, index) => ({
      ...payment, id: `payment-${String(index).padStart(4, "0")}`, transaction_id: index < 2 ? transaction.id : `unavailable-${index}`,
    }));
    f.rows.transaction_payments.push(...Array.from({ length: 1001 }, (_, index) => ({
      ...payment, id: `refund-${index}`, status: "reversed", reversal_kind: "cash_refund",
    })));
    mount(<BankLineRefundSection line={line} accountId="account" onDone={vi.fn()} />);
    await selectExpense();
    expect(screen.getByRole("alert")).toHaveTextContent("1001 devolução(ões)");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    const paidReads = f.reads.filter((read) => read.table === "transaction_payments" && read.filters.some((filter) => filter[2] === "paid"));
    const refundReads = f.reads.filter((read) => read.filters.some((filter) => filter[2] === "cash_refund"));
    expect(paidReads.map(({ from, to }) => [from, to])).toEqual([[0, 999], [1000, 1999]]);
    expect(refundReads.map(({ from, to }) => [from, to])).toEqual([[0, 999], [1000, 1999]]);
    expect(f.reads.every((read) => read.order.at(-1) === "id")).toBe(true);
    const transactionReads = f.reads.filter((read) => read.table === "transactions");
    expect(transactionReads).toHaveLength(10);
    expect(transactionReads.every((read) => (read.filters.find(([op]) => op === "in")![2] as string[]).length <= 100)).toBe(true);
  });

  it("C2: bloqueia submissões repetidas enquanto a RPC está pendente", async () => {
    let finish!: (result: { error: null }) => void;
    f.rpc.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const done = vi.fn();
    mount(<BankLineRefundSection line={line} accountId="account" onDone={done} />);
    await selectExpense();
    const button = screen.getByRole("button", { name: "Estornar" });
    fireEvent.click(button); fireEvent.click(button);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => finish({ error: null }));
    expect(done).toHaveBeenCalledTimes(1);
  });

  it.each([{ country: "PT", currency: "EUR", expected: "300,00 €" }, { country: "BR", currency: "BRL", expected: "R$ 300,00" }])(
    "C2: apresenta a moeda configurada $currency", async ({ country, currency, expected }) => {
      f.locale = { country, currency };
      mount(<BankLineRefundSection line={line} accountId="account" onDone={vi.fn()} />);
      await selectExpense();
      expect(screen.getByRole("option", { name: /Despesa sintética/ }).textContent).toContain(expected);
    },
  );

  it("C2: uma falha de leitura não apresenta uma lista parcial nem permite estornar", async () => {
    f.readError = { message: "Leitura recusada" };
    mount(<BankLineRefundSection line={line} accountId="account" onDone={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Erro ao procurar despesas: Leitura recusada"));
    expect(screen.getByRole("button", { name: "Estornar" })).toBeDisabled();
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
