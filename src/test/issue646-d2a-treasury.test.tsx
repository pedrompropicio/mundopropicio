import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import Treasury from "@/pages/Treasury";
import { createTreasuryQueue, loadTreasuryEvent, loadTreasuryRetained, useTreasuryBridge } from "@/hooks/useTreasuryBridge";
import { partnerDirection } from "@shared/financial-position/assemble.ts";

const f = vi.hoisted(() => ({
  allowed: true, companyId: "company-a", userId: "user-a", companyError: false,
  tables: {} as Record<string, any[]>, requests: [] as { table: string; filters: [string, unknown][]; range?: number[] }[],
  rpc: vi.fn(), from: vi.fn(), bundle: vi.fn(), engine: vi.fn(), partner: vi.fn(),
  branding: vi.fn(), save: vi.fn(), text: vi.fn(), image: vi.fn(), table: vi.fn(), doc: {} as Record<string, any>,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: f.userId }, loading: false, permissions: f.allowed ? ["view_financial_position"] : [],
  hasPermission: (permission: string) => f.allowed && permission === "view_financial_position",
}) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({
  companyId: f.companyId, company: { country: "PT", currency: "EUR" }, isLoading: false, isError: f.companyError,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: f.from, rpc: f.rpc } }));
vi.mock("@shared/settlement/statement-service.ts", () => ({
  loadStatementBundle: f.bundle, computeStatementEngine: f.engine, buildPartnerStatement: f.partner,
}));
vi.mock("@/lib/export-header", async (original) => ({ ...await original<object>(), fetchExportBranding: f.branding }));
vi.mock("jspdf", () => ({ default: vi.fn(function () { return f.doc; }) }));
vi.mock("jspdf-autotable", () => ({ default: f.table }));

const snapshot = { version: 1, nodes: [], eventNetResult: 1000, basis: { expenseSource: "committed", includeOverhead: true } };
const clients: QueryClient[] = [];
function provider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  return { client, Wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><span data-testid="url">{location.search}</span><button onClick={() => navigate(-1)}>Voltar no histórico</button></>;
}
function openPage(initial = "/erp/tesouraria") {
  const { Wrapper } = provider();
  return render(<Wrapper><MemoryRouter initialEntries={[initial]}><Treasury /><Location /></MemoryRouter></Wrapper>);
}
const companyTable = () => screen.getByRole("table", { name: "Ponte — Empresa" });
const rowCells = (name: string, table = companyTable()) => within(within(table).getByRole("row", { name: new RegExp(name) })).getAllByRole("cell").map((cell) => cell.textContent);

/** Mock PostgREST com filtros e paginação reais; qualquer escrita ou RPC não prevista falha. */
function query(table: string) {
  let rows = f.tables[table];
  if (!rows) throw new Error(`Tabela inesperada: ${table}`);
  const request: (typeof f.requests)[number] = { table, filters: [] };
  f.requests.push(request);
  const builder: any = {
    select: () => builder,
    eq: (key: string, value: unknown) => { request.filters.push([key, value]); rows = rows.filter((row) => row[key] === value); return builder; },
    in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return builder; },
    is: (key: string, value: unknown) => { rows = rows.filter((row) => (row[key] ?? null) === value); return builder; },
    order: () => builder,
    range: (from: number, to: number) => { request.range = [from, to]; return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); },
    limit: (limit: number) => Promise.resolve({ data: rows.slice(0, limit), error: null }),
  };
  return builder;
}
beforeEach(() => {
  vi.clearAllMocks();
  f.allowed = true; f.companyId = "company-a"; f.userId = "user-a"; f.companyError = false; f.requests = [];
  f.tables = {
    events: [
      { id: "master", company_id: "company-a", name: "Master de prova", parent_event_id: null, business_line_id: "shows" },
      { id: "sub", company_id: "company-a", name: "Cidade de prova", parent_event_id: "master", business_line_id: "wrong" },
      { id: "old", company_id: "company-a", name: "Histórico", parent_event_id: null },
      { id: "cancelled", company_id: "company-a", name: "Cancelado", parent_event_id: null },
    ],
    business_lines: [{ id: "shows", company_id: "company-a", name: "Espetáculos", sort_order: 1, is_active: true }],
    event_settlements: [{ id: "seal", event_id: "master", parent_id: null, is_sealed: true, sealed_snapshot: snapshot }],
    financial_accounts: [{ id: "office", company_id: "company-a", type: "ticket_office" }],
    event_ticket_office_assignments: [{ id: "assignment", financial_account_id: "office", event_id: "sub" }],
    transactions: [
      { id: "contract-paid", company_id: "company-a", account_id: "bank", paid_amount: 40, reversed_at: null },
      { id: "office-paid", company_id: "company-a", account_id: "office", event_id: "sub", type: "expense", status: "paid", paid_amount: 200, reversed_at: null, is_hidden: false },
    ],
    event_ticket_office_advances: [{ id: "advance", financial_account_id: "office", event_id: "sub", amount: 50, transaction_id: null, settlement_id: null }],
    partner_payment_contracts: [{ id: "contract", company_id: "company-a", event_id: "master", beneficiary_supplier_id: "partner", balance_tx_id: "contract-paid", cancelled_at: null }],
  };
  f.from.mockImplementation(query);
  f.rpc.mockImplementation(async (name, args) => {
    if (name === "event_stage_list") return { data: [{ event_id: "master", stage: "fechado" }, { event_id: "old", stage: "historico" }, { event_id: "cancelled", stage: "cancelado" }], error: null };
    if (name === "event_budget_mode") return { data: "with_bp", error: null };
    if (name === "ticket_office_balances") return { data: [{ account_id: "office", balance: 750 }], error: null };
    if (name === "get_ticket_office_sales") return { data: [{ event_id: "sub", quantity: 100, revenue: 1000 }], error: null };
    if (name === "get_event_cash_position" && args.p_company_id !== "company-a") return { data: [], error: null };
    if (name === "get_event_cash_position") return { data: [
      { level: "event", event_id: "master", master_event_id: "master", committed: -20, realized: args.p_date_from || args.p_date_to ? 20 : 100, pending: -5 },
      { level: "event", event_id: "sub", master_event_id: "master", committed: -30, realized: -40, pending: -10 },
      { level: "common", event_id: null, master_event_id: null, committed: -500, realized: -700, pending: -100 },
    ], error: null };
    throw new Error(`RPC inesperada: ${name}`);
  });
  f.bundle.mockResolvedValue({ eventId: "master", eventName: "Master de prova", basis: { expenseSource: "committed", includeOverhead: true }, participants: [
    { isHouse: true, mode: "settles", percentage: 50, supplier_id: "house" },
    { isHouse: false, mode: "settles", percentage: 25, supplier_id: "partner", name: "Sócio" },
    { isHouse: false, mode: "nominal", percentage: 25, supplier_id: "nominal" },
  ] });
  f.engine.mockReturnValue({ eventNetResult: 777, errors: [], c1: { ok: true }, c2: { ok: true } });
  f.partner.mockReturnValue({ block: { account: { transferBase: 200, transferTotal: 200 } } });
  f.branding.mockResolvedValue({ displayName: "Marca de prova", logoDataUrl: "data:image/png;base64,cHJvdmE=" });
  f.doc = { save: f.save, text: f.text, addImage: f.image, setFontSize: vi.fn(), setFont: vi.fn(), setTextColor: vi.fn(), addPage: vi.fn(),
    splitTextToSize: (text: string) => [text], lastAutoTable: { finalY: 80 } };
  f.table.mockImplementation(() => { f.doc.lastAutoTable = { finalY: 80 }; });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#646: rede proibida nos testes"); }));
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

describe("#646 critérios 2 e 3 — leituras canónicas", () => {
  const client = { from: f.from, rpc: f.rpc };
  it("fechado lê o snapshot sem chamar o mock do motor; linha 5 continua ao vivo e deduz contratos pagos", async () => {
    expect(await loadTreasuryEvent(client, f.companyId, "master", "fechado")).toEqual({ result: 1000, source: "selado", partnersDue: 160, housePct: 50 });
    expect(f.engine).not.toHaveBeenCalled();
    expect(f.partner).toHaveBeenCalledOnce();
    expect(f.partner.mock.calls[0][1]).toBe("partner");
    expect(f.bundle).toHaveBeenCalledOnce();
  });
  it.each([null, { ...snapshot, basis: undefined }])("sem snapshot com basis lê a base corrente marcada", async (raw) => {
    f.tables.event_settlements[0].sealed_snapshot = raw;
    expect(await loadTreasuryEvent(client, f.companyId, "master", "fechado")).toMatchObject({ result: 777, source: "base corrente" });
    expect(f.engine).toHaveBeenCalledOnce();
  });
  it("sem BP passa realizado ao motor e ao documento sem criar outra fórmula", async () => {
    const implementation = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation((name, args) => name === "event_budget_mode" ? Promise.resolve({ data: "without_bp", error: null }) : implementation(name, args));
    await loadTreasuryEvent(client, f.companyId, "master", "em_curso");
    expect(f.engine.mock.calls[0][0].basis.expenseSource).toBe("realized");
    expect(f.partner.mock.calls[0][0].basis.expenseSource).toBe("realized");
  });
  it.each([
    [-20, 200, 0, 0], [0, -20, 0, 0], [200, 246, 40, 206], [100, 100, 150, 0],
  ])("linha 5 segue partnerDirection para base=%s total=%s pago=%s", async (transferBase, transferTotal, paid, expected) => {
    f.partner.mockReturnValue({ block: { account: { transferBase, transferTotal } } });
    f.tables.transactions[0].paid_amount = paid;
    const result = await loadTreasuryEvent(client, f.companyId, "master", "fechado");
    const direction = partnerDirection({ transferBase, transferTotal }, paid);
    expect(result.partnersDue).toBe(direction.sentido === "por_liquidar" ? direction.valor : 0);
    expect(result.partnersDue).toBe(expected);
  });
  it("nunca usa a RPC exclusiva do Portal (asserção de fonte e de chamadas)", async () => {
    const source = readFileSync("src/hooks/useTreasuryBridge.ts", "utf8");
    expect(source).not.toContain("get_partner_settlement_summary");
    expect(source).toContain("partnerDirection(account");
    await loadTreasuryEvent(client, f.companyId, "master", "fechado");
    expect(f.rpc.mock.calls.some(([name]) => name === "get_partner_settlement_summary")).toBe(false);
  });
  it("o retido usa a fórmula partilhada e não soma o caixa da conta bancária", async () => {
    expect(await loadTreasuryRetained(client, f.companyId)).toEqual({ sub: 750 });
    expect(f.rpc).toHaveBeenCalledWith("ticket_office_balances", { _account_ids: ["office"] });
    expect(f.requests.filter((r) => r.table === "transactions").every((r) => !!r.range)).toBe(true);
  });
  it("não contorna um saldo canónico NULL", async () => {
    const implementation = f.rpc.getMockImplementation()!;
    f.rpc.mockImplementation((name, args) => name === "ticket_office_balances" ? Promise.resolve({ data: [{ account_id: "office", balance: null }], error: null }) : implementation(name, args));
    await expect(loadTreasuryRetained(client, f.companyId)).rejects.toThrow("Saldo de bilheteira indisponível");
    expect(f.rpc.mock.calls.some(([name]) => name === "get_ticket_office_sales")).toBe(false);
  });
  it("pagina movimentos de bilheteira para além das 1000 linhas", async () => {
    f.tables.transactions = Array.from({ length: 1001 }, (_, index) => ({ id: `tx-${index}`, company_id: "company-a", account_id: "office", event_id: "sub", type: "expense", status: "paid", paid_amount: 1 }));
    expect(await loadTreasuryRetained(client, f.companyId)).toEqual({ sub: -51 });
    expect(f.requests.find((r) => r.table === "transactions")?.range).toEqual([1000, 1999]);
  });
});

describe("#646 critério 4 — ecrã RTL, URL e PDF", () => {
  it("sem a permissão exata recusa a entrada antes de qualquer leitura", () => {
    f.allowed = false;
    openPage();
    expect(screen.getByRole("heading", { name: "Sem acesso" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tesouraria" })).not.toBeInTheDocument();
    expect(f.rpc).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
  });
  it("regista a rota lazy com o mesmo guard e o menu com o mesmo show da Posição Financeira", () => {
    expect(readFileSync("src/App.tsx", "utf8")).toContain('const Treasury = lazy(() => import("./pages/Treasury"))');
    expect(readFileSync("src/App.tsx", "utf8")).toContain('path="/erp/tesouraria" element={<FinancialPositionAccess><Treasury /></FinancialPositionAccess>}');
    expect(readFileSync("src/components/AppSidebar.tsx", "utf8")).toContain('to: "/erp/tesouraria", icon: Landmark, label: "Tesouraria", show: hasPermission(FINANCIAL_POSITION_PERMISSION)');
  });
  it("apresenta a empresa, as duas colunas e o drill-down linha → Master → sub-evento", async () => {
    openPage();
    await screen.findByRole("table", { name: "Ponte — Empresa" });
    expect(rowCells("6. Disponibilidade real")).toEqual(["-20,00 €", "-35,00 €"]);
    fireEvent.click(screen.getByText("Espetáculos", { selector: "summary span" }));
    expect(screen.getByText("Espetáculos", { selector: "summary span" }).closest("details")).toHaveAttribute("open");
    fireEvent.click(screen.getByText("Master de prova", { selector: "summary span" }));
    expect(screen.getByText("Master de prova", { selector: "summary span" }).closest("details")).toHaveAttribute("open");
    expect(screen.getByText("selado")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cidade de prova", { selector: "summary span" }));
    expect(screen.getByRole("table", { name: "Ponte — Cidade de prova" })).toBeVisible();
    expect(rowCells("4. − Caixa cedido ao pool", screen.getByRole("table", { name: "Ponte — Cidade de prova" }))).toEqual(["40,00 €", "40,00 €"]);
    expect(screen.getByRole("region", { name: "Movimentos comuns" })).toBeInTheDocument();
    expect(f.bundle).toHaveBeenCalledOnce();
    expect(f.bundle.mock.calls[0][1]).toBe("master");
    expect(f.rpc.mock.calls.filter(([name]) => name === "get_event_cash_position")).toHaveLength(1);
  });
  it("período altera só o realized; guarda datas no URL, permite limpeza e regressa a tempo real", async () => {
    openPage();
    await screen.findByRole("table", { name: "Ponte — Empresa" });
    const previous = ["1. Resultado", "2. ± Timing", "3. − Retido", "5. − Sócios"].map((name) => rowCells(name));
    fireEvent.click(screen.getByRole("button", { name: "Período" }));
    fireEvent.change(screen.getByRole("textbox", { name: "De" }), { target: { value: "01/11/2026" } });
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("get_event_cash_position", { p_company_id: "company-a", p_date_from: "2026-11-01", p_date_to: null }));
    await waitFor(() => expect(rowCells("4. − Caixa cedido ao pool")).toEqual(["20,00 €", "20,00 €"]));
    expect(["1. Resultado", "2. ± Timing", "3. − Retido", "5. − Sócios"].map((name) => rowCells(name))).toEqual(previous);
    expect(screen.getByTestId("url")).toHaveTextContent("de=2026-11-01");
    expect(f.bundle).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole("textbox", { name: "Até" }), { target: { value: "05/11/2026" } });
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("get_event_cash_position", { p_company_id: "company-a", p_date_from: "2026-11-01", p_date_to: "2026-11-05" }));
    fireEvent.click(screen.getByRole("button", { name: "Limpar De" }));
    fireEvent.blur(screen.getByRole("textbox", { name: "De" }));
    expect(screen.getByRole("textbox", { name: "De" })).toHaveValue("");
    expect(screen.getByTestId("url").textContent).not.toContain("de=");
    fireEvent.click(screen.getByRole("button", { name: "Tempo real" }));
    expect(screen.getByTestId("url").textContent).toBe("");
    await waitFor(() => expect(rowCells("4. − Caixa cedido ao pool")).toEqual(["-60,00 €", "-60,00 €"]));
  });
  it("restaura os dois limites do URL sem storage e recusa intervalos invertidos", async () => {
    openPage("/erp/tesouraria?de=2026-11-05&ate=2026-11-01");
    expect(screen.getByRole("alert")).toHaveTextContent("data inicial");
    expect(screen.getByRole("textbox", { name: "De" })).toHaveValue("05/11/2026");
    expect(screen.getByRole("textbox", { name: "Até" })).toHaveValue("01/11/2026");
    expect(screen.queryByRole("table", { name: "Ponte — Empresa" })).not.toBeInTheDocument();
    expect(f.rpc.mock.calls.some(([name]) => name === "get_event_cash_position")).toBe(false);
  });
  it("o histórico restaura o toggle e limpar a última data conserva apenas o modo, sem repor o valor", async () => {
    openPage();
    await screen.findByRole("table", { name: "Ponte — Empresa" });
    fireEvent.click(screen.getByRole("button", { name: "Período" }));
    expect(screen.getByTestId("url")).toHaveTextContent("de=");
    fireEvent.change(screen.getByRole("textbox", { name: "De" }), { target: { value: "02/11/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Limpar De" }));
    fireEvent.blur(screen.getByRole("textbox", { name: "De" }));
    expect(screen.getByRole("textbox", { name: "De" })).toHaveValue("");
    await waitFor(() => expect(f.rpc).toHaveBeenCalledWith("get_event_cash_position", { p_company_id: "company-a", p_date_from: null, p_date_to: null }));
    fireEvent.click(screen.getByRole("button", { name: "Tempo real" }));
    expect(screen.queryByRole("textbox", { name: "De" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar no histórico" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Período" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("textbox", { name: "De" })).toHaveValue("");
  });
  it("o botão gera o PDF real do módulo com cabeçalho de marca e a ponte completa", async () => {
    openPage();
    await screen.findByRole("table", { name: "Ponte — Empresa" });
    fireEvent.click(screen.getByRole("button", { name: "Exportar PDF" }));
    await waitFor(() => expect(f.save).toHaveBeenCalledWith(expect.stringMatching(/^tesouraria-.*\.pdf$/)));
    expect(f.branding).toHaveBeenCalledWith("company-a");
    expect(f.image).toHaveBeenCalledWith("data:image/png;base64,cHJvdmE=", "PNG", expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
    expect(f.text.mock.calls.some(([text]) => typeof text === "string" && text.includes("Marca de prova"))).toBe(true);
    const bodies = f.table.mock.calls.flatMap(([, options]) => options.body);
    expect(bodies).toContainEqual(["6. Disponibilidade real", "-20,00 €", "-35,00 €"]);
    expect(f.text.mock.calls.some(([text]) => Array.isArray(text) && text[0].includes("Cidade de prova"))).toBe(true);
    expect(JSON.stringify(f.table.mock.calls)).not.toMatch(/[−—–]/);
  });
  it("uma falha financeira não mostra um total parcial nem permite exportar", async () => {
    f.bundle.mockRejectedValue(new Error("evento indisponível"));
    openPage();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Tesouraria incompleta"));
    expect(screen.queryByRole("table", { name: "Ponte — Empresa" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar PDF" })).toBeDisabled();
  });
  it("mostra progresso enquanto o carregamento por evento está pendente", async () => {
    let finish!: (bundle: unknown) => void;
    const bundle = await f.bundle();
    f.bundle.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    openPage();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("0/1 eventos"));
    await act(async () => finish(bundle));
    await screen.findByRole("table", { name: "Ponte — Empresa" });
  });
});

describe("#646 desempenho e cache", () => {
  it("limita a quatro eventos em paralelo e liberta a fila mesmo em erro", async () => {
    const run = createTreasuryQueue();
    let active = 0; let maximum = 0;
    const finish: (() => void)[] = [];
    const promises = Array.from({ length: 9 }, (_, index) => run(async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => finish.push(resolve));
      active--;
      if (index === 0) throw new Error("falha de prova");
      return index;
    }));
    const completed = Promise.allSettled(promises);
    await waitFor(() => expect(finish).toHaveLength(4));
    finish.splice(0).forEach((resolve) => resolve());
    await waitFor(() => expect(finish).toHaveLength(4));
    finish.splice(0).forEach((resolve) => resolve());
    await waitFor(() => expect(finish).toHaveLength(1));
    finish.splice(0).forEach((resolve) => resolve());
    expect((await completed).filter((r) => r.status === "fulfilled")).toHaveLength(8);
    expect(maximum).toBe(4);
  });
  it("a cache por evento não é reutilizada entre empresas ou utilizadores", async () => {
    const { Wrapper } = provider();
    const { result, rerender } = renderHook(() => useTreasuryBridge({ from: null, to: null }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.bridge).not.toBeNull());
    expect(f.bundle).toHaveBeenCalledOnce();
    f.userId = "user-b";
    rerender();
    await waitFor(() => expect(f.bundle).toHaveBeenCalledTimes(2));
    f.companyId = "company-b";
    rerender();
    expect(result.current.bridge).toBeNull();
    await waitFor(() => expect(result.current.bridge?.company.children).toHaveLength(0));
  });
});
