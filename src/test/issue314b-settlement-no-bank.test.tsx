import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TicketOfficeSettlementModal } from "@/components/TicketOfficeSettlementModal";
import { TicketOfficeSettlementsPanel } from "@/components/TicketOfficeSettlementsPanel";

type Row = Record<string, any>;
type Call = { table: string; action: string; values?: Row; filters: [string, unknown][] };
const f = vi.hoisted(() => ({
  calls: [] as Call[],
  rows: {} as Record<string, Row[]>,
  fail: "",
  rpc: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  audit: vi.fn(),
}));

// Inert PostgREST substitute: executes the real component query/mutation code,
// applies filters to synthetic rows and rejects paid pairs without accounts.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: f.rpc,
  from: (table: string) => {
    const call: Call = { table, action: "select", filters: [] };
    let single = false;
    const query: any = {
      select: () => query,
      update: (values: Row) => { call.action = "update"; call.values = values; return query; },
      insert: (values: Row) => { call.action = "insert"; call.values = values; return query; },
      eq: (column: string, value: unknown) => { call.filters.push([column, value]); return query; },
      in: (column: string, values: unknown[]) => { call.filters.push([column, values]); return query; },
      order: () => query,
      range: () => query,
      single: () => { single = true; return query; },
      then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => {
        f.calls.push(structuredClone(call));
        const rows = (f.rows[table] ?? []).filter(row => call.filters.every(([key, value]) =>
          Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
        const stage = call.action === "update"
          ? call.values?.status === "paid" ? "paid" : table === "transactions" ? "income" : "settlement"
          : table === "transactions" && call.filters.some(([key]) => key === "type") ? "readIncome" : "read";
        let error: { message: string } | null = f.fail === stage ? { message: `Falha ${stage}` } : null;
        if (!error && call.action === "update" && call.values?.status === "paid" && rows.some(row => !row.account_id)) {
          error = { message: "paid exige conta nas duas pernas" };
        }
        if (!error && call.action === "update") rows.forEach(row => Object.assign(row, call.values));
        if (!error && single && rows.length !== 1) error = { message: "Esperada uma linha" };
        return Promise.resolve({ data: error ? null : structuredClone(single ? rows[0] : rows), error }).then(resolve, reject);
      },
    };
    return query;
  },
} }));
vi.mock("sonner", () => ({ toast: { success: f.success, error: f.error } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "fixture@example.invalid" }, isAdmin: true, hasPermission: () => true,
}) }));
vi.mock("@/lib/audit", () => ({ logAudit: f.audit, getAuditUser: () => "fixture" }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/TransactionFormModal", () => ({ TransactionFormModal: () => null }));
vi.mock("@/components/QuickAdvanceModal", () => ({ QuickAdvanceModal: () => null }));
vi.mock("@/components/TicketOfficeSettlementViewDialog", () => ({ TicketOfficeSettlementViewDialog: () => null }));

const officeId = "office";
const eventId = "event";
const operationKey = "TRF-FECHO-12345678";
const banks = [
  { id: "bank", name: "Banco sintético", type: "bank", is_active: true },
  { id: "other-bank", name: "Outro banco", type: "bank", is_active: true },
  { id: "cash", name: "Caixa", type: "cash", is_active: true },
  { id: "inactive-bank", name: "Banco inativo", type: "bank", is_active: false },
];
let client: QueryClient;
function mount(element: React.ReactNode) {
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
function writes() { return f.calls.filter(call => call.action === "update"); }
function seedModal(statementId: string | null = null) {
  client.setQueryData(["settlement_eligible_events", officeId], [{ id: eventId, name: "Evento sintético", date: "2026-11-01" }]);
  client.setQueryData(["settlement_gross", officeId, eventId], 100);
  client.setQueryData(["settlement_sales_count", officeId, eventId], 1);
  client.setQueryData(["settlement_eligible_txns", officeId, eventId, statementId ? "draft" : undefined], []);
  client.setQueryData(["settlement_bank_accounts"], banks.filter(bank => bank.is_active));
  client.setQueryData(["settlement_venue_invoice_candidates", eventId, statementId ? "draft" : null, ""], []);
  if (statementId) client.setQueryData(["settlement_statement", statementId], { id: statementId, number: "123", status: "draft" });
  mount(<TicketOfficeSettlementModal open onClose={vi.fn()} officeId={officeId} officeName="Bilheteira sintética"
    defaultEventId={eventId} existingSettlement={statementId ? { id: "draft", event_id: eventId, status: "draft", statement_id: statementId } : null} />);
}
function modalAmount() {
  // Existing modal labels do not have htmlFor; select the input by its visible section.
  return screen.getByText("Valor a transferir").parentElement!.querySelector("input")!;
}
function modalBank() {
  return screen.getByText("Conta destino", { exact: true }).parentElement!.querySelector("select")!;
}
async function openCredit(accountId: string | null = null) {
  f.rows.transactions[1].account_id = accountId;
  f.rows.ticket_office_settlements[0].transfer_account_id = accountId;
  mount(<TicketOfficeSettlementsPanel officeId={officeId} officeName="Bilheteira sintética" />);
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar crédito" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
  await screen.findByRole("option", { name: "Banco sintético" });
}
function chooseBank(id = "bank") {
  fireEvent.change(screen.getByLabelText("Banco do crédito"), { target: { value: id } });
}
function confirmCredit() { fireEvent.click(screen.getByRole("button", { name: "Confirmar" })); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#314b: rede proibida"); }));
  f.fail = "";
  f.calls = [];
  f.rpc.mockResolvedValue({ data: { settlement_id: "settlement" }, error: null });
  f.audit.mockResolvedValue(undefined);
  f.rows = {
    financial_accounts: structuredClone(banks),
    ticket_office_settlements: [{
      id: "settlement", financial_account_id: officeId, event_id: eventId, status: "confirmed",
      settlement_date: "2026-11-01", created_at: "2026-11-01T12:00:00Z", events: { name: "Evento sintético", date: "2026-11-01" },
      gross_revenue: 100, total_deductions: 0, net_calculated: 100, net_transferred: 100,
      transfer_transaction_id: "expense", transfer_account_id: null,
    }],
    transactions: [
      { id: "expense", type: "expense", account_id: officeId, amount: 100, paid_amount: 0, status: "pending", operation_key: operationKey, reversed_at: null },
      { id: "income", type: "income", account_id: null, amount: 100, paid_amount: 0, status: "pending", operation_key: operationKey, reversed_at: null },
    ],
  };
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("#314b critério 1 — provisão no fecho", () => {
  it("confirma sem banco e a receber com to_account_id null e credited false", async () => {
    seedModal();
    fireEvent.change(modalAmount(), { target: { value: "100" } });
    expect(screen.getByText("Repasse a receber — banco na liquidação")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /A receber/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar fecho" }));
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("save_ticket_office_settlement", expect.objectContaining({
      p_confirm: true, p_transfer: { amount: 100, to_account_id: null, credited: false },
    })));
    expect(f.error).not.toHaveBeenCalled();
  });

  it("bloqueia crédito confirmado sem banco antes de gravar", () => {
    seedModal();
    fireEvent.change(modalAmount(), { target: { value: "100" } });
    expect(screen.getByRole("radio", { name: /Já creditado/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar fecho" }));
    expect(f.error).toHaveBeenCalledWith("Selecione a conta destino da transferência");
    expect(f.rpc).not.toHaveBeenCalled();
    expect(writes()).toEqual([]);
    expect(f.audit).not.toHaveBeenCalled();
  });

  it.each([true, false])("preserva o caminho com banco (credited=%s)", async credited => {
    seedModal();
    fireEvent.change(modalBank(), { target: { value: "bank" } });
    fireEvent.change(modalAmount(), { target: { value: "100" } });
    if (!credited) fireEvent.click(screen.getByRole("radio", { name: /A receber/ }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar fecho" }));
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("save_ticket_office_settlement", expect.objectContaining({
      p_transfer: { amount: 100, to_account_id: "bank", credited },
    })));
    expect(f.error).not.toHaveBeenCalled();
  });

  it("guarda rascunho sem criar par nem exigir banco", async () => {
    seedModal();
    fireEvent.change(modalAmount(), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar rascunho/i }));
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("save_ticket_office_settlement", expect.objectContaining({
      p_confirm: false, p_transfer: null,
    })));
  });

  it("mantém os fechos por apuramento sem par próprio", async () => {
    seedModal("statement");
    expect(screen.queryByText("Valor a transferir")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar fecho" }));
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("save_ticket_office_settlement", expect.objectContaining({
      p_confirm: true, p_transfer: null,
    })));
  });
});

describe("#314b critério 2 — banco antes da liquidação", () => {
  it("exige banco na entrada sem conta e lista só os bancos ativos", async () => {
    await openCredit();
    expect(screen.getByLabelText("Banco do crédito")).toHaveValue("");
    expect(screen.getByLabelText("Banco do crédito")).toBeRequired();
    expect(screen.queryByRole("option", { name: "Caixa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Banco inativo" })).not.toBeInTheDocument();
    confirmCredit();
    expect(f.error).toHaveBeenCalledWith("Selecione o banco do crédito");
    expect(writes()).toEqual([]);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("exige data com DatePicker e conserva a data vazia após blur", async () => {
    await openCredit();
    chooseBank();
    const date = screen.getByLabelText("Data do crédito");
    expect(date).toHaveAttribute("type", "text");
    expect(date).toHaveValue("05/11/2026");
    fireEvent.change(date, { target: { value: "" } });
    fireEvent.blur(date);
    confirmCredit();
    expect(f.error).toHaveBeenCalledWith("Indique a data do crédito");
    expect(date).toHaveValue("");
    expect(writes()).toEqual([]);
  });

  it("atribui o banco à entrada e ao fecho antes de pagar as duas pernas na data escolhida", async () => {
    await openCredit();
    chooseBank();
    fireEvent.change(screen.getByLabelText("Data do crédito"), { target: { value: "04/11/2026" } });
    confirmCredit();
    await waitFor(() => expect(f.success).toHaveBeenCalledWith("Crédito confirmado"));
    expect(writes()).toEqual([
      { table: "transactions", action: "update", values: { account_id: "bank" }, filters: [["id", "income"], ["status", "pending"]] },
      { table: "ticket_office_settlements", action: "update", values: { transfer_account_id: "bank" }, filters: [["id", "settlement"]] },
      { table: "transactions", action: "update", values: { status: "paid", payment_date: "2026-11-04", paid_amount: 100 }, filters: [["operation_key", operationKey]] },
    ]);
    expect(f.rows.transactions.map(row => [row.status, row.account_id, row.paid_amount, row.payment_date])).toEqual([
      ["paid", officeId, 100, "2026-11-04"], ["paid", "bank", 100, "2026-11-04"],
    ]);
    expect(f.rows.ticket_office_settlements[0].transfer_account_id).toBe("bank");
    expect(f.error).not.toHaveBeenCalled();
  });

  it("o calendário não aceita data de crédito futura", async () => {
    await openCredit("bank");
    const date = screen.getByLabelText("Data do crédito");
    fireEvent.change(date, { target: { value: "06/11/2026" } });
    fireEvent.blur(date);
    expect(date).toHaveValue("05/11/2026");
    confirmCredit();
    await waitFor(() => expect(f.success).toHaveBeenCalledWith("Crédito confirmado"));
    expect(writes().at(-1)?.values?.payment_date).toBe("2026-11-05");
  });

  it("pré-seleciona a conta da entrada e preserva o update único do par que já tem conta", async () => {
    await openCredit("bank");
    expect(screen.getByLabelText("Banco do crédito")).toHaveValue("bank");
    confirmCredit();
    await waitFor(() => expect(f.success).toHaveBeenCalledWith("Crédito confirmado"));
    expect(writes()).toEqual([
      { table: "transactions", action: "update", values: { status: "paid", payment_date: "2026-11-05", paid_amount: 100 }, filters: [["operation_key", operationKey]] },
    ]);
  });

  it("permite mudar o banco de um repasse antigo ainda pendente", async () => {
    await openCredit("bank");
    chooseBank("other-bank");
    confirmCredit();
    await waitFor(() => expect(f.success).toHaveBeenCalledWith("Crédito confirmado"));
    expect(writes().map(call => call.values)).toEqual([
      { account_id: "other-bank" }, { transfer_account_id: "other-bank" },
      { status: "paid", payment_date: "2026-11-05", paid_amount: 100 },
    ]);
    expect(f.rows.transactions[0].account_id).toBe(officeId);
    expect(f.rows.transactions[1].account_id).toBe("other-bank");
  });

  it("preserva a limpeza e auditoria do carimbo de estorno ao liquidar o par com banco", async () => {
    f.rows.transactions[0].reversed_at = "2026-11-02T12:00:00Z";
    await openCredit("bank");
    confirmCredit();
    await waitFor(() => expect(f.success).toHaveBeenCalledWith("Crédito confirmado"));
    expect(writes().at(-1)?.values).toEqual({
      status: "paid", payment_date: "2026-11-05", paid_amount: 100, reversed_at: null, reversal_kind: null,
    });
    expect(f.calls.find(call => call.table === "transaction_audit_log" && call.action === "insert")?.values).toMatchObject({
      transaction_id: "expense", field_name: "Estorno", old_value: "Estornada em 2026-11-02",
    });
  });

  it.each(["income", "settlement"])("interrompe antes de pagar se falhar %s", async stage => {
    await openCredit();
    chooseBank();
    f.fail = stage;
    confirmCredit();
    await waitFor(() => expect(f.error).toHaveBeenCalledWith("Erro ao confirmar crédito", { description: `Falha ${stage}` }));
    expect(writes().some(call => call.values?.status === "paid")).toBe(false);
    expect(f.rows.transactions.every(row => row.status === "pending" && row.paid_amount === 0)).toBe(true);
    expect(f.success).not.toHaveBeenCalled();
  });

  it("falha ao pagar conserva conta e par pendente e permite repetir a liquidação", async () => {
    await openCredit();
    chooseBank();
    f.fail = "paid";
    confirmCredit();
    await waitFor(() => expect(f.error).toHaveBeenCalledWith("Erro ao confirmar crédito", { description: "Falha paid" }));
    expect(f.rows.transactions.map(row => [row.status, row.account_id, row.paid_amount])).toEqual([
      ["pending", officeId, 0], ["pending", "bank", 0],
    ]);
    expect(f.rows.ticket_office_settlements[0].transfer_account_id).toBe("bank");
    expect(f.audit).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    f.fail = "";
    confirmCredit();
    await waitFor(() => expect(f.success).toHaveBeenCalledWith("Crédito confirmado"));
    expect(f.rows.transactions.every(row => row.status === "paid")).toBe(true);
    expect(writes().filter(call => call.table === "transactions" && call.values?.account_id)).toHaveLength(1);
  });

  it("revalida a entrada ao confirmar e não escreve se a leitura falhar", async () => {
    await openCredit();
    chooseBank();
    f.fail = "readIncome";
    confirmCredit();
    await waitFor(() => expect(f.error).toHaveBeenCalledWith("Erro ao confirmar crédito", { description: "Falha readIncome" }));
    expect(writes()).toEqual([]);
  });
});
