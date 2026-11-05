import { readFileSync } from "node:fs";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { PGlite } from "@electric-sql/pglite";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Treasury from "@/pages/Treasury";
import { loadTreasuryEvent, loadTreasuryRetainedDetails } from "@/hooks/useTreasuryBridge";
import { treasuryConferenceCsv } from "@/components/treasury/TreasuryConferenceView";
import { buildTreasuryBridge, treasuryColumns } from "@/lib/treasury-bridge";
import type { StatementBundle } from "@shared/settlement/statement-service.ts";

const f = vi.hoisted(() => ({
  allowed: true, companyId: "company", userId: "user", tables: {} as Record<string, any[]>,
  bundle: vi.fn(), from: vi.fn(), rpc: vi.fn(), requests: [] as { table: string; range: number[] }[],
  mode: "with_bp", stages: {} as Record<string, string>, position: {} as any,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: f.userId }, loading: false,
  permissions: f.allowed ? ["view_financial_position"] : [], hasPermission: () => f.allowed }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: f.companyId, isLoading: false, isError: false,
  company: { country: "PT", currency: "EUR" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: f.rpc, from: f.from } }));
// Só o carregador é simulado: receita, motor e documento são os módulos reais.
vi.mock("@shared/settlement/statement-service.ts", async (original) => ({
  ...await original<object>(), loadStatementBundle: f.bundle,
}));

const event = (id: string, name: string, parent: string | null = null) => ({ id, name, parent_event_id: parent, company_id: "company", business_line_id: "shows" });
const events = [event("future", "Futuro sem receita"), event("city", "Cidade futura", "future"),
  event("history", "Histórico com receita"), event("partial", "Pagamento parcial"),
  event("committed", "Compromisso aprovado"), event("sealed", "Evento selado"), event("cancelled", "Cancelado com caixa")];
const cash = [
  { level: "event" as const, event_id: "future", master_event_id: "future", committed: 0, realized: 0, pending: 0 },
  { level: "event" as const, event_id: "city", master_event_id: "future", committed: 0, realized: 0, pending: 0 },
  { level: "event" as const, event_id: "history", master_event_id: "history", committed: 0, realized: 10000, pending: 0 },
  { level: "event" as const, event_id: "partial", master_event_id: "partial", committed: 0, realized: -40, pending: 0 },
  { level: "event" as const, event_id: "committed", master_event_id: "committed", committed: -60, realized: 0, pending: -30 },
  { level: "event" as const, event_id: "cancelled", master_event_id: "cancelled", committed: 10, realized: 5, pending: 0 },
  { level: "common" as const, event_id: null, master_event_id: null, committed: -11, realized: -20, pending: -7 },
];
function bundle(id: string): StatementBundle {
  return {
    eventId: id, eventName: id, eventDate: "2026-11-05", eventLocation: null,
    basis: { expenseSource: "committed", includeOverhead: false, withVat: false }, calcBasis: "net_result",
    events: events.filter((item) => item.id === id || item.parent_event_id === id),
    transactions: [], forecasts: [], categories: [],
    settlements: [{ id: `root-${id}`, name: "Raiz", parent_id: null, position: 0 }],
    participants: [{ participantId: `house-${id}`, id: `house-${id}`, name: "Casa", settlement_id: `root-${id}`, isHouse: true, mode: "settles", percentage: 100, loss_percentage: null }],
    paidExpenses: [], extras: [], revenuesHeldRaw: [], grossDisbursementSupplierIds: [],
    ticketSales: [], ticketBreakdown: [], operations: [], participations: [], localeBySupplier: {},
  };
}
function query(table: string) {
  if (!f.tables[table]) throw new Error(`Tabela não prevista: ${table}`);
  let rows = f.tables[table];
  const builder: any = {
    select: () => builder, order: () => builder,
    eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return builder; },
    is: (key: string, value: unknown) => { rows = rows.filter((row) => (row[key] ?? null) === value); return builder; },
    range: (start: number, end: number) => { f.requests.push({ table, range: [start, end] }); return Promise.resolve({ data: rows.slice(start, end + 1), error: null }); },
  };
  return builder;
}
function position() {
  const payable = { total: 0, bp: 0, bp_linhas: 0, linhas_contrato_cache: 0, sublinhas: { lancado: 0, confirmado: 0, por_rever: 0, ajustado: 0, partner_paid_fora_do_total: 0 }, sem_bp: { total: 0, n: 0 }, so_transacoes: { total: 0, n: 0 } };
  const stages = (value: object) => Object.fromEntries(["planeamento", "em_curso", "em_fecho", "fechado"].map((stage) => [stage, value]));
  return {
    meta: { company_id: "10000000-0000-0000-0000-000000000001", year: null, reference_date: "2026-11-05", timezone: "Europe/Lisbon", version: "p4-v1", balances_visible: true, notes: "Caixa e retido nunca somam" },
    eventos_por_estagio: {}, caixa: [], cartoes: [], retido: { visivel: [], ocultas: [], total_visiveis: 480, total_ocultas: 0 },
    a_pagar: { por_estagio: stages(payable), total: 0, transitorias: { total: 0, itens: [] } },
    a_receber: { por_estagio: stages({ total: 0, n: 0 }), total: 0, transitorias: { total: 0, itens: [] } },
    acerto_informativo: { fora_do_total: true, contas: [], a_recuperar_caucao: { total: 0, n: 0 } },
    operacoes_terceiros_informativo: [], alertas: { pago_acima_do_bp: { n: 0, excesso: 0 }, bp_sem_transacao: { n: 0, total: 0, por_rever_n: 0 } },
    posicao: { caixa: 1045, cartoes: 0, caixa_e_cartoes: 1045, retido_visiveis: 480, a_pagar: 0, a_receber: 0, nota: "Lado a lado" },
  };
}
const tx = (id: string, eventId: string, status: string, amount: number, paid = 0, type = "expense") => ({ id, event_id: eventId, company_id: "company", status, amount, paid_amount: paid, type,
  account_id: "bank", date: "2026-11-01", due_date: "2026-11-03", payment_date: null,
  reversed_at: null, is_hidden: false, is_transitory: false, exclude_from_result: false, event_settlement_id: null });
const clients: QueryClient[] = [];
function openPage(path = "/erp/tesouraria") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Treasury /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks(); f.allowed = true; f.companyId = "company"; f.userId = "user"; f.mode = "with_bp"; f.requests = [];
  f.stages = { future: "planeamento", history: "historico", partial: "em_curso", committed: "em_fecho", sealed: "fechado", cancelled: "cancelado" };
  f.tables = {
    events, business_lines: [{ id: "shows", name: "Espetáculos", company_id: "company", is_active: true }],
    financial_accounts: [{ id: "office", name: "Bilheteira de prova", type: "ticket_office", company_id: "company" }, { id: "bank", name: "Banco de prova", type: "bank", company_id: "company", skip_balance_check: false }],
    event_ticket_office_assignments: ["future", "city", "history", "sealed"].map((event_id) => ({ financial_account_id: "office", event_id })),
    event_ticket_office_advances: [], partner_payment_contracts: [],
    event_settlements: [{ event_id: "sealed", is_sealed: true, parent_id: null, sealed_snapshot: { version: 1, nodes: [], eventNetResult: 100, basis: { expenseSource: "committed", includeOverhead: false } } }],
    transaction_payments: [],
    transactions: [tx("partial-expense", "partial", "partially_paid", 100, 40), tx("approved-expense", "committed", "approved", 60),
      tx("pending-expense", "committed", "pending", 30), tx("historical-income", "history", "paid", 10000, 10000, "income")],
  };
  f.position = position();
  f.from.mockImplementation(query); f.bundle.mockImplementation(async (_client, id) => bundle(id));
  f.rpc.mockImplementation(async (name) => {
    if (name === "event_stage_list") return { data: Object.entries(f.stages).map(([event_id, stage]) => ({ event_id, stage })), error: null };
    if (name === "event_budget_mode") return { data: f.mode, error: null };
    if (name === "ticket_office_balances") return { data: [{ account_id: "office", balance: 480 }], error: null };
    if (name === "get_ticket_office_sales") return { data: [{ event_id: "future", quantity: 10, revenue: 300 }, { event_id: "city", quantity: 5, revenue: 100 }, { event_id: "history", quantity: 2, revenue: 50 }, { event_id: "sealed", quantity: 1, revenue: 20 }, { event_id: "unassigned", quantity: 1, revenue: 10 }], error: null };
    if (name === "get_event_cash_position") return { data: cash, error: null };
    if (name === "get_financial_position_base") return { data: f.position, error: null };
    throw new Error(`RPC não prevista: ${name}`);
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#646 sem rede"); }));
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
const client = { from: f.from, rpc: f.rpc };
async function bridgeFixture() {
  const masters = events.filter((item) => !item.parent_event_id && ["planeamento", "em_curso", "em_fecho", "fechado"].includes(f.stages[item.id]));
  const results = Object.fromEntries(await Promise.all(masters.map(async (item) => [item.id, await loadTreasuryEvent(client, "company", item.id, f.stages[item.id])])));
  const retained = await loadTreasuryRetainedDetails(client, "company");
  return buildTreasuryBridge({ events, cash, stages: f.stages, businessLines: f.tables.business_lines, retained: retained.byEvent, retainedOffices: retained.offices, results });
}

describe("#646 D2-c — correção com prova da composição, motor real", () => {
  it("antigo → novo: pré-venda 400 deduzida → informativa; disponibilidade −400 → 0, sem mudar sinais", async () => {
    const bridge = await bridgeFixture();
    const future = bridge.company.children[0].children.find((node) => node.id === "future")!;
    expect(future.amounts.retained).toBe(0);
    expect(treasuryColumns(future.amounts).withoutPending[5]).toBe(0);
    expect(treasuryColumns({ ...future.amounts, retained: 400 }).withoutPending[5]).toBe(-400);
    expect(bridge.conference?.find((row) => row.id === "future")).toMatchObject({ retainedRaw: 400, retainedExcluded: 400,
      retainedReason: "pré-venda retida, receita ainda não reconhecida", revenue: { ticketingNet: 0, expenseSource: "committed" },
      children: [{ id: "city", retainedRaw: 100, amounts: { retained: 0 } }] });
    for (const node of [bridge.company, ...bridge.company.children, ...bridge.company.children.flatMap((line) => line.children)]) {
      for (const values of Object.values(treasuryColumns(node.amounts))) expect(values.slice(0, 5).reduce((a, b) => a + b, 0)).toBeCloseTo(values[5], 2);
    }
    expect(bridge.common.amounts).toMatchObject({ committed: -11, realized: -20, pending: -7 });
    expect(bridge.company.amounts.realized).toBe(-40);
  });
  it("fixture sintética reproduz os quatro montantes do despacho e isola a dedução indevida", () => {
    const result = (amount: number) => ({ result: amount, source: "base corrente" as const, partnersDue: 0, housePct: 100 });
    const input = {
      events: events.filter((item) => ["future", "history", "partial", "committed"].includes(item.id)), stages: f.stages, businessLines: f.tables.business_lines,
      cash: cash.filter((row) => ["future", "history", "partial", "committed"].includes(row.event_id ?? "")).map((row) => ({ ...row, committed: 0, realized: row.event_id === "committed" ? 860875.42 : row.realized })),
      retained: { future: 1260302.41 }, results: { future: result(0), partial: result(0), committed: result(2505.32) },
    };
    // Antigo: retido sempre abatido; os quatro sintomas são valores controlados, não uma leitura MP.
    expect(treasuryColumns(buildTreasuryBridge(input).company.amounts).withoutPending).toEqual([2505.32, 0, -1260302.41, -860835.42, 0, -2118632.51]);
    const corrected = buildTreasuryBridge({ ...input, results: { ...input.results, future: { ...result(0), revenue: { net: 0, ticketingNet: 0, ticketingSource: "real", ticketingRecognized: false, expenseSource: "committed" } } } });
    // Novo: só a parcela provadamente indevida muda; a linha 6 continua negativa pelo caixa.
    expect(treasuryColumns(corrected.company.amounts).withoutPending).toEqual([2505.32, 0, 0, -860835.42, 0, -858330.1]);
    expect(corrected.conference!.find((row) => row.id === "history")!.included).toBe(false);
  });
  it("receita de outra rubrica não prova reconhecimento da bilheteira", async () => {
    f.bundle.mockImplementation(async (_client, id) => ({ ...bundle(id), transactions: [{ ...tx("ab-income", id, "approved", 100, 0, "income"), account_categories: { code: "1.1.03" } }] }));
    const row = (await bridgeFixture()).conference!.find((item) => item.id === "future")!;
    expect(row.revenue).toMatchObject({ net: 100, ticketingNet: 0, ticketingRecognized: false });
    expect(row.amounts).toMatchObject({ result: 100, retained: 0 });
  });
  it("linhas reconhecidas que se anulam conservam a dedução por prudência", async () => {
    f.bundle.mockImplementation(async (_client, id) => ({ ...bundle(id), transactions: [100, -100].map((amount) => ({ ...tx(`ticket-${amount}`, id, "approved", amount, 0, "income"), account_categories: { code: "1.1.01" } })) }));
    const row = (await bridgeFixture()).conference!.find((item) => item.id === "future")!;
    expect(row.revenue).toMatchObject({ ticketingNet: 0, ticketingRecognized: true });
    expect(row.amounts.retained).toBe(400);
  });
  it.each(["with_bp", "without_bp"])("%s: vendas presentes no motor mantêm a dedução em futuros", async (mode) => {
    f.mode = mode;
    f.bundle.mockImplementation(async (_client, id) => ({ ...bundle(id), ticketSales: [{ gross: 400, net: 400 }] }));
    const bridge = await bridgeFixture();
    const row = bridge.conference!.find((item) => item.id === "future")!;
    expect(row.revenue).toMatchObject({ net: 400, ticketingNet: 400, ticketingSource: "real", ticketingRecognized: true, expenseSource: mode === "without_bp" ? "realized" : "committed" });
    expect(row.amounts.retained).toBe(400); expect(row.retainedExcluded).toBe(0);
    expect(row.amounts.result).toBe(400);
  });
  it("BP de bilheteira incluído não é confundido com ausência de receita", async () => {
    f.bundle.mockImplementation(async (_client, id) => ({ ...bundle(id), forecasts: [{ id: "revenue", event_id: id, type: "income", status: "approved", amount: 500, account_categories: { code: "1.1.01" } }] }));
    const row = (await bridgeFixture()).conference!.find((item) => item.id === "future")!;
    expect(row.revenue).toMatchObject({ ticketingSource: "bp", ticketingNet: 500, ticketingRecognized: true });
    expect(row.amounts).toMatchObject({ result: 500, retained: 400 });
  });
  it("receita só da casa mantém a âncora do evento e não provoca exclusão do retido", async () => {
    f.bundle.mockImplementation(async (_client, id) => ({ ...bundle(id), transactions: [{ ...tx("house-income", id, "approved", 400, 0, "income"), account_categories: { code: "1.1.01" }, excluded_from_partner_settlement: true }] }));
    const row = (await bridgeFixture()).conference!.find((item) => item.id === "future")!;
    expect(row.revenue).toMatchObject({ net: 400, ticketingNet: 400, ticketingRecognized: true });
    expect(row.amounts).toMatchObject({ result: 400, retained: 400 });
  });
  it("selo sem composição conserva o retido e declara a incerteza", async () => {
    const row = (await bridgeFixture()).conference!.find((item) => item.id === "sealed")!;
    expect(row).toMatchObject({ source: "selado", amounts: { result: 100, retained: 20 }, retainedExcluded: 0 });
    expect(row.revenue).toBeUndefined(); expect(row.retainedReason).toContain("indeterminado");
  });
  it("não aumenta committed no cliente para esconder o defeito de partially_paid do RPC", async () => {
    const bridge = await bridgeFixture();
    expect(bridge.conference!.find((item) => item.id === "partial")!.rawCash).toMatchObject({ committed: 0, realized: -40 });
    expect(bridge.conference!.find((item) => item.id === "committed")!.rawCash).toMatchObject({ committed: -60, pending: -30 });
    expect(f.tables.transactions[0]).toMatchObject({ status: "partially_paid", amount: 100, paid_amount: 40 });
  });
});

describe("#646 D2-c — conferência no ecrã", () => {
  it("mostra os quatro sintomas, fontes, sub-eventos, exclusões e comparação P4 sem somar retido", async () => {
    openPage(); await screen.findByRole("table", { name: "Ponte — Empresa" });
    expect(f.rpc.mock.calls.some(([name]) => name === "get_financial_position_base")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Conferência" }));
    const region = await screen.findByRole("region", { name: "Conferência da Tesouraria" });
    await waitFor(() => expect(within(region).getByRole("button", { name: "Exportar CSV" })).toBeEnabled());
    const future = within(region).getByRole("row", { name: /Futuro sem receita/ });
    expect(future).toHaveTextContent("base corrente"); expect(future).toHaveTextContent("pré-venda retida, receita ainda não reconhecida");
    expect(future).toHaveTextContent("Bilheteira de prova (office): 400,00");
    fireEvent.click(within(future).getByText("Sub-eventos de Futuro sem receita"));
    expect(within(region).getByRole("row", { name: /Cidade futura/ })).toBeVisible();
    const excluded = within(region).getByRole("region", { name: "Eventos fora do perímetro" });
    const history = within(excluded).getByRole("row", { name: /Histórico com receita/ });
    expect(history).toHaveTextContent("Não · estágio do Master: historico");
    expect(history).toHaveTextContent("historical-income"); expect(history).toHaveTextContent("10.000,00");
    expect(within(excluded).getByRole("row", { name: /Cancelado com caixa/ })).toHaveTextContent("cancelado");
    const partial = within(region).getByRole("row", { name: /Pagamento parcial/ });
    expect(partial).toHaveTextContent("partially_paid"); expect(partial).toHaveTextContent("Saldo: 60,00");
    expect(partial).toHaveTextContent("Saldo excluído de committed pelo RPC · R2 pendente");
    expect(partial).toHaveTextContent("Banco de prova (bank)");
    const committed = within(region).getByRole("row", { name: /Compromisso aprovado/ });
    expect(committed).toHaveTextContent("committed: -60,00"); expect(committed).toHaveTextContent("pending: -30,00");
    expect(committed).toHaveTextContent("RPC caixa");
    expect(within(region).getByText(/Comuns à parte/)).toHaveTextContent("-20,00");
    expect(within(region).getByText(/Posição Financeira ·/)).toHaveTextContent("Caixa e cartões: 1.045,00");
    expect(f.rpc).toHaveBeenCalledWith("get_financial_position_base", { p_company_id: "company", p_year: null });
    expect(f.bundle).toHaveBeenCalledTimes(4);
    expect(f.bundle.mock.calls.some(([, id]) => id === "history")).toBe(false);
  }, 15000);
  it("mostra a conta das pernas de pagamento que alimentam os ajustes do RPC", async () => {
    f.tables.financial_accounts.push({ id: "adjustment-bank", name: "Banco do ajuste", type: "bank", company_id: "company" });
    f.tables.transaction_payments = [{ id: "payment-proof", company_id: "company", transaction_id: "partial-expense", account_id: "adjustment-bank", amount: 25, withholding_amount: 5, credit_amount: 10, payment_date: "2026-11-05", status: "paid", reversed_at: null }];
    const implementation = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation((name, args) => name === "get_event_cash_position" ? Promise.resolve({ data: cash.map((row) => row.event_id === "partial" ? { ...row, realized: -25 } : row), error: null }) : implementation(name, args));
    openPage(); await screen.findByRole("table", { name: "Ponte — Empresa" }); fireEvent.click(screen.getByRole("button", { name: "Conferência" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeEnabled());
    const row = screen.getByRole("row", { name: /Pagamento parcial/ });
    expect(row).toHaveTextContent("Banco de prova (bank)");
    expect(row).toHaveTextContent("Banco do ajuste (adjustment-bank)");
    expect(row).toHaveTextContent("Retenção: 5,00"); expect(row).toHaveTextContent("Crédito: 10,00");
    expect(row).toHaveTextContent("realized: -25,00");
  });
  it("CSV inclui Masters, filhos, excluídos, fontes, contas e números crus; texto não vira fórmula", async () => {
    const bridge = await bridgeFixture();
    bridge.conference![0].name = '=HYPERLINK("https://invalid")';
    const csv = treasuryConferenceCsv(bridge);
    expect(csv).toContain('"\'=HYPERLINK(""https://invalid"")"');
    expect(csv).toContain('"history";"Histórico com receita"');
    expect(csv).toContain('"city";"Cidade futura";"future";"Detalhe (não somar ao Master)"');
    expect(csv).toContain("Bilheteira de prova (office): 400");
    expect(csv).toContain('"common";"Comuns"'); expect(csv).toContain('"RPC committed próprio"');
    const lines = csv.split("\r\n"); expect(lines).toHaveLength(events.length + 2);
  });
  it("o botão descarrega o CSV da conferência carregada", async () => {
    const create = vi.fn(() => "blob:conference"), revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    openPage(); await screen.findByRole("table", { name: "Ponte — Empresa" }); fireEvent.click(screen.getByRole("button", { name: "Conferência" }));
    const button = screen.getByRole("button", { name: "Exportar CSV" });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    expect(create).toHaveBeenCalledOnce(); expect(click).toHaveBeenCalledOnce();
    expect(click.mock.instances[0]).toHaveAttribute("download", "tesouraria-conferencia.csv"); expect(revoke).toHaveBeenCalledWith("blob:conference");
    click.mockRestore();
  });
  it("conferência partilha a permissão e não faz leituras sem acesso", () => {
    f.allowed = false; openPage();
    expect(screen.getByRole("heading", { name: "Sem acesso" })).toBeInTheDocument();
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
  });
  it("falha de P4 não esconde a ponte nem permite exportar conferência incompleta", async () => {
    f.position = { malformed: true }; openPage();
    await screen.findByRole("table", { name: "Ponte — Empresa" }); fireEvent.click(screen.getByRole("button", { name: "Conferência" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Conferência incompleta");
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Ponte" }));
    expect(screen.getByRole("table", { name: "Ponte — Empresa" })).toBeInTheDocument();
  });
  it("pagina os detalhes para além de mil e limpa dados ao mudar empresa", async () => {
    f.tables.transactions = [...f.tables.transactions, ...Array.from({ length: 1001 }, (_, index) => tx(`tx-${index}`, "partial", "partially_paid", 1))];
    const view = openPage(); await screen.findByRole("table", { name: "Ponte — Empresa" }); fireEvent.click(screen.getByRole("button", { name: "Conferência" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeEnabled());
    expect(f.requests.some((request) => request.table === "transactions" && request.range[0] === 1000)).toBe(true);
    expect(screen.getByText(/tx-1000 ·/)).toBeInTheDocument();
    await act(async () => { f.companyId = "other"; view.rerender(<QueryClientProvider client={clients[0]}><MemoryRouter><Treasury /></MemoryRouter></QueryClientProvider>); });
    expect(screen.queryByText(/historical-income/)).not.toBeInTheDocument();
  });
});

const sql = readFileSync("docs/testes/issue646/conferencia-d2.sql", "utf8");
describe("#646 D2-c — SQL inerte de conferência", () => {
  it("é uma única instrução de leitura parametrizada e não contém verbos de escrita", () => {
    const source = sql.replace(/--[^\n]*/g, "").trim();
    expect(source).toMatch(/^WITH\s/i); expect(source).toContain(":company_id::uuid");
    expect(source.match(/;/g)).toHaveLength(1);
    expect(source.replace(/'(?:''|[^'])*'/g, "''")).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|MERGE|CALL|DO|COPY|GRANT|REVOKE)\b/i);
    for (const name of ["event_stage_list", "get_event_cash_position", "get_ticket_office_sales", "get_financial_position_base"]) expect(source).toContain(`public.${name}(`);
  });
  it("executa integralmente em PostgreSQL sintético: estados, receita histórica, cortes, bilheteiras e reconciliação", async () => {
    const id = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
    const company = id(1), historical = id(2), future = id(3), partial = id(4), committed = id(5), child = id(6), cancelled = id(7),
      line = id(8), bank = id(9), office = id(10), category = id(11), lot = id(12), zone = id(13), root = id(14), nested = id(15);
    // DDL/DML apenas na fixture efémera em memória; nenhum serviço ou base MP.
    const schema = `
      CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid, name text, parent_event_id uuid, business_line_id uuid, date date, st text);
      CREATE TABLE business_lines(id uuid, company_id uuid, name text);
      CREATE TABLE financial_accounts(id uuid, company_id uuid, name text, type text, initial_balance numeric, initial_balance_date date, skip_balance_check boolean, balance numeric);
      CREATE TABLE account_categories(id uuid, code text);
      CREATE TABLE event_settlements(id uuid, parent_id uuid);
      CREATE TABLE transactions(id uuid, company_id uuid, event_id uuid, account_id uuid, type text, status text, amount numeric, paid_amount numeric, date date, payment_date date, due_date date, reversed_at timestamptz, is_hidden boolean, is_transitory boolean, exclude_from_result boolean, event_settlement_id uuid, category_id uuid);
      CREATE TABLE transaction_payments(transaction_id uuid, account_id uuid, payment_date date, withholding_amount numeric, credit_amount numeric);
      CREATE TABLE bank_statements(financial_account_id uuid, company_id uuid, period_from date);
      CREATE TABLE event_ticket_zones(id uuid, event_id uuid);
      CREATE TABLE event_ticket_lots(id uuid, zone_id uuid, iva_rate integer);
      CREATE TABLE ticket_sales(zone_id uuid, lot_id uuid, financial_account_id uuid, quantity numeric, unit_price numeric, total_value numeric, sale_date date);
      CREATE TABLE event_ticket_office_assignments(event_id uuid, financial_account_id uuid);
      CREATE TABLE event_ticket_office_advances(event_id uuid, financial_account_id uuid, amount numeric, transaction_id uuid, settlement_id uuid);
      CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${company}'::uuid $$;
      CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE FUNCTION event_stage_list() RETURNS TABLE(event_id uuid, stage text) LANGUAGE sql AS $$ SELECT id, st FROM events $$;
      CREATE FUNCTION ticket_office_balances(uuid[]) RETURNS TABLE(account_id uuid, balance numeric) LANGUAGE sql AS $$ SELECT id, balance FROM financial_accounts WHERE id = ANY($1) $$;
      CREATE FUNCTION get_financial_position_base(uuid, integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"posicao":{"caixa_e_cartoes":10960},"meta":{"reference_date":"2026-11-05"}}'::jsonb $$;
      INSERT INTO business_lines VALUES ('${line}','${company}','Espetáculos');
      INSERT INTO events VALUES
        ('${historical}','${company}','Histórico',null,'${line}','2026-01-01','historico'),
        ('${future}','${company}','Futuro',null,'${line}','2027-01-01','planeamento'),
        ('${partial}','${company}','Parcial',null,'${line}','2026-11-01','em_curso'),
        ('${committed}','${company}','Aprovado',null,'${line}','2026-11-01','em_fecho'),
        ('${child}','${company}','Cidade','${future}','${line}','2027-01-02','planeamento'),
        ('${cancelled}','${company}','Cancelado',null,'${line}','2026-01-01','cancelado');
      INSERT INTO financial_accounts VALUES
        ('${bank}','${company}','Banco','bank',1000,'2026-08-31',false,10945),
        ('${office}','${company}','Bilheteira','ticket_office',0,null,false,280);
      INSERT INTO bank_statements VALUES ('${bank}','${company}','2026-08-31');
      INSERT INTO account_categories VALUES ('${category}','1.1.01'), ('${id(16)}','10.6.03');
      INSERT INTO event_settlements VALUES ('${root}',null), ('${nested}','${root}');
      INSERT INTO transactions (id,company_id,event_id,account_id,type,status,amount,paid_amount,date,payment_date,due_date,category_id,event_settlement_id) VALUES
        ('${id(20)}','${company}','${historical}','${bank}','income','paid',10000,10000,'2026-01-01','2026-09-01','2026-01-02','${category}',null),
        ('${id(21)}','${company}','${partial}','${bank}','expense','partially_paid',100,40,'2026-11-01','2026-11-01',null,null,null),
        ('${id(22)}','${company}','${committed}','${bank}','expense','approved',60,0,'2026-11-01',null,null,null,null),
        ('${id(23)}','${company}','${committed}','${bank}','expense','pending',30,0,'2026-11-01',null,null,null,null),
        ('${id(24)}','${company}','${future}','${office}','expense','paid',100,100,'2026-11-01','2026-11-01',null,null,null),
        ('${id(25)}','${company}','${historical}','${bank}','income','approved',200,0,'2025-01-01',null,'2026-10-01',null,'${root}'),
        ('${id(26)}','${company}','${historical}','${bank}','income','approved',900,0,'2026-01-01',null,'2027-01-01',null,null),
        ('${id(27)}','${company}','${historical}','${bank}','income','approved',777,0,'2026-01-01',null,null,null,'${nested}'),
        ('${id(28)}','${company}',null,'${bank}','expense','paid',20,20,'2026-11-01','2026-11-01',null,null,null),
        ('${id(29)}','${company}','${cancelled}','${bank}','income','paid',5,5,'2026-09-01','2026-09-01',null,null,null),
        ('${id(30)}','${company}','${historical}','${bank}','income','paid',50,50,'2026-01-01','2026-08-01',null,null,null),
        ('${id(31)}','${company}','${historical}','${bank}','income','approved',999,0,'2026-09-01',null,null,'${id(16)}',null);
      INSERT INTO transaction_payments VALUES ('${id(21)}','${bank}','2026-11-05',5,10);
      INSERT INTO event_ticket_zones VALUES ('${zone}','${future}');
      INSERT INTO event_ticket_lots VALUES ('${lot}','${zone}',6);
      INSERT INTO ticket_sales VALUES ('${zone}','${lot}','${office}',10,40,400,'2026-11-05');
      INSERT INTO event_ticket_office_assignments VALUES ('${future}','${office}');
      INSERT INTO event_ticket_office_advances VALUES ('${future}','${office}',20,null,null);
    `;
    const rpc = readFileSync("supabase/migrations/20260909195352_eb89ddd4-b732-41fa-8162-3fd51a6b9871.sql", "utf8");
    const salesRpc = readFileSync("supabase/migrations/20260910023941_2dddffc3-cf0d-4e9f-8fe4-844f667b0929.sql", "utf8").split("GRANT")[0];
    // jsdom Blob não dispõe de arrayBuffer; WASM usa o Blob de node, sem fetch.
    vi.stubGlobal("Blob", NodeBlob); vi.stubGlobal("File", NodeFile);
    const db = new PGlite({ fsBundle: new NodeBlob([readFileSync("node_modules/@electric-sql/pglite/dist/pglite.data")]) as unknown as Blob });
    let rows: any[];
    try {
      await db.exec(schema + rpc + salesRpc);
      // Relógio fixo só na fixture; o artefacto usa a data de execução em Lisboa.
      rows = (await db.query(sql.replaceAll(":company_id", "$1").replaceAll("current_timestamp", "TIMESTAMPTZ '2026-11-05 12:00:00+00'"), [company])).rows;
    } finally { await db.close(); }
    const numeric = new Set(["revenue_year_dre_transactions", "rpc_realized", "partially_paid_n", "partially_paid_unpaid", "partial_missing_from_rpc", "rpc_committed", "approved_n", "approved_unpaid", "pending_n", "pending_unpaid", "rpc_pending"]);
    rows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, numeric.has(key) ? Number(value) : value])));
    const byId = (value: string | null) => rows.find((row) => row.id === value);
    expect(rows).toHaveLength(7);
    expect(byId(historical)).toMatchObject({ stage: "historico", included: false, revenue_year_dre_transactions: 10250, rpc_realized: 10000 });
    expect(byId(partial)).toMatchObject({ partially_paid_n: 1, partially_paid_unpaid: 60, partial_missing_from_rpc: -60, rpc_committed: 0, rpc_realized: -25 });
    expect(byId(partial).cash_payment_adjustments[0]).toMatchObject({ account_id: bank, account_name: "Banco", withholding_amount: 5, credit_amount: 10, liquid: true, after_initial_balance: true });
    expect(byId(committed)).toMatchObject({ approved_n: 1, approved_unpaid: 60, pending_n: 1, pending_unpaid: 30, rpc_committed: -60, rpc_pending: -30 });
    expect(byId(child)).toMatchObject({ master_id: future, stage: "planeamento", business_line: "Espetáculos", included: true });
    expect(byId(future).ticket_offices[0]).toMatchObject({ assigned: true, sales_gross: 400, movements: -100, advances: 20, retained_by_event: 280, canonical_account_balance: 280 });
    expect(Number(byId(future).revenue_year_ticket_sales)).toBeCloseTo(400 / 1.06, 6);
    expect(byId(null).rpc_realized).toBe(-20);
    expect(Number(byId(future).liquid_difference)).toBe(0);
    expect(byId(future).cash_reconciliation).toMatchObject({ opening_liquid: 1000, realized_all: 9960, realized_in_bridge: -25, realized_excluded: 10005, realized_common: -20 });
    expect(byId(future).cash_reconciliation.cutoffs[0].first_statement_from).toBe("2026-08-31");
    expect(byId(future).retained_reconciliation[0]).toMatchObject({ canonical_balance: 280, attributed_to_events: 280, residual: 0 });
  }, 45000);
});
