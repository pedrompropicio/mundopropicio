import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const scope = vi.hoisted(() => ({
  read: {} as any, role: "admin", rpc: vi.fn(), refetch: vi.fn(), tables: {} as Record<string, any[]>, calls: [] as any[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-a" }, role: scope.role,
  isAdmin: ["admin", "platform_admin"].includes(scope.role), isManager: scope.role === "manager", hasPermission: () => true }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ companyId: "company-a", company: {
  id: "company-a", timezone: "Europe/Lisbon", country: "PT", currency: "EUR",
} }), getCurrentCompanyId: async () => "company-a" }));
vi.mock("@/hooks/useTicketOfficeStatements", () => ({ useTicketOfficeStatements: () => ({ data: scope.read, refetch: scope.refetch }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...args: any[]) => scope.rpc(...args),
  from: (table: string) => {
    const call = { table, filters: [] as any[], range: null as number[] | null }; scope.calls.push(call);
    const q: any = {
      select: () => q, eq: (k: string, v: unknown) => { call.filters.push([k, v]); return q; },
      in: (k: string, v: unknown[]) => { call.filters.push([k, v]); return q; },
      order: () => q, range: (a: number, b: number) => { call.range = [a, b]; return q; },
      then: (resolve: any, reject: any) => {
        let rows = (scope.tables[table] ?? []).filter((row) => call.filters.every(([k, v]) => Array.isArray(v) ? v.includes(row[k]) : row[k] === v));
        if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      },
    }; return q;
  },
} }));
vi.mock("@/components/HelpTooltip", () => ({ default: () => null }));
vi.mock("@/components/TicketOfficePositionCards", () => ({ TicketOfficePositionCards: () => null }));
vi.mock("@/components/TicketOfficeAdvancesPanel", () => ({ TicketOfficeAdvancesPanel: () => null }));
vi.mock("@/components/TicketOfficeEventsList", () => ({ TicketOfficeEventsList: () => null }));
vi.mock("@/components/TicketOfficeTicketingTab", () => ({ TicketOfficeTicketingTab: () => null }));
vi.mock("@/components/TicketOfficeBalancePanel", () => ({ TicketOfficeBalancePanel: () => null }));
vi.mock("@/components/TicketOfficeSettlementsPanel", () => ({ TicketOfficeSettlementsPanel: () => <button>Novo fecho legado</button> }));
vi.mock("@/components/TicketOfficeFormModal", () => ({ TicketOfficeFormModal: () => null }));
vi.mock("@/components/TicketUploadModals", () => ({ TicketImportModal: () => null }));
vi.mock("@/components/FeverImportModal", () => ({ FeverImportModal: () => null }));

import { TicketOfficeStatementsPanel } from "@/components/TicketOfficeStatementsPanel";
import { TicketOfficeSettlementsOverview } from "@/components/TicketOfficeSettlementsOverview";
import { statementDraftLabels as labels } from "@/components/TicketOfficeStatementModal";
import TicketOffices from "@/pages/TicketOffices";

const H = "a".repeat(64), AT = "2030-02-01T12:34:56.123+00:00";
const initialViewport = { width: window.innerWidth, height: window.innerHeight, scroll: Element.prototype.scrollIntoView };
function line(patch: Record<string, any> = {}) {
  return { id: "line-a", statement_id: "draft-a", company_id: "company-a", line_type: "event_right", document_line_type: "event_sales",
    event_id: "event-a", position: 0, description: "Quota sintética", amount: "90.00", pending_document: false,
    source_sha256: H, document_page: 1, document_line_ref: "L1", event_gross_amount: "100.00", event_retained_amount: "10.00",
    declared_event_net: "90.00", ...patch };
}
function draft(patch: Record<string, any> = {}) {
  return { id: "draft-a", company_id: "company-a", financial_account_id: "account-a", number: "SYN-2", statement_date: "2030-02-01",
    document_total: "90.00", status: "draft", contract_version: 2, revision: 4, confirmation_receipt: null as any,
    primary_document_id: "pdf-a", primary_document_sha256: H, predecessor_statement_id: null,
    ticket_office_statement_lines: [line({ statement_id: patch.id ?? "draft-a" })],
    provenance: { opening: null, adjustments: [] }, ...patch };
}
function receipt(statement = scope.read.draftStatements[0]) {
  const opening = statement.ticket_office_statement_lines.find((l: any) => l.document_line_type === "opening_balance");
  return { contract_version: 2, statement_id: statement.id, revision: statement.revision,
    calculated_total: statement.document_total, independent_position: statement.document_total, sources: [{ kind: "synthetic" }],
    confirmed_by: "server-admin", confirmed_at: AT, opening_approved: !!opening,
    opening: opening ? { line_id: opening.id, amount: opening.amount, note: opening.opening_note,
      prepared_by: "server-preparer", prepared_at: AT, approved_by: "server-admin", approved_at: AT } : null,
    position_proof: { validator: "issue303-r4-v1", contract_version: 2, statement_id: statement.id, revision: statement.revision,
      independent_position: statement.document_total, position_cutoff_at: AT, position_timezone: "Europe/Lisbon",
      position_cutoff_source: "company_day_end", primary_document_sha256: H, sources: [{ kind: "synthetic" }] },
    lines: structuredClone(statement.ticket_office_statement_lines), documents: [{ document_id: "pdf-a", sha256: H }] };
}
function setDraft(statement = draft()) {
  scope.read.draftStatements = [statement];
  scope.tables.ticket_office_statements = [statement]; scope.tables.ticket_office_statement_lines = statement.ticket_office_statement_lines;
  scope.tables.ticket_office_statement_documents = [{ id: "pdf-a", statement_id: statement.id, company_id: "company-a", file_name: "synthetic.pdf",
    file_path: `company-a/statements/${statement.id}/synthetic.pdf`, document_source: "apuramento", mime_type: "application/pdf",
    created_at: AT, verified_file_id: "verified-a", verified_sha256: H }];
}
const clients: QueryClient[] = [];
function mount(ui = <TicketOfficeStatementsPanel officeId="account-a" />, route = "/bilheteiras") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter></QueryClientProvider>);
}
const confirms = () => scope.rpc.mock.calls.filter(([name]) => name === "confirm_ticket_office_statement");
async function review() {
  fireEvent.click(await screen.findByRole("button", { name: labels.review }));
  await waitFor(() => expect(screen.queryByText(labels.loadingProof)).toBeNull());
  return screen.getByRole("dialog");
}
async function approve() {
  fireEvent.click(screen.getByRole("button", { name: labels.confirm }));
  const prompt = screen.getByRole("alertdialog");
  fireEvent.click(within(prompt).getByRole("button", { name: labels.confirm }));
}
beforeEach(() => {
  Object.defineProperty(crypto, "randomUUID", { value: randomUUID, configurable: true });
  scope.role = "admin"; scope.calls = []; scope.tables = {};
  scope.read = { status: "v2", statements: [], confirmedStatements: [], draftStatements: [], legacyStatements: [],
    provenance: { eventMemberships: [] } };
  scope.rpc.mockReset(); scope.refetch.mockReset(); scope.refetch.mockResolvedValue({});
  setDraft();
  scope.tables.financial_accounts = [{ id: "account-a", name: "Conta sintética", type: "ticket_office", is_active: true }];
  scope.rpc.mockImplementation(async (name) => {
    if (name === "confirm_ticket_office_statement") return { data: receipt(), error: null };
    return { data: [], error: null };
  });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("#303: rede proibida nos testes sintéticos"); }));
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach((c) => c.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals();
  Object.defineProperty(window, "innerWidth", { value: initialViewport.width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: initialViewport.height, configurable: true });
  if (initialViewport.scroll) Element.prototype.scrollIntoView = initialViewport.scroll;
  else delete Element.prototype.scrollIntoView;
});

describe("#303 R7 — conferir e confirmar", () => {
  it.each([["90.01", "1"], ["89.99", "-1"]])("bloqueia uma diferença de um cêntimo (%s)", async (total, diff) => {
    setDraft(draft({ document_total: total })); mount(); const dialog = await review();
    expect(within(dialog).getByRole("status")).toHaveTextContent(diff);
    expect(within(dialog).getByRole("button", { name: labels.confirm })).toBeDisabled(); expect(confirms()).toHaveLength(0);
  });
  it("concilia decimais sem ponto flutuante e só confirma após o diálogo explícito", async () => {
    const statement = draft({ document_total: "0.30", ticket_office_statement_lines: [line({ amount: "0.10" }), line({ id: "line-b", amount: "0.20", position: 1 })] });
    setDraft(statement); const browserConfirm = vi.spyOn(window, "confirm"); mount(); await review();
    expect(screen.getByRole("status")).toHaveTextContent("0"); expect(confirms()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: labels.confirm }));
    expect(confirms()).toHaveLength(0); expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: labels.confirm }));
    const result = await screen.findByRole("region", { name: labels.receipt });
    expect(result).toHaveTextContent("SYN-2"); expect(result).toHaveTextContent("4");
    expect(result).toHaveTextContent("0,30"); expect(result).toHaveTextContent("server-admin");
    expect(result.querySelector("time")).toHaveAttribute("datetime", AT); expect(result.querySelector("time")).toHaveTextContent(AT);
    expect(confirms()).toEqual([["confirm_ticket_office_statement", { p_statement_id: "draft-a", p_expected_revision: 4, p_approve_opening: false }]]);
    expect(scope.refetch).toHaveBeenCalled(); expect(browserConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: labels.confirm })).toBeNull();
  });
  it("admin aprova explicitamente a abertura e vê o transporte negativo devolvido", async () => {
    setDraft(draft({ document_total: "-40.00", ticket_office_statement_lines: [line({ document_line_type: "opening_balance", line_type: "carry_over",
      amount: "-40.00", event_id: null, opening_note: "Base sintética aprovada", opening_created_by: "preparer-a", opening_created_at: AT })] }));
    mount(); await review(); fireEvent.click(screen.getByRole("button", { name: labels.confirm }));
    const prompt = screen.getByRole("alertdialog"); expect(within(prompt).getByRole("button", { name: labels.confirm })).toBeDisabled();
    expect(confirms()).toHaveLength(0); fireEvent.click(screen.getByRole("checkbox", { name: labels.approveOpening }));
    fireEvent.click(within(prompt).getByRole("button", { name: labels.confirm }));
    const result = await screen.findByRole("region", { name: labels.receipt });
    expect(result).toHaveTextContent("-40,00"); expect(result).toHaveTextContent(labels.openingApproved);
    expect(confirms()[0][1].p_approve_opening).toBe(true);
  });
  it.each(["manager", "platform_admin"])("%s vê a abertura e não recebe botão de confirmação", async (role) => {
    scope.role = role; setDraft(draft({ provenance: { opening: { approval: null }, adjustments: [] } })); mount();
    expect(await screen.findByText(labels.openingPending)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: labels.review })).toBeNull();
    expect(screen.queryByRole("button", { name: labels.confirm })).toBeNull(); expect(confirms()).toHaveLength(0);
  });
  it.each([
    [{ code: "40001", message: "issue303_revision_conflict" }, labels.confirmConflict],
    [{ code: "42501", message: "issue303_admin_required" }, labels.refused],
    [{ code: "23505", message: "issue303_event_already_confirmed" }, labels.refused],
  ])("recusa ou conflito recarrega e exige nova conferência (%j)", async (error, message) => {
    scope.rpc.mockResolvedValue({ data: null, error }); mount(); await review(); await approve();
    expect(await screen.findByRole("alert")).toHaveTextContent(message); expect(scope.refetch).toHaveBeenCalled();
    expect(confirms()).toHaveLength(1); expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("region", { name: labels.receipt })).toBeNull();
  });
  it.each([
    { confirmed_at: null }, { revision: 5 }, { statement_id: "other" }, { independent_position: "89.99" }, { opening_approved: true },
    { documents: [] }, { lines: [] }, { position_proof: null },
  ])("não inventa nem aceita campos de recibo inválidos %j", async (patch) => {
    scope.rpc.mockResolvedValue({ data: { ...receipt(), ...patch }, error: null }); mount(); await review(); await approve();
    expect(await screen.findByRole("alert")).toHaveTextContent(labels.invalidReceipt);
    expect(screen.queryByRole("region", { name: labels.receipt })).toBeNull(); expect(scope.refetch).toHaveBeenCalled(); expect(confirms()).toHaveLength(1);
  });
  it.each([{ pending_document: true }, { amount: null }, { source_sha256: null }, { document_page: null }])("provas ou valores incompletos bloqueiam (%j)", async (patch) => {
    setDraft(draft({ ticket_office_statement_lines: [line(patch)] })); mount(); await review();
    expect(screen.getByRole("button", { name: labels.confirm })).toBeDisabled(); expect(confirms()).toHaveLength(0);
  });
  it("refetch não troca a revisão ligada ao documento que está a ser conferido", async () => {
    const originalReceipt = receipt();
    scope.rpc.mockResolvedValue({ data: originalReceipt, error: null });
    const view = mount(); await review(); scope.read = { ...scope.read, draftStatements: [draft({ revision: 5, number: "REMOTE" })] };
    view.rerender(<QueryClientProvider client={clients[0]}><MemoryRouter><TicketOfficeStatementsPanel officeId="account-a" /></MemoryRouter></QueryClientProvider>);
    await approve(); await screen.findByRole("region", { name: labels.receipt });
    expect(confirms()[0][1].p_expected_revision).toBe(4);
  });
  it("cliques repetidos enquanto a RPC está pendente não repetem a confirmação", async () => {
    let complete: (value: unknown) => void = () => {};
    scope.rpc.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    mount(); await review(); await approve();
    expect(confirms()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: labels.confirming })); expect(confirms()).toHaveLength(1);
    complete({ data: receipt(), error: null }); await screen.findByRole("region", { name: labels.receipt });
  });
  it("a falta do PDF verificado bloqueia a confirmação sem criar verificação local", async () => {
    scope.tables.ticket_office_statement_documents = []; mount(); await review();
    expect(screen.getByRole("button", { name: labels.confirm })).toBeDisabled();
    expect(screen.getByText(labels.pendingProof)).toBeInTheDocument(); expect(confirms()).toHaveLength(0);
  });
  it("confirmado só mostra recibo; não há edição nem voltar a rascunho", async () => {
    const statement = draft(); statement.status = "confirmed"; statement.confirmation_receipt = receipt(statement);
    scope.read.confirmedStatements = [statement]; scope.read.draftStatements = []; mount();
    expect(await screen.findByRole("region", { name: labels.receipt })).toHaveTextContent("SYN-2");
    expect(screen.queryByRole("button", { name: /rascunho|confirmar|estornar/i })).toBeNull();
  });
  it("acerto referencia documento e linha originais sem oferecer edição do original", async () => {
    const original = draft({ id: "original", number: "SYN-ORIGINAL", status: "confirmed" }); original.confirmation_receipt = receipt(original);
    const correction = draft({ id: "correction", number: "SYN-ACERTO", provenance: { opening: null, adjustments: [{ lineId: "adjustment",
      originalStatementId: "original", originalLineId: "line-original", reason: "Fatura tardia sintética" }] } });
    scope.read.confirmedStatements = [original]; setDraft(correction); mount();
    const link = await screen.findByRole("link", { name: "SYN-ORIGINAL" });
    expect(link).toHaveAttribute("href", "/bilheteiras?conta=account-a&separador=apuramentos#apuramento-original");
    expect(link.parentElement).toHaveTextContent("line-original"); expect(link.parentElement).toHaveTextContent("Fatura tardia sintética");
    expect(within(document.getElementById("apuramento-original")!).queryByRole("button", { name: /editar/i })).toBeNull();
  });
});

describe("#303 R7 — pertença e navegação", () => {
  it.each([undefined, "event-a"])("mostra a pertença canónica sem qualquer fecho legado (%s)", async (eventId) => {
    const statement = draft({ status: "confirmed" }); statement.confirmation_receipt = receipt(statement);
    scope.read.confirmedStatements = [statement]; scope.read.draftStatements = [];
    const membership = { event_id: "event-a", statement_id: statement.id, financial_account_id: "account-a", company_id: "company-a",
      events: { name: "Evento sem fecho legado" }, financial_accounts: { name: "Conta sintética" } };
    scope.read.provenance.eventMemberships = [membership]; scope.tables.ticket_office_statement_events = [membership];
    mount(<TicketOfficeSettlementsOverview eventId={eventId} />);
    expect(await screen.findByRole("link", { name: "ver apuramento" })).toHaveAttribute("href", "/bilheteiras?conta=account-a&separador=apuramentos#apuramento-draft-a");
    expect(screen.getByText(/Evento sem fecho legado/)).toBeInTheDocument(); expect(screen.queryByRole("button", { name: /fecho/i })).toBeNull();
    const call = scope.calls.find((c) => c.table === "ticket_office_statement_events");
    expect(call.filters).toContainEqual(["company_id", "company-a"]); expect(call.range).toEqual([0, 999]);
  });
  it("evento apurado noutra conta não é candidato a novo fecho no apuramento", async () => {
    scope.tables.event_ticket_office_assignments = [{ event_id: "event-final", financial_account_id: "account-a", company_id: "company-a", events: { id: "event-final", name: "Evento final" } }];
    scope.tables.ticket_office_statement_events = [{ event_id: "event-final", company_id: "company-a", financial_account_id: "other-account" }];
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Novo apuramento" }));
    await waitFor(() => expect(screen.getByRole("button", { name: labels.save })).toBeEnabled());
    expect(within(screen.getByLabelText(labels.candidates)).queryByRole("option", { name: "Evento final" })).toBeNull();
  });
  it.each([undefined, "event-a"])("link da visão geral/evento (%s) abre conta, tab e documento em viewport pequeno", async (eventId) => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    // No legacy statement_id: canonical membership supplies the v2 document.
    scope.read.provenance.eventMemberships = [{ event_id: "event-a", statement_id: "draft-a", financial_account_id: "account-a" }];
    scope.rpc.mockImplementation(async (name) => ({ data: name === "get_ticket_office_settlements_overview" ? [{
      id: "settlement-a", event_id: "event-a", event_name: "Evento final", office_id: "account-a", office_name: "Conta sintética", status: "confirmed", forma_liquidacao: "apuramento",
    }] : [], error: null }));
    const source = mount(<TicketOfficeSettlementsOverview eventId={eventId} />);
    const link = await screen.findByRole("link", { name: "ver apuramento" }); const href = link.getAttribute("href")!;
    expect(href).toBe("/bilheteiras?conta=account-a&separador=apuramentos#apuramento-draft-a");
    source.unmount(); const scroll = vi.fn(); Element.prototype.scrollIntoView = scroll;
    mount(<TicketOffices />, href);
    expect(await screen.findByRole("tab", { name: "Apuramentos", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Conta sintética" })).toBeInTheDocument();
    const target = await waitFor(() => { const node = document.getElementById("apuramento-draft-a"); expect(node).toBeTruthy(); return node!; });
    expect(target).toHaveFocus(); expect(scroll).toHaveBeenCalledWith({ block: "start" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Fechos" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Os fechos finais desta conta são preparados no separador Apuramentos.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /novo fecho/i })).toBeNull(); expect(window.innerWidth).toBe(390);
  });
});

describe("#303 R7 — legado preservado", () => {
  it("conta desligada conserva hash do DOM fixado pela R6 antes da alteração", async () => {
    scope.role = "reader"; scope.read = { status: "legacy", statements: [] };
    scope.tables.ticket_office_statements = [{ id: "legacy-a", financial_account_id: "account-a", number: "SYN-1", statement_date: "2026-10-23", document_total: "-10.00", status: "draft", notes: "Documento sintético",
      ticket_office_statement_lines: [{ id: "line-a", line_type: "advance", position: 0, description: "Repasse sintético", amount: "-10.00", pending_document: false }], ticket_office_statement_documents: [] }];
    const { container } = mount(); await screen.findByText("Apuramento SYN-1");
    expect(createHash("sha256").update(container.innerHTML).digest("hex")).toBe("d50060b5e4623b2e0521413b829e1843802ec9b6c2f6511f3202d157d71446c8");
    expect(confirms()).toHaveLength(0);
  });
  it("v2_unavailable conserva os mesmos bytes e não oferece confirmação", () => {
    scope.read = { status: "v2_unavailable" }; const { container } = mount();
    expect(container.innerHTML).toBe('<p role="alert" class="text-sm text-destructive">Capacidade v2 indisponível. Não é possível preparar apuramentos nesta conta.</p>');
    expect(scope.rpc).not.toHaveBeenCalled(); expect(scope.calls).toHaveLength(0);
  });
});
