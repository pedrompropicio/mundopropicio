import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { utils } from "xlsx";
import ReportDRE from "@/components/ReportDRE";
import { useEventTreasuryBridge } from "@/hooks/useEventTreasuryBridge";
import { resolveCompanyLocale } from "@/lib/company-locale";
import { treasuryColumns, TREASURY_NOTES } from "@/lib/treasury-bridge";

const f = vi.hoisted(() => ({
  queries: {} as Record<string, any>, tables: {} as Record<string, any[]>,
  companyId: "company", userId: "user", allowed: true,
  rpc: vi.fn(), from: vi.fn(), bundle: vi.fn(), engine: vi.fn(), partner: vi.fn(), excel: vi.fn(), pdf: vi.fn(),
}));
// Só os dados legados da DRE são fixtures; o hook novo usa React Query real.
vi.mock("@tanstack/react-query", async (original) => {
  const actual = await original<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: (options: any) => options.queryKey[0] === "event-treasury-bridge"
    ? actual.useQuery(options) : { data: f.queries[options.queryKey[0]], isLoading: false } };
});
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: f.userId }, loading: false, hasPermission: () => f.allowed,
  permissions: f.allowed ? ["view_financial_position"] : [],
}) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: f.companyId, isLoading: false, isError: false }) }));
vi.mock("@/hooks/useCompanyLocale", () => ({ useCompanyLocale: () => resolveCompanyLocale({ country: "PT", currency: "EUR" }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: f.rpc, from: f.from } }));
vi.mock("@shared/settlement/statement-service.ts", () => ({
  loadStatementBundle: f.bundle, computeStatementEngine: f.engine, buildPartnerStatement: f.partner,
}));
vi.mock("xlsx", async (original) => ({ ...await original<object>(), writeFile: f.excel }));
vi.mock("@/lib/export-dre", async (original) => ({ ...await original<object>(), exportDREToPDF: f.pdf }));

const event = (id: string, name: string, parent: string | null = null, line = "a") => ({
  id, name, parent_event_id: parent, business_line_id: line, company_id: "company",
  date: "2026-06-15", status: "active", event_nature: "producao_propria",
});
const events = [event("master", "Turnê"), event("c1", "Cidade 1", "master"),
  event("c2", "Cidade 2", "master"), event("solo", "Evento Solo", null, "b")];
const tx = (id: string, eventId: string, type: string, amount: number) => ({
  id, event_id: eventId, company_id: "company", type, amount, paid_amount: amount,
  category_id: type, iva_rate: 0, date: "2026-06-15", status: "approved", version_id: null,
});
const transactions = [tx("im", "master", "income", 200), tx("i1", "c1", "income", 50),
  tx("i2", "c2", "income", 50), tx("is", "solo", "income", 200),
  tx("em", "master", "expense", 60), tx("es", "solo", "expense", 80)];
const lines = [{ id: "a", name: "Espetáculos", is_active: true }, { id: "b", name: "Outros", is_active: true }];
const clients: QueryClient[] = [];
function provider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** PostgREST só de leitura, com filtros e paginação reais; qualquer tabela inesperada falha. */
function query(table: string) {
  if (!f.tables[table]) throw new Error(`Tabela inesperada: ${table}`);
  let rows = f.tables[table];
  const builder: any = {
    select: () => builder, order: () => builder,
    eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return builder; },
    is: (key: string, value: unknown) => { rows = rows.filter((row) => (row[key] ?? null) === value); return builder; },
    range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
  };
  return builder;
}
beforeEach(() => {
  vi.clearAllMocks();
  f.companyId = "company"; f.userId = "user"; f.allowed = true;
  f.queries = { events, transactions, "business-lines": lines,
    "dre-forecasts-expense": transactions.filter((t) => t.type === "expense"),
    "account-categories": [{ id: "income", code: "1.2.01", name: "Receita", type: "income" },
      { id: "expense", code: "2.1.01", name: "Custo", type: "expense" }] };
  f.tables = {
    events, business_lines: lines.map((line) => ({ ...line, company_id: "company" })),
    financial_accounts: [{ id: "office", company_id: "company", type: "ticket_office" }],
    event_ticket_office_assignments: [{ financial_account_id: "office", event_id: "c1" }],
    event_ticket_office_advances: [], partner_payment_contracts: [], transactions: [],
  };
  f.from.mockImplementation(query);
  f.rpc.mockImplementation(async (name, args) => {
    if (name === "event_stage_list") return { data: f.tables.events.map((e) => ({ event_id: e.id, stage: "em_curso" })), error: null };
    if (name === "event_budget_mode") return { data: "with_bp", error: null };
    if (name === "ticket_office_balances") return { data: [{ account_id: "office", balance: 75 }], error: null };
    if (name === "get_ticket_office_sales") return { data: [{ event_id: "c1", quantity: 10, revenue: 75 }], error: null };
    if (name === "get_event_cash_position") return { data: f.tables.events.filter((e) => e.company_id === args.p_company_id).map((e, i) => ({
      level: "event", event_id: e.id, master_event_id: e.parent_event_id ?? e.id,
      committed: -10 * (i + 1), realized: 20 * (i + 1), pending: -5 * (i + 1),
    })), error: null };
    throw new Error(`RPC inesperada: ${name}`);
  });
  f.bundle.mockImplementation(async (_client, id) => ({ eventId: id, eventName: id,
    basis: { expenseSource: "committed", includeOverhead: true },
    participants: [{ isHouse: true, mode: "settles", percentage: 75 },
      { isHouse: false, mode: "settles", percentage: 25, supplier_id: "partner", name: "Sócio" }],
  }));
  f.engine.mockReturnValue({ eventNetResult: 777, errors: [], c1: { ok: true }, c2: { ok: true } });
  f.partner.mockReturnValue({ block: { account: { transferBase: 50, transferTotal: 50 } } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#646 D2b: rede proibida"); }));
});
afterEach(() => {
  cleanup(); clients.forEach((client) => client.clear()); clients.length = 0;
  expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals();
});
const toggle = () => screen.getByRole("switch", { name: "Onde está o dinheiro" });
function dreText(container: HTMLElement) {
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('section[aria-label="Onde está o dinheiro"], aside').forEach((node) => node.remove());
  return copy.textContent;
}
function selectEvent(name: string) {
  fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(name) }));
}

describe("#646 D2b — critérios 1 e 2: DRE e exportação invariantes", () => {
  it.each(["bp", "transactions"])("%s: totais, cards, eventSummaries renderizados e Excel permanecem iguais", async (source) => {
    const { container, unmount } = render(<ReportDRE />, { wrapper: provider() });
    if (source === "transactions") fireEvent.click(screen.getByRole("radio", { name: /Transações \(comparação\)/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Cidade 1 / }));
    expect(screen.getByText("Total Receitas").nextElementSibling).toHaveTextContent("500,00");
    expect(screen.getByText("Total Despesas").nextElementSibling).toHaveTextContent("140,00");
    expect(screen.getByRole("button", { name: /^Cidade 1 / })).toHaveTextContent("150,00");
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    const before = dreText(container);
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    const workbook = JSON.stringify(f.excel.mock.calls[0]);
    const pdfArgs = JSON.stringify(f.pdf.mock.calls[0]);
    const summary = utils.sheet_to_json<any[]>(f.excel.mock.calls[0][0].Sheets.Resumo, { header: 1 });
    expect(summary.find((row) => row[0] === "TOTAL")).toEqual(["TOTAL", "", 500, 0, 500, 140, 0, 140, 360, 360]);
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
    expect(f.bundle).not.toHaveBeenCalled(); expect(f.engine).not.toHaveBeenCalled();
    fireEvent.click(toggle());
    await screen.findByRole("table", { name: "Ponte — Turnê" });
    expect(dreText(container)).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect(JSON.stringify(f.excel.mock.calls[1])).toBe(workbook);
    expect(JSON.stringify(f.pdf.mock.calls[1])).toBe(pdfArgs);
    fireEvent.click(toggle());
    expect(dreText(container)).toBe(before);
    expect(screen.queryByRole("table", { name: /^Ponte/ })).not.toBeInTheDocument();
    unmount();
    render(<ReportDRE />, { wrapper: provider() });
    expect(toggle()).toHaveAttribute("aria-checked", "false");
  });
});

describe("#646 D2b — critério 3: ponte canónica e seleção", () => {
  it("Master inclui subs, duas colunas, notas, link e soma das linhas 1–5 = 6", async () => {
    render(<ReportDRE />, { wrapper: provider() });
    selectEvent("Turnê");
    fireEvent.click(toggle());
    const table = await screen.findByRole("table", { name: "Ponte — Turnê" });
    expect(screen.getAllByRole("table", { name: /^Ponte/ })).toHaveLength(3);
    expect(screen.getByRole("table", { name: "Ponte — Cidade 1" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Ponte — Cidade 2" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Ponte — Evento Solo" })).not.toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Sem pendentes" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Com pendentes" })).toBeInTheDocument();
    const expected = treasuryColumns({ result: 777, committed: -60, retained: 75, realized: 120, partnersDue: 50, pending: -30 });
    const rows = within(table).getAllByRole("row").slice(1, 7).map((row) => within(row).getAllByRole("cell").map((cell) =>
      Number(cell.textContent!.replace(/[^\d,-]/g, "").replace(",", "."))));
    expect(rows.map((r) => r[0])).toEqual(expected.withoutPending);
    expect(rows.map((r) => r[1])).toEqual(expected.withPending);
    for (const column of [0, 1]) expect(rows.slice(0, 5).reduce((sum, row) => sum + row[column], 0)).toBe(rows[5][column]);
    expect(screen.getByRole("link", { name: "Ver Tesouraria" })).toHaveAttribute("href", "/erp/tesouraria");
    TREASURY_NOTES.forEach((note) => expect(screen.getByText(note)).toBeInTheDocument());
    expect(f.bundle.mock.calls.map((call) => call[1])).toEqual(["master"]);
    expect(f.rpc).toHaveBeenCalledWith("get_event_cash_position", { p_company_id: "company", p_date_from: null, p_date_to: null });
    expect(f.rpc).toHaveBeenCalledWith("ticket_office_balances", { _account_ids: ["office"] });
  });
  it("seleção de um sub-evento não carrega outro Master; filtro de linha restringe as pontes", async () => {
    render(<ReportDRE />, { wrapper: provider() });
    selectEvent("Cidade 1"); fireEvent.click(toggle());
    await screen.findByRole("table", { name: "Ponte — Cidade 1" });
    expect(screen.getAllByRole("table", { name: /^Ponte/ })).toHaveLength(1);
    expect(f.bundle.mock.calls.map((call) => call[1])).toEqual(["master"]);
    fireEvent.click(toggle());
    selectEvent("Cidade 1");
    fireEvent.click(screen.getByRole("button", { name: /^Linha de negócio:/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Outros" }));
    fireEvent.click(screen.getByRole("button", { name: /^Linha de negócio:/ }));
    fireEvent.click(toggle());
    await screen.findByRole("table", { name: "Ponte — Turnê" });
    expect(screen.queryByRole("table", { name: "Ponte — Evento Solo" })).not.toBeInTheDocument();
  });
  it("falha de saldo canónico não mostra zeros nem altera a DRE; desligar remove o erro", async () => {
    const implementation = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation((name, args) => name === "ticket_office_balances"
      ? Promise.resolve({ data: [{ account_id: "office", balance: null }], error: null }) : implementation(name, args));
    const { container } = render(<ReportDRE />, { wrapper: provider() });
    const before = dreText(container); fireEvent.click(toggle());
    await screen.findAllByRole("alert");
    expect(screen.queryByRole("table", { name: /^Ponte/ })).not.toBeInTheDocument();
    expect(dreText(container)).toBe(before);
    fireEvent.click(toggle()); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("não lê sem permissão e não reutiliza a ponte após troca de empresa ou utilizador", async () => {
    f.allowed = false;
    const { result, rerender } = renderHook(() => useEventTreasuryBridge(["solo"], true), { wrapper: provider() });
    expect(result.current.error).toBeTruthy(); expect(f.rpc).not.toHaveBeenCalled();
    f.allowed = true; rerender();
    await waitFor(() => expect(result.current.nodes?.solo).toBeDefined());
    f.userId = "outro"; rerender();
    expect(result.current.nodes).toBeUndefined();
    await waitFor(() => expect(result.current.nodes?.solo).toBeDefined());
    f.companyId = "outra"; rerender();
    expect(result.current.nodes).toBeUndefined();
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.nodes).toBeUndefined();
  });
  it("fila D2-a-r limita a quatro motores em paralelo", async () => {
    f.tables.events = Array.from({ length: 9 }, (_, i) => event(`e${i}`, `Evento ${i}`));
    f.tables.financial_accounts = [];
    const release: (() => void)[] = [];
    let active = 0, peak = 0;
    const implementation = f.bundle.getMockImplementation()!;
    f.bundle.mockImplementation(async (...args) => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>((resolve) => release.push(resolve)); active--;
      return implementation(...args);
    });
    const { result } = renderHook(() => useEventTreasuryBridge(f.tables.events.map((e) => e.id), true), { wrapper: provider() });
    await waitFor(() => expect(f.bundle).toHaveBeenCalledTimes(4));
    await act(async () => { release.splice(0).forEach((resolve) => resolve()); });
    await waitFor(() => expect(f.bundle).toHaveBeenCalledTimes(8));
    await act(async () => { release.splice(0).forEach((resolve) => resolve()); });
    await waitFor(() => expect(f.bundle).toHaveBeenCalledTimes(9));
    await act(async () => { release.splice(0).forEach((resolve) => resolve()); });
    await waitFor(() => expect(Object.keys(result.current.nodes ?? {})).toHaveLength(9));
    expect(peak).toBe(4);
  });
});
