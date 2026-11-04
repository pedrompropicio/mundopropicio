import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountantDocumentsTab } from "@/pages/contabilidade/AccountantDocumentsTab";
import { fetchAccountantReimbursementNotes, fetchAccountantReimbursementTransactionIds } from "@/lib/accountant-reimbursements";

type Row = Record<string, any>;
const f = vi.hoisted(() => ({
  companyId: "company-a",
  tables: {} as Record<string, Row[]>,
  reviews: {} as Record<string, Row>,
  counts: {} as Record<string, number>,
  requests: [] as { table: string; ids?: string[]; from?: number }[],
  failure: "",
  invoke: vi.fn(),
  fetchReviews: vi.fn(),
}));

// Fronteira PostgREST inteiramente local: as queryFns, paginação e filtros reais
// da aba correm sobre linhas sintéticas. Nenhum cliente MP é inicializado.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: f.invoke },
  from: (table: string) => {
    const predicates: ((row: Row) => boolean)[] = [];
    const orders: { column: string; ascending: boolean }[] = [];
    let ids: string[] | undefined;
    const result = (from?: number, to?: number) => {
      f.requests.push({ table, ids, from });
      if (f.failure === table) return { data: null, error: new Error(`Falha sintética: ${table}`) };
      let rows = (f.tables[table] ?? []).filter((row) => predicates.every((p) => p(row)));
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of orders) {
          if (a[column] === b[column]) continue;
          return (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      return { data: from === undefined ? rows : rows.slice(from, to! + 1), error: null };
    };
    const q = {
      select: () => q,
      eq: (column: string, value: unknown) => { predicates.push((r) => r[column] === value); return q; },
      gte: (column: string, value: string) => { predicates.push((r) => r[column] >= value); return q; },
      lte: (column: string, value: string) => { predicates.push((r) => r[column] <= value); return q; },
      in: (column: string, values: string[]) => { ids = values; predicates.push((r) => values.includes(r[column])); return q; },
      or: (filter: string) => {
        if (filter === "status.eq.paid,paid_amount.gt.0") predicates.push((r) => r.status === "paid" || r.paid_amount > 0);
        else {
          const excluded = filter.match(/^account_id\.is\.null,account_id\.not\.in\.\((.*)\)$/);
          if (!excluded) throw new Error(`Predicado não suportado: ${filter}`);
          predicates.push((r) => r.account_id === null || !excluded[1].split(",").includes(r.account_id));
        }
        return q;
      },
      order: (column: string, options?: { ascending: boolean }) => { orders.push({ column, ascending: options?.ascending ?? true }); return q; },
      range: async (from: number, to: number) => result(from, to),
      maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
      then: (resolve: (r: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return q;
  },
} }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: f.companyId }) }));
vi.mock("@/hooks/useCompanyLocale", () => ({ useCompanyLocale: () => ({ status: "available", locale: "pt-PT", currency: "EUR" }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "synthetic-user" } }) }));
vi.mock("@/lib/accountant-tx-docs", () => ({
  fetchAccountantDocCountsBatch: async () => f.counts,
  fetchAccountantTxDocs: async () => [],
}));
vi.mock("@/lib/accountant-reviews", () => ({
  fetchReviewsForTransactions: f.fetchReviews,
  saveAccountantReview: vi.fn(), reopenAccountantReview: vi.fn(),
}));

const company = "company-a";
const period = { from: "2026-01-01", to: "2026-12-31" };
const note = { id: "note-main", company_id: company, code: "R-002/2026", employee_name: "Pessoa sintética A", payment_transaction_id: "payment" };
const tx = (id: string, extra: Row = {}): Row => ({
  id, company_id: company, description: `Sintética ${id}`, type: "expense", account_id: "bank-a",
  amount: 20, paid_amount: 20, status: "paid", payment_date: "2025-12-01", invoice_ref: null,
  supplier_id: null, suppliers: null, ...extra,
});
let client: QueryClient;
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeAll(() => Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }));
afterAll(() => {
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

beforeEach(() => {
  vi.clearAllMocks();
  f.companyId = company; f.failure = ""; f.requests = []; f.counts = {};
  f.reviews = { payment: { status: "conferido" } };
  f.fetchReviews.mockImplementation(async (ids: string[]) => Object.fromEntries(ids.filter((id) => f.reviews[id]).map((id) => [id, f.reviews[id]])));
  f.invoke.mockResolvedValue({ data: { transaction_count: 3, document_count: 0, total_size_mb: 0 }, error: null });
  f.tables = {
    financial_accounts: [
      { id: "bank-a", name: "Conta A", company_id: company, is_accounting: true },
      { id: "bank-b", name: "Conta B", company_id: company, is_accounting: true },
      { id: "managerial", name: "Gerencial", company_id: company, is_accounting: false },
    ],
    reimbursement_notes: [
      { ...note, id: "foreign-note", company_id: "company-b", code: "R-999/2026", employee_name: "Outra empresa" },
      { ...note, id: "note-no-payment", code: "R-001/2026", employee_name: "Pessoa sintética B", payment_transaction_id: null },
      { ...note },
    ],
    reimbursement_note_items: ["item-a", "item-b", "unpaid", "managerial-tx", "null-account", "foreign-tx"].map((id) => ({
      id: `link-${id}`, company_id: company, reimbursement_note_id: note.id, transaction_id: id,
    })).concat([{ id: "no-payment-link", company_id: company, reimbursement_note_id: "note-no-payment", transaction_id: "item-no-payment" }]),
    transactions: [
      tx("payment"), tx("item-a", { account_id: "bank-b", status: "pending", paid_amount: 5 }),
      tx("item-b", { account_id: "bank-b", type: "income" }), tx("unpaid", { status: "pending", paid_amount: 0 }),
      tx("managerial-tx", { account_id: "managerial" }), tx("null-account", { account_id: null }),
      tx("foreign-tx", { company_id: "company-b" }), tx("item-no-payment"), tx("outside-note", { payment_date: "2026-05-01" }),
    ],
  };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#672: rede proibida"); }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function openTab() {
  return render(<QueryClientProvider client={client}><TooltipProvider><AccountantDocumentsTab period={period} /></TooltipProvider></QueryClientProvider>);
}
async function select(label: string, option: string) {
  const trigger = screen.getByRole("combobox", { name: label });
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole("option", { name: option }));
}
const chooseNote = () => select("Reembolso", "R-002/2026 · Pessoa sintética A");
const zipButton = () => screen.getByRole("button", { name: "Descarregar Tudo (ZIP)" });

describe("#672 — filtro e ZIP por nota", () => {
  it("oferece só notas da empresa por código descendente e lê pagamento + itens, ignorando período e excluindo impagas/gerenciais", async () => {
    openTab();
    await screen.findByText("Sintética outside-note");
    expect(screen.queryByText("Sintética payment")).not.toBeInTheDocument();
    await chooseNote();
    await screen.findByText("Sintética payment");
    expect(screen.getByText("Sintética item-a")).toBeInTheDocument();
    expect(screen.getByText("Sintética item-b")).toBeInTheDocument();
    expect(screen.getByText("Sintética null-account")).toBeInTheDocument();
    for (const id of ["unpaid", "managerial-tx", "foreign-tx", "outside-note", "item-no-payment"]) expect(screen.queryByText(`Sintética ${id}`)).not.toBeInTheDocument();
    expect(screen.getByText("Nota de reembolso completa (ignora o período)")).toBeVisible();
    expect(await fetchAccountantReimbursementNotes(company)).toEqual([
      expect.objectContaining({ id: note.id }), expect.objectContaining({ id: "note-no-payment" }),
    ]);
    await select("Conta", "Conta B");
    await screen.findByText("Sintética item-a");
    expect(screen.queryByText("Sintética payment")).not.toBeInTheDocument();
    expect(screen.getByText("Sintética item-b")).toBeInTheDocument();
  });

  it("nota sem pagamento apresenta só os itens e uma nota sem transações não alarga a seleção", async () => {
    openTab();
    await select("Reembolso", "R-001/2026 · Pessoa sintética B");
    await screen.findByText("Sintética item-no-payment");
    expect(screen.queryByText("Sintética payment")).not.toBeInTheDocument();
    expect(screen.queryByText("Sintética outside-note")).not.toBeInTheDocument();
    f.tables.reimbursement_note_items = [];
    f.tables.reimbursement_notes.find((n) => n.id === note.id)!.payment_transaction_id = null;
    await chooseNote();
    await screen.findByText("Sem transações para a nota e os filtros escolhidos.");
    await waitFor(() => expect(zipButton()).toBeEnabled());
    fireEvent.click(zipButton());
    await waitFor(() => expect(f.invoke).toHaveBeenCalledWith("generate-accountant-zip", expect.objectContaining({ body: expect.objectContaining({ transaction_ids: [] }) })));
  });

  it("envia apenas os IDs visíveis da nota no ZIP e combina Conta, Tipo, Anexos, Conferência e pesquisa", async () => {
    f.counts = { payment: 1, "item-a": 1 };
    openTab();
    await chooseNote();
    await waitFor(() => expect(zipButton()).toBeEnabled());
    fireEvent.click(zipButton());
    await waitFor(() => expect(f.invoke).toHaveBeenCalled());
    expect(f.invoke.mock.calls[0][1].body.transaction_ids.sort()).toEqual(["item-a", "item-b", "null-account", "payment"]);
    await select("Anexos", "Com anexos");
    await select("Conferência", "Conferidas");
    fireEvent.click(zipButton());
    await waitFor(() => expect(f.invoke).toHaveBeenCalledTimes(2));
    expect(f.invoke.mock.calls[1][1].body.transaction_ids).toEqual(["payment"]);
    await select("Conferência", "Conferência: Todas");
    await select("Conta", "Conta B");
    await select("Tipo", "Despesa");
    fireEvent.change(screen.getByPlaceholderText(/^Pesquisar/), { target: { value: "item-a" } });
    await screen.findByText("Sintética item-a");
    await waitFor(() => expect(zipButton()).toBeEnabled());
    fireEvent.click(zipButton());
    await waitFor(() => expect(f.invoke).toHaveBeenCalledTimes(3));
    expect(f.invoke.mock.calls[2][1].body).toMatchObject({ company_id: company, transaction_ids: ["item-a"], filters: { type: "expense", account_ids: ["bank-b"], has_attachments: "with" } });
  });

  it("não reutiliza conferências entre notas com a mesma quantidade de transações e limpa o filtro ao limitar ao período", async () => {
    f.tables.reimbursement_note_items = [];
    f.tables.reimbursement_notes[1].payment_transaction_id = "item-no-payment";
    openTab();
    await chooseNote();
    await waitFor(() => expect(zipButton()).toBeEnabled());
    await select("Conferência", "Conferidas");
    await select("Reembolso", "R-001/2026 · Pessoa sintética B");
    await screen.findByText("Sem transações para a nota e os filtros escolhidos.");
    await waitFor(() => expect(f.fetchReviews).toHaveBeenCalledWith(["item-no-payment"]));
    await select("Conferência", "Conferência: Todas");
    fireEvent.click(screen.getByRole("button", { name: "Limitar ao período" }));
    await screen.findByText("Sintética outside-note");
    expect(screen.queryByText("Sintética item-no-payment")).not.toBeInTheDocument();
  });

  it("descarta a seleção de outra empresa ao trocar a empresa ativa", async () => {
    const view = openTab();
    await chooseNote();
    await screen.findByText("Sintética payment");
    f.companyId = "company-b";
    view.rerender(<QueryClientProvider client={client}><TooltipProvider><AccountantDocumentsTab period={period} /></TooltipProvider></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Reembolso" })).toHaveTextContent("Reembolso: Todos"));
    expect(screen.queryByText("Sintética payment")).not.toBeInTheDocument();
    await expect(fetchAccountantReimbursementTransactionIds("company-b", note.id)).rejects.toThrow("indisponível nesta empresa");
  });

  it("falha fechada se a leitura de itens falhar", async () => {
    openTab();
    await screen.findByText("Sintética outside-note");
    f.failure = "reimbursement_note_items";
    await chooseNote();
    await screen.findByText("Falha sintética: reimbursement_note_items");
    expect(zipButton()).toBeDisabled();
    expect(f.invoke).not.toHaveBeenCalled();
  });

  it("bloqueia o ZIP enquanto as conferências da nota estão a carregar", async () => {
    openTab();
    await screen.findByText("Sintética outside-note");
    await waitFor(() => expect(f.fetchReviews).toHaveBeenCalled());
    let resolveReviews!: (value: object) => void;
    f.fetchReviews.mockReturnValueOnce(new Promise((resolve) => { resolveReviews = resolve; }));
    await chooseNote();
    await screen.findByText("Sintética payment");
    expect(zipButton()).toBeDisabled();
    fireEvent.click(zipButton());
    expect(f.invoke).not.toHaveBeenCalled();
    await act(async () => resolveReviews({}));
    await waitFor(() => expect(zipButton()).toBeEnabled());
  });

  it("pagina notas/itens e divide os IDs de transações em blocos de 200", async () => {
    f.tables.reimbursement_notes.push(...Array.from({ length: 1001 }, (_, i) => ({ ...note, id: `paged-note-${i}`, code: `A-${i}` })));
    expect(await fetchAccountantReimbursementNotes(company)).toHaveLength(1003);
    f.tables.reimbursement_note_items = Array.from({ length: 1001 }, (_, i) => ({ id: `link-${i}`, company_id: company, reimbursement_note_id: note.id, transaction_id: `paged-tx-${i}` }));
    f.tables.transactions = [tx("paged-tx-0"), tx("paged-tx-1000")];
    f.tables.reimbursement_note_items.push({ ...f.tables.reimbursement_note_items[0], id: "duplicate" });
    const ids = await fetchAccountantReimbursementTransactionIds(company, note.id);
    expect(ids).toHaveLength(1002);
    expect(f.requests).toContainEqual(expect.objectContaining({ table: "reimbursement_notes", from: 1000 }));
    expect(f.requests).toContainEqual(expect.objectContaining({ table: "reimbursement_note_items", from: 1000 }));
    f.tables.reimbursement_notes = [note];
    openTab();
    await chooseNote();
    await screen.findByText("Sintética paged-tx-1000");
    expect(screen.getByText("Sintética paged-tx-0")).toBeInTheDocument();
    const requests = f.requests.filter((r) => r.table === "transactions" && r.ids);
    expect(requests).toHaveLength(6);
    expect(requests.every((r) => r.ids!.length <= 200)).toBe(true);
  });
});
