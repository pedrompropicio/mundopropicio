import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), audit: vi.fn(), error: vi.fn(), success: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: api.from, rpc: api.rpc } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "user", email: "executor@example.test" }, isAdmin: true, hasPermission: () => true,
}) }));
vi.mock("@/lib/audit", () => ({ logAudit: api.audit, getAuditUser: () => "executor@example.test" }));
vi.mock("sonner", () => ({ toast: { error: api.error, success: api.success } }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/TransactionFormModal", () => ({ TransactionFormModal: () => null }));
vi.mock("@/components/QuickAdvanceModal", () => ({ QuickAdvanceModal: () => null }));
vi.mock("@/components/TicketOfficeSettlementViewDialog", () => ({ TicketOfficeSettlementViewDialog: () => null }));

import { TicketOfficeSettlementModal } from "@/components/TicketOfficeSettlementModal";
import { TicketOfficeSettlementsPanel } from "@/components/TicketOfficeSettlementsPanel";

type Call = { table: string; patch?: Record<string, unknown>; filters: [string, unknown][] };
let calls: Call[];
let rows: Record<string, any[]>;
let failBank: boolean;
const clients: QueryClient[] = [];
const banks = [
  { id: "bank-a", name: "Banco A", type: "bank", company_id: "company", is_active: true },
  { id: "bank-b", name: "Banco B", type: "bank", company_id: "company", is_active: true },
];
const settlement = {
  id: "settlement", company_id: "company", financial_account_id: "office", event_id: "event",
  status: "confirmed", settlement_date: "2026-10-20", gross_revenue: 1250, total_deductions: 0,
  net_calculated: 1250, net_transferred: 1250, transfer_account_id: null,
  transfer_transaction_id: "outgoing", events: { id: "event", name: "Evento", date: "2026-10-19" },
};

function query(table: string) {
  const call: Call = { table, filters: [] };
  let single = false;
  let selected = false;
  const q: any = {
    select: () => { selected = true; return q; },
    update: (patch: Record<string, unknown>) => { call.patch = patch; return q; },
    eq: (key: string, value: unknown) => { call.filters.push([key, value]); return q; },
    in: (key: string, value: unknown[]) => { call.filters.push([key, value]); return q; },
    order: () => q, range: () => q,
    single: () => { single = true; return q; },
    then: (resolve: (result: unknown) => void) => {
      calls.push(call);
      const matched = (rows[table] ?? []).filter((row) => call.filters.every(([key, value]) =>
        Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
      if (call.patch && failBank && "account_id" in call.patch) {
        return Promise.resolve({ data: null, error: { message: "Banco recusado" } }).then(resolve);
      }
      if (call.patch) matched.forEach((row) => Object.assign(row, call.patch));
      return Promise.resolve({ data: single ? matched[0] : call.patch && !selected ? null : matched, error: null }).then(resolve);
    },
  };
  return q;
}

function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  clients.push(value);
  return value;
}

function modal(existingSettlement?: any) {
  const value = client();
  value.setQueryData(["settlement_eligible_events", "office"], [{ id: "event", name: "Evento", date: "2026-10-19" }]);
  value.setQueryData(["settlement_gross", "office", "event"], 1250);
  value.setQueryData(["settlement_sales_count", "office", "event"], 1);
  value.setQueryData(["settlement_eligible_txns", "office", "event", existingSettlement?.id], []);
  value.setQueryData(["settlement_bank_accounts"], [...banks, { id: "venue", name: "Sala", withholds_revenue: true }]);
  value.setQueryData(["settlement_venue_invoice_candidates", "event", existingSettlement?.id ?? null, ""], []);
  value.setQueryData(["settlement_statement", "statement"], { id: "statement", number: "3163", status: "draft" });
  render(<QueryClientProvider client={value}>
    <TicketOfficeSettlementModal open officeId="office" officeName="Bilheteira" defaultEventId="event" existingSettlement={existingSettlement} onClose={vi.fn()} />
  </QueryClientProvider>);
}

function panel() {
  render(<QueryClientProvider client={client()}>
    <TicketOfficeSettlementsPanel officeId="office" officeName="Bilheteira" />
  </QueryClientProvider>);
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Confirmar fecho" }));
const writes = () => calls.filter((call) => call.patch);

// Contrato observado antes da E2b: igualdade integral, incluindo p_transfer.
function originalPayload(credited: boolean, byStatement = false) {
  return {
    p_settlement_id: byStatement ? "draft" : null,
    p_payload: {
      financial_account_id: "office", event_id: "event", settlement_date: "2026-10-20",
      gross_revenue: 1250, total_deductions: 0, net_calculated: 1250, net_adjusted: null,
      adjustment_notes: null, gross_adjustment_notes: null, forma_liquidacao_manual: null,
      forma_liquidacao_manual_notes: null, net_transferred: 0, transfer_account_id: null,
      document_url: null, document_name: null, notes: null, venue_retained_amount: 0,
      venue_retained_invoice_id: null, venue_retained_notes: null,
      venue_invoice_remainder_paid: false, venue_invoice_remainder_amount: 0,
      status: "confirmed", closed_at: "2026-10-20T12:00:00.000Z", closed_by: "user",
      conciliated_by: "executor@example.test",
    },
    p_confirm: true, p_selected: [],
    p_transfer: byStatement ? null : { amount: 1250, to_account_id: "bank-a", credited },
    p_retained_payment_notes: "Compensação por venda à porta retida pela sala (fecho Bilheteira)",
    p_remainder_payment_notes: "Saldo restante liquidado pela bilheteira Bilheteira (fecho do evento)",
    p_audit_user: "executor@example.test",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  calls = [];
  failBank = false;
  rows = {
    ticket_office_settlements: [{ ...settlement }],
    transactions: [
      { id: "outgoing", company_id: "company", type: "expense", status: "pending", amount: 1250, account_id: "office", operation_key: "TRF-FECHO-TEST" },
      { id: "incoming", company_id: "company", type: "income", status: "pending", amount: 1250, account_id: null, operation_key: "TRF-FECHO-TEST" },
      { id: "other-company", company_id: "other", type: "income", status: "pending", amount: 1250, account_id: null, operation_key: "TRF-FECHO-TEST" },
    ],
    financial_accounts: [
      ...banks.map((a) => ({ ...a })),
      { id: "foreign", name: "Outro tenant", company_id: "other", type: "bank", is_active: true },
      { id: "cash", name: "Caixa", company_id: "company", type: "cash", is_active: true },
      { id: "inactive", name: "Inativo", company_id: "company", type: "bank", is_active: false },
    ],
  };
  api.from.mockImplementation(query);
  api.rpc.mockResolvedValue({ data: { settlement_id: "saved" }, error: null });
  api.audit.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((value) => value.clear());
  vi.useRealTimers();
});

describe("#314 E2b — modal do fecho", () => {
  it.each(["", "900"])("C1: sem banco provisiona o repasse (valor indicado: %s)", async (amount) => {
    modal();
    expect(screen.getByText("Repasse a receber — banco na liquidação")).toBeVisible();
    if (amount) fireEvent.change(screen.getByLabelText("Valor a transferir"), { target: { value: amount } });
    save();
    await waitFor(() => expect(api.rpc).toHaveBeenCalledOnce());
    const [name, payload] = api.rpc.mock.calls[0];
    expect(name).toBe("save_ticket_office_settlement");
    expect(payload.p_transfer).toEqual({ amount: amount ? 900 : 1250, to_account_id: "", credited: false });
  });

  it.each([true, false])("C2: com banco preserva integralmente o payload antigo (credited=%s)", async (credited) => {
    modal();
    // Estes seletores também existem no componente anterior à E2b, permitindo
    // executar a mesma asserção de igualdade contra HEAD e contra o patch.
    fireEvent.change(screen.getByRole("option", { name: "Banco A" }).closest("select")!, { target: { value: "bank-a" } });
    fireEvent.change(screen.getByPlaceholderText("1250.00"), { target: { value: "1250" } });
    if (!credited) fireEvent.click(screen.getByRole("radio", { name: /A receber/ }));
    save();
    await waitFor(() => expect(api.rpc).toHaveBeenCalledWith("save_ticket_office_settlement", originalPayload(credited)));
  });

  it("C3: desativa crédito confirmado sem banco e explica a recusa", async () => {
    modal();
    const credited = screen.getByRole("radio", { name: /Já creditado/ });
    expect(credited).toBeDisabled();
    expect(credited).toHaveAccessibleDescription("Crédito confirmado exige banco; sem banco o repasse fica a receber.");
    fireEvent.click(credited);
    expect(credited).not.toBeChecked();
    expect(api.rpc).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Conta destino (opcional)"), { target: { value: "bank-a" } });
    fireEvent.change(screen.getByLabelText("Valor a transferir"), { target: { value: "1250" } });
    fireEvent.click(screen.getByRole("radio", { name: /Já creditado/ }));
    fireEvent.change(screen.getByLabelText("Conta destino (opcional)"), { target: { value: "" } });
    expect(credited).toBeDisabled();
    expect(credited).not.toBeChecked();
    save();
    await waitFor(() => expect(api.rpc).toHaveBeenCalledOnce());
    expect(api.rpc.mock.calls[0][1].p_transfer.credited).toBe(false);
  });

  it("C2: a conta com retenção continua a gerar crédito pendente", async () => {
    modal();
    fireEvent.change(screen.getByLabelText("Conta destino (opcional)"), { target: { value: "venue" } });
    fireEvent.change(screen.getByLabelText("Valor a transferir"), { target: { value: "1250" } });
    save();
    await waitFor(() => expect(api.rpc).toHaveBeenCalledOnce());
    expect(api.rpc.mock.calls[0][1].p_transfer).toEqual({ amount: 1250, to_account_id: "venue", credited: false });
  });

  it("C1: guardar rascunho continua sem criar transferência", async () => {
    modal();
    fireEvent.change(screen.getByLabelText("Valor a transferir"), { target: { value: "1250" } });
    fireEvent.click(screen.getByRole("button", { name: /Guardar rascunho/i }));
    await waitFor(() => expect(api.rpc).toHaveBeenCalledOnce());
    expect(api.rpc.mock.calls[0][1]).toMatchObject({ p_confirm: false, p_transfer: null });
  });

  it("C5: por apuramento preserva integralmente o payload antigo", async () => {
    modal({ id: "draft", event_id: "event", status: "draft", settlement_date: "2026-10-20", statement_id: "statement" });
    expect(screen.queryByLabelText("Conta destino (opcional)")).toBeNull();
    save();
    await waitFor(() => expect(api.rpc).toHaveBeenCalledWith("save_ticket_office_settlement", originalPayload(false, true)));
  });
});

async function openCredit() {
  panel();
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar crédito" }));
  const dialog = within(screen.getByRole("alertdialog"));
  await dialog.findByRole("option", { name: "Banco A" });
  return dialog;
}

describe("#314 E2b — confirmar crédito no painel", () => {
  it("C4: exige data e banco e só lista bancos ativos da empresa", async () => {
    const dialog = await openCredit();
    const date = dialog.getByLabelText("Data do crédito (obrigatória)");
    const bank = dialog.getByLabelText("Banco (obrigatório)");
    const confirm = dialog.getByRole("button", { name: "Confirmar" });
    expect(date).toHaveAttribute("type", "text");
    expect(date).toHaveValue("");
    expect(dialog.getAllByRole("option").map((o) => o.textContent)).toEqual(["— Selecione o banco —", "Banco A", "Banco B"]);
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    fireEvent.change(bank, { target: { value: "bank-a" } });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    fireEvent.change(bank, { target: { value: "" } });
    fireEvent.change(date, { target: { value: "19/10/2026" } });
    expect(date).toHaveValue("19/10/2026");
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(writes()).toEqual([]);
    expect(api.rpc).not.toHaveBeenCalled();
    expect(dialog.getByRole("heading", { name: "Confirmar crédito na conta" })).toBeVisible();
  });

  it.each([null, "bank-a"])("C4: liquida pelo caminho existente e aplica o banco só à entrada (banco antigo: %s)", async (oldBank) => {
    rows.transactions[1].account_id = oldBank;
    rows.ticket_office_settlements[0].transfer_account_id = oldBank;
    const dialog = await openCredit();
    fireEvent.change(dialog.getByLabelText("Data do crédito (obrigatória)"), { target: { value: "19/10/2026" } });
    fireEvent.change(dialog.getByLabelText("Banco (obrigatório)"), { target: { value: "bank-b" } });
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(api.success).toHaveBeenCalledWith("Crédito confirmado"));
    expect(writes()).toEqual([
      { table: "transactions", patch: { account_id: "bank-b" }, filters: [["company_id", "company"], ["type", "income"], ["operation_key", "TRF-FECHO-TEST"]] },
      { table: "transactions", patch: { status: "paid", payment_date: "2026-10-19", paid_amount: 1250 }, filters: [["company_id", "company"], ["operation_key", "TRF-FECHO-TEST"]] },
    ]);
    expect(rows.transactions[0]).toMatchObject({ account_id: "office", status: "paid", payment_date: "2026-10-19" });
    expect(rows.transactions[1]).toMatchObject({ account_id: "bank-b", status: "paid", payment_date: "2026-10-19" });
    expect(rows.transactions[2]).toMatchObject({ account_id: null, status: "pending" });
    expect(api.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { payment_date: "2026-10-19", account_id: "bank-b" } }));
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("C4: limpar a data apaga o valor canónico e impede gravar", async () => {
    const dialog = await openCredit();
    fireEvent.change(dialog.getByLabelText("Data do crédito (obrigatória)"), { target: { value: "19/10/2026" } });
    fireEvent.change(dialog.getByLabelText("Banco (obrigatório)"), { target: { value: "bank-a" } });
    const confirm = dialog.getByRole("button", { name: "Confirmar" });
    expect(confirm).toBeEnabled();
    fireEvent.click(dialog.getByRole("button", { name: "Limpar data" }));
    fireEvent.blur(dialog.getByLabelText("Data do crédito (obrigatória)"));
    expect(confirm).toBeDisabled();
    expect(dialog.getByLabelText("Data do crédito (obrigatória)")).toHaveValue("");
    fireEvent.click(confirm);
    expect(writes()).toEqual([]);
  });

  it("C4: recusa data futura", async () => {
    const dialog = await openCredit();
    fireEvent.change(dialog.getByLabelText("Banco (obrigatório)"), { target: { value: "bank-a" } });
    fireEvent.change(dialog.getByLabelText("Data do crédito (obrigatória)"), { target: { value: "21/10/2026" } });
    fireEvent.blur(dialog.getByLabelText("Data do crédito (obrigatória)"));
    const confirm = dialog.getByRole("button", { name: "Confirmar" });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(writes()).toEqual([]);
  });

  it("C4: falha a atribuição do banco e não liquida o par", async () => {
    failBank = true;
    const dialog = await openCredit();
    fireEvent.change(dialog.getByLabelText("Data do crédito (obrigatória)"), { target: { value: "19/10/2026" } });
    fireEvent.change(dialog.getByLabelText("Banco (obrigatório)"), { target: { value: "bank-a" } });
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(api.error).toHaveBeenCalledWith("Erro ao confirmar crédito", { description: "Banco recusado" }));
    expect(writes()).toHaveLength(1);
    expect(rows.transactions.slice(0, 2).map((t) => t.status)).toEqual(["pending", "pending"]);
    expect(dialog.getByRole("heading", { name: "Confirmar crédito na conta" })).toBeVisible();
  });
});
