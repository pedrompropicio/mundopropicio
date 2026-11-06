import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const scope = vi.hoisted(() => ({
  read: { status: "legacy", statements: [] } as any,
  admin: false, manager: false,
  company: { id: "company-a", timezone: "Europe/Lisbon" },
  rpc: vi.fn(), refetch: vi.fn(), tables: {} as Record<string, any[]>, calls: [] as any[], errors: {} as Record<string, any>,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-a" }, isAdmin: scope.admin, isManager: scope.manager }) }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ company: scope.company, companyId: scope.company.id }), getCurrentCompanyId: async () => scope.company.id }));
vi.mock("@/hooks/useTicketOfficeStatements", () => ({ useTicketOfficeStatements: () => ({ data: scope.read, refetch: scope.refetch }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...args: any[]) => scope.rpc(...args),
  from: (table: string) => {
    const call = { table, filters: [] as any[], select: "", range: null as number[] | null }; scope.calls.push(call);
    const q: any = {
      select: (s: string) => { call.select = s; return q; },
      eq: (key: string, value: unknown) => { call.filters.push([key, value]); return q; },
      order: () => q, range: (a: number, b: number) => { call.range = [a, b]; return q; },
      then: (resolve: any, reject: any) => {
        let rows = (scope.tables[table] ?? []).filter((row) => call.filters.every(([k, v]) => !(k in row) || row[k] === v));
        if (call.range) rows = rows.slice(call.range[0], call.range[1] + 1);
        return Promise.resolve({ data: rows, error: scope.errors[table] ?? null }).then(resolve, reject);
      },
    }; return q;
  },
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TicketOfficeStatementsPanel } from "@/components/TicketOfficeStatementsPanel";
import { statementCutoffPreview, statementDraftLabels as labels } from "@/components/TicketOfficeStatementModal";
import { loadStatementDocuments, statementDraftDocuments, statementDocumentLabels } from "@/lib/ticket-office-statement-documents";

const legacy = {
  id: "legacy-a", number: "SYN-1", statement_date: "2026-10-23", document_total: "-10.00", status: "draft", notes: "Documento sintético",
  ticket_office_statement_lines: [{ id: "line-a", line_type: "advance", position: 0, description: "Repasse sintético", amount: "-10.00", pending_document: false }],
  ticket_office_statement_documents: [],
};
const clients: QueryClient[] = [];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><TicketOfficeStatementsPanel officeId="account-a" /></QueryClientProvider>);
}
beforeEach(() => {
  scope.read = { status: "legacy", statements: [] }; scope.admin = false; scope.manager = false;
  scope.company = { id: "company-a", timezone: "Europe/Lisbon" };
  Object.defineProperty(crypto, "randomUUID", { value: randomUUID, configurable: true });
  scope.tables = { ticket_office_statements: [structuredClone(legacy)] }; scope.calls = []; scope.errors = {};
  scope.rpc.mockReset(); scope.refetch.mockReset(); scope.refetch.mockResolvedValue({ data: scope.read });
  scope.rpc.mockImplementation(async (name) => name === "get_ticket_office_sales"
    ? { data: [{ event_id: "event-a", revenue: "100.00" }], error: null }
    : { data: { statement_id: "draft-new", revision: 1, status: "draft", contract_version: 2 }, error: null });
});

const H = "a".repeat(64);
const provenance = (id = "draft-a", status = "draft") => ({
  statementId: id, status, documentTotal: 90, revision: 4, cutoff: null, primaryDocument: null, receipt: null, opening: null, adjustments: [],
});
function draft(patch: Record<string, any> = {}) {
  return { id: "draft-a", number: "SYN-2", statement_date: "2026-10-24", document_total: "90.00", status: "draft", contract_version: 2,
    revision: 4, predecessor_statement_id: null, primary_document_id: null, ticket_office_statement_lines: [], provenance: provenance(), ...patch };
}
function enable() {
  scope.manager = true;
  scope.read = { status: "v2", statements: [], confirmedStatements: [], draftStatements: [], legacyStatements: [],
    provenance: { contractVersion: 2, financialAccountId: "account-a", latestConfirmedStatementId: null, statements: [], eventMemberships: [] } };
  scope.tables.ticket_office_statements = [];
  scope.tables.event_ticket_office_assignments = [
    { id: "assignment-a", event_id: "event-a", events: { id: "event-a", name: "Evento candidato" } },
    { id: "assignment-final", event_id: "event-final", events: { id: "event-final", name: "Evento já apurado" } },
  ];
  scope.tables.ticket_office_settlements = [
    { id: "settlement-a", event_id: "event-a", status: "draft", gross_revenue: "100.00", venue_retained_amount: "10.00", net_calculated: "90.00", net_adjusted: null },
  ];
}
async function openNew() {
  fireEvent.click(await screen.findByRole("button", { name: "Novo apuramento" }));
  await waitFor(() => expect(screen.getByRole("button", { name: labels.save })).toBeEnabled());
  return screen.getByRole("dialog");
}
function fillHeader() {
  fireEvent.change(screen.getByLabelText(labels.number), { target: { value: "SYN-NEW" } });
  fireEvent.change(screen.getByLabelText(labels.date), { target: { value: "25/10/2026" } });
  fireEvent.change(screen.getByLabelText(labels.total), { target: { value: "9000" } });
}
const saveCalls = () => scope.rpc.mock.calls.filter(([name]) => name === "save_ticket_office_statement_draft");

describe("#303 R6 — rascunho v2 com cliente simulado", () => {
  it("abre, pré-preenche o candidato e grava cêntimos exactos pela 0346, sem confirmação", async () => {
    enable(); mount(); const dialog = await openNew(); fillHeader();
    fireEvent.change(screen.getByLabelText(labels.candidates), { target: { value: "event-a" } });
    expect(screen.getByLabelText(labels.gross)).toHaveValue("10000");
    expect(screen.getByLabelText(labels.retained)).toHaveValue("1000");
    expect(screen.getByLabelText(labels.amount)).toHaveValue("9000");
    expect(screen.getByText("26/10/2026 00:00 · Europe/Lisbon")).toBeInTheDocument();
    expect(dialog.querySelector('input[type="date"]')).toBeNull();
    expect(dialog.querySelector(".dialog-fixed-header")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /confirmar/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    const [, args] = saveCalls()[0];
    expect(args).toMatchObject({ p_statement_id: null, p_expected_revision: 0, p_payload: {
      financial_account_id: "account-a", number: "SYN-NEW", statement_date: "2026-10-25", document_total_cents: 9000,
      predecessor_statement_id: null, primary_document_id: null, documents: [],
      lines: [{ document_line_type: "event_sales", position: 0, event_id: "event-a", ticket_office_settlement_id: "settlement-a",
        amount_cents: 9000, event_gross_cents: 10000, event_retained_cents: 1000, declared_event_net_cents: 9000,
        pending_document: true, source_sha256: null, transaction_id: null, opening_note: null }],
    } });
    expect(Object.keys(args.p_payload).sort()).toEqual(["documents", "document_total_cents", "financial_account_id", "lines", "notes", "number", "predecessor_statement_id", "primary_document_id", "statement_date"].sort());
    expect(scope.rpc.mock.calls.some(([name]) => name.includes("confirm"))).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(scope.refetch).toHaveBeenCalled();
  });

  it("abertura só no primeiro documento e nota obrigatória sem aprovação inventada", async () => {
    enable(); mount(); await openNew(); fillHeader();
    fireEvent.change(screen.getByLabelText(labels.type), { target: { value: "opening_balance" } });
    fireEvent.click(screen.getByRole("button", { name: labels.add }));
    fireEvent.change(screen.getByLabelText(labels.amount), { target: { value: "-4000" } });
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    expect(await screen.findByText(labels.invalidLine)).toBeInTheDocument(); expect(saveCalls()).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(labels.openingNote), { target: { value: "Base documental sintética" } });
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0][1].p_payload.lines[0]).toMatchObject({ document_line_type: "opening_balance", amount_cents: -4000, opening_note: "Base documental sintética", event_id: null });
    for (const key of ["opening_created_by", "opening_created_at", "opening", "admin_approval"]) expect(saveCalls()[0][1].p_payload.lines[0]).not.toHaveProperty(key);
  });

  it.each(["draft", "confirmed", "legacy"])("não oferece abertura depois de documento %s da conta", async (kind) => {
    enable(); const existing = draft({ id: "existing", status: kind === "confirmed" ? "confirmed" : "draft" });
    if (kind === "legacy") scope.read.legacyStatements = [{ ...legacy, id: "existing", status: "confirmed" }];
    else if (kind === "confirmed") {
      existing.provenance.opening = { approval: { approvedBy: "synthetic-admin" } };
      scope.read.confirmedStatements = [existing];
    } else scope.read.draftStatements = [existing];
    mount(); await openNew();
    expect(within(screen.getByLabelText(labels.type)).queryByRole("option", { name: labels.types.opening_balance })).toBeNull();
    expect(screen.queryByLabelText(labels.openingNote)).toBeNull();
  });

  it("exclui eventos com pertença confirmada e evita repetição local do candidato", async () => {
    enable(); scope.read.provenance.eventMemberships = [{ event_id: "event-final", statement_id: "final" }];
    mount(); await openNew();
    expect(screen.queryByRole("option", { name: "Evento já apurado" })).toBeNull();
    fireEvent.change(screen.getByLabelText(labels.candidates), { target: { value: "event-a" } });
    expect(within(screen.getByLabelText(labels.candidates)).queryByRole("option", { name: "Evento candidato" })).toBeNull();
  });

  it("exclui também pertença confirmada noutra conta da mesma empresa", async () => {
    enable(); scope.tables.ticket_office_statement_events = [{ event_id: "event-final", financial_account_id: "other-account", company_id: "company-a" }];
    mount(); await openNew();
    expect(screen.queryByRole("option", { name: "Evento já apurado" })).toBeNull();
    const calls = scope.calls.filter((call) => call.table === "ticket_office_statement_events");
    expect(calls[0].filters).toEqual([["company_id", "company-a"]]);
    expect(calls[0].range).toEqual([0, 999]);
  });

  it("edita com revisão esperada, mostra conflito e recarrega sem repetir a escrita", async () => {
    enable(); scope.read.draftStatements = [draft()];
    scope.tables.ticket_office_statements = [scope.read.draftStatements[0]];
    scope.rpc.mockImplementation(async (name) => name === "get_ticket_office_sales" ? { data: [], error: null }
      : { data: null, error: { code: "40001", message: "issue303_revision_conflict" } });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Editar rascunho" }));
    await waitFor(() => expect(screen.getByRole("button", { name: labels.save })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    expect(await screen.findByText(labels.conflict)).toBeInTheDocument();
    expect(scope.refetch).toHaveBeenCalled(); expect(saveCalls()).toHaveLength(1);
    expect(saveCalls()[0][1]).toMatchObject({ p_statement_id: "draft-a", p_expected_revision: 4 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("provas confirmadas não têm remoção nem substituição; só complemento aditivo", async () => {
    enable(); scope.read.confirmedStatements = [draft({ status: "confirmed" })];
    scope.tables.ticket_office_statement_documents = [{ id: "pdf-a", statement_id: "draft-a", file_name: "synthetic.pdf", file_path: "company-a/statements/draft-a/synthetic.pdf",
      mime_type: "application/pdf", document_source: "apuramento", file_size: 20, created_at: "2026-10-23T12:00:00Z", verified_file_id: "verified-a", verified_sha256: H }];
    const { container } = mount(); await screen.findByText("synthetic.pdf");
    expect(container.querySelector('[aria-label^="Remover"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Carregar documento" })).toBeNull();
    expect(screen.getByRole("button", { name: statementDocumentLabels.supplement })).toBeDisabled();
    expect(screen.getByText(statementDocumentLabels.verifierUnavailable)).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar rascunho" })).toBeNull();
  });

  it("preserva PDF verificado, notas e justificação de sinal omitidos na R5", async () => {
    enable();
    const invoice = { id: "invoice-line", document_line_type: "ticketline_invoice", description: "Crédito sintético", amount: "1.00", transaction_id: "credit-a", pending_document: false };
    scope.read.draftStatements = [draft({ primary_document_id: "pdf-a", ticket_office_statement_lines: [invoice] })];
    scope.tables.ticket_office_statements = [{ ...scope.read.draftStatements[0], notes: "Nota que a R5 não selecciona" }];
    scope.tables.ticket_office_statement_lines = [{ ...invoice, positive_sign_evidence: "Nota de crédito comprovada" }];
    scope.tables.ticket_office_statement_documents = [{ id: "pdf-a", statement_id: "draft-a", file_name: "synthetic.pdf", file_path: "company-a/statements/draft-a/synthetic.pdf",
      mime_type: "application/pdf", document_source: "apuramento", file_size: 20, created_at: "2026-10-23T12:00:00Z", verified_file_id: "verified-a", verified_sha256: H }];
    scope.rpc.mockImplementation(async (name) => name === "get_ticket_office_sales" ? { data: [], error: null }
      : { data: { contract_version: 2, status: "draft", statement_id: "draft-a", revision: 5 }, error: null });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Editar rascunho" }));
    await waitFor(() => expect(screen.getByRole("button", { name: labels.save })).toBeEnabled());
    expect(screen.getByLabelText(labels.notes)).toHaveValue("Nota que a R5 não selecciona");
    expect(screen.getByLabelText(labels.positiveEvidence)).toHaveValue("Nota de crédito comprovada");
    expect(screen.getByLabelText(statementDocumentLabels.primary)).toHaveValue("pdf-a");
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0][1]).toMatchObject({ p_expected_revision: 4, p_payload: {
      notes: "Nota que a R5 não selecciona", primary_document_id: "pdf-a",
      documents: [{ id: "pdf-a", verified_file_id: "verified-a", file_name: "synthetic.pdf", mime_type: "application/pdf", document_source: "apuramento" }],
      lines: [{ positive_sign_evidence: "Nota de crédito comprovada", amount_cents: 100, transaction_id: "credit-a" }],
    } });
    expect(saveCalls()[0][1].p_payload.documents[0]).not.toHaveProperty("verified_sha256");
  });

  it("um refetch da R5 não troca a revisão ligada aos valores originais do formulário", async () => {
    enable(); scope.read.draftStatements = [draft()]; scope.tables.ticket_office_statements = [draft()];
    const ui = mount(); fireEvent.click(await screen.findByRole("button", { name: "Editar rascunho" }));
    await waitFor(() => expect(screen.getByRole("button", { name: labels.save })).toBeEnabled());
    fireEvent.change(screen.getByLabelText(labels.number), { target: { value: "LOCAL" } });
    scope.read = { ...scope.read, draftStatements: [draft({ revision: 5, number: "REMOTE" })] };
    ui.rerender(<QueryClientProvider client={clients[clients.length - 1]}><TicketOfficeStatementsPanel officeId="account-a" /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0][1]).toMatchObject({ p_expected_revision: 4, p_payload: { number: "LOCAL" } });
  });

  it("seleciona repasse pago 10.3 sem copiar o evento histórico para a linha", async () => {
    enable(); scope.tables.transactions = [
      { id: "advance-a", type: "expense", status: "paid", amount: "12.34", paid_amount: "12.34", event_id: "event-final", description: "Repasse histórico", currency: "EUR", account_categories: { code: "10.3" } },
      { id: "advance-unpaid", type: "expense", status: "pending", amount: "12.34", paid_amount: "0", description: "Por pagar", currency: "EUR", account_categories: { code: "10.3" } },
    ];
    mount(); await openNew(); fillHeader();
    fireEvent.change(screen.getByLabelText(labels.type), { target: { value: "advance" } });
    fireEvent.click(screen.getByRole("button", { name: labels.add }));
    expect(screen.queryByRole("option", { name: /Por pagar/ })).toBeNull();
    fireEvent.change(screen.getByLabelText(labels.sourceTransaction), { target: { value: "advance-a" } });
    expect(screen.getByLabelText(labels.amount)).toHaveValue("-1234");
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0][1].p_payload.lines[0]).toMatchObject({ document_line_type: "advance", transaction_id: "advance-a", amount_cents: -1234,
      event_id: null, quota_line_id: null, ticket_office_settlement_id: null });
  });

  it("remoção de anexo do rascunho só entra na RPC com a revisão esperada", async () => {
    enable(); scope.read.draftStatements = [draft({ primary_document_id: "pdf-a" })]; scope.tables.ticket_office_statements = [draft()];
    scope.tables.ticket_office_statement_documents = [{ id: "pdf-a", statement_id: "draft-a", file_name: "synthetic.pdf", file_path: "company-a/statements/draft-a/synthetic.pdf",
      mime_type: "application/pdf", document_source: "apuramento", file_size: 20, created_at: "2026-10-23T12:00:00Z", verified_file_id: "verified-a", verified_sha256: H }];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Editar rascunho" }));
    await waitFor(() => expect(screen.getByRole("button", { name: labels.save })).toBeEnabled());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remover synthetic.pdf" }));
    expect(saveCalls()).toHaveLength(0); expect(screen.getByLabelText(statementDocumentLabels.primary)).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    await waitFor(() => expect(saveCalls()).toHaveLength(1));
    expect(saveCalls()[0][1]).toMatchObject({ p_expected_revision: 4, p_payload: { primary_document_id: null, documents: [] } });
    vi.restoreAllMocks();
  });

  it("mostra capacidade indisponível explicitamente e não executa leituras legadas/escritas", async () => {
    enable(); scope.read = { status: "v2_unavailable", message: "capacidade v2 indisponível" };
    mount(); expect(screen.getByRole("alert")).toHaveTextContent("Capacidade v2 indisponível");
    expect(screen.queryByRole("button", { name: "Novo apuramento" })).toBeNull();
    expect(scope.calls).toHaveLength(0); expect(scope.rpc).not.toHaveBeenCalled();
  });

  it("falha de leitura não habilita editor nem recua para o legado", () => {
    scope.read = undefined; mount(); expect(screen.queryByRole("button", { name: "Novo apuramento" })).toBeNull();
    expect(scope.calls).toHaveLength(0);
  });

  it.each(["1.001", "0.1", "9007199254740992", "1e3"])("recusa cêntimos inválidos %s antes de chamar RPC", async (value) => {
    enable(); mount(); await openNew(); fillHeader();
    fireEvent.change(screen.getByLabelText(labels.total), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    expect(await screen.findByText(labels.invalidCents)).toBeInTheDocument(); expect(saveCalls()).toHaveLength(0);
  });

  it("limpar data apaga o valor canónico e mantém a validação obrigatória", async () => {
    enable(); mount(); await openNew(); fillHeader();
    fireEvent.click(screen.getByRole("button", { name: `Limpar ${labels.date}` }));
    fireEvent.blur(screen.getByLabelText(labels.date));
    expect(screen.getByLabelText(labels.date)).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    expect(await screen.findByText(labels.required)).toBeInTheDocument(); expect(saveCalls()).toHaveLength(0);
  });

  it("falha no pré-preenchimento bloqueia gravação e não inventa zeros", async () => {
    enable(); scope.errors.ticket_office_settlements = { message: "synthetic failure" };
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Novo apuramento" }));
    expect(await screen.findByText(labels.sourceError)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: labels.save })).toBeDisabled(); expect(saveCalls()).toHaveLength(0);
  });

  it("não oferece criação a leitores mesmo com capacidade v2", async () => {
    enable(); scope.manager = false; mount();
    expect(await screen.findByRole("heading", { name: "Apuramentos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Novo apuramento" })).toBeNull();
  });

  it.each([
    ["2026-03-28", "Europe/Lisbon", "29/03/2026 00:00 · Europe/Lisbon"],
    ["2026-10-25", "Europe/Lisbon", "26/10/2026 00:00 · Europe/Lisbon"],
    ["2026-12-31", "America/Fortaleza", "01/01/2027 00:00 · America/Fortaleza"],
  ])("Q1 prevê o limite civil %s em %s independentemente do browser", (date, zone, expected) => {
    expect(statementCutoffPreview(date, zone)).toBe(expected);
  });

  it("não inventa fuso nem verificação local", () => {
    expect(statementCutoffPreview("2026-10-25", "")).toBeNull();
    expect(statementCutoffPreview("2026-10-25", "invalid/synthetic")).toBeNull();
    expect(() => statementDraftDocuments([{ id: "pdf", verified_sha256: H } as any])).toThrow(statementDocumentLabels.unverified);
  });

  it("anexos paginados preservam também o documento 1001 e o âmbito da empresa", async () => {
    scope.tables.ticket_office_statement_documents = Array.from({ length: 1001 }, (_, index) => ({
      id: `pdf-${index}`, company_id: "company-a", statement_id: "draft-a", verified_file_id: `verified-${index}`, verified_sha256: H,
    }));
    const docs = await loadStatementDocuments("draft-a", "company-a");
    expect(docs).toHaveLength(1001); expect(docs[1000].id).toBe("pdf-1000");
    expect(scope.calls[0].filters).toEqual([["statement_id", "draft-a"], ["company_id", "company-a"]]);
    expect(scope.calls.map((c) => c.range)).toEqual([[0, 999], [1000, 1999]]);
    expect(statementDraftDocuments(docs)).toHaveLength(1001);
  });

  it("uma resposta de gravação inválida não fecha o formulário nem declara sucesso", async () => {
    enable(); scope.rpc.mockImplementation(async (name) => name === "get_ticket_office_sales" ? { data: [], error: null }
      : { data: { status: "confirmed", revision: 1, statement_id: "invalid" }, error: null });
    mount(); await openNew(); fillHeader();
    fireEvent.click(screen.getByRole("button", { name: labels.save }));
    expect(await screen.findByText(labels.missingRevision)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(scope.refetch).not.toHaveBeenCalled();
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((c) => c.clear()); });

describe("#303 R6 — painel legado", () => {
  it("conta desligada mantém o DOM byte a byte (hash fixado antes da implementação)", async () => {
    const { container } = mount();
    await screen.findByText("Apuramento SYN-1");
    expect(createHash("sha256").update(container.innerHTML).digest("hex")).toBe("d50060b5e4623b2e0521413b829e1843802ec9b6c2f6511f3202d157d71446c8");
    expect(screen.queryByRole("button", { name: "Novo apuramento" })).toBeNull();
  });
  it("conta desligada vazia mantém o DOM byte a byte", async () => {
    scope.tables.ticket_office_statements = [];
    const { container } = mount();
    await screen.findByText("Sem apuramentos registados nesta bilheteira.");
    expect(container.innerHTML).toBe('<p class="text-sm text-muted-foreground">Sem apuramentos registados nesta bilheteira.</p>');
  });
});
