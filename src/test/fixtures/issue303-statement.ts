import type { TicketlineStatement, TicketlineStatementContext, TicketOfficeStatementsV2Config } from "@/lib/ticketline-statement-contract";

// Entirely invented identities and cents; no operational data or document bytes.
export const issue303Feature = { feature_key: "ticket-office-statements-v2", enabled: true };
export const issue303Config: TicketOfficeStatementsV2Config = { accounts: [
  { financial_account_id: "account-a", enabled: true, contract_version: 2 },
  { financial_account_id: "account-b", enabled: false, contract_version: 2 },
] };

export const issue303Context: TicketlineStatementContext = {
  is_first_statement: false,
  confirmed_event_ids: ["event-previous"],
};

export function issue303Statement(): TicketlineStatement {
  return {
    contract_version: 2, id: "statement-current", financial_account_id: "account-a",
    predecessor_statement_id: "statement-previous", document_total_cents: -105000,
    lines: [
      { id: "sales-a", document_line_type: "event_sales", event_id: "event-a", amount_cents: 100000,
        event_gross_cents: 101000, event_retained_cents: 1000, declared_event_net_cents: 70000 },
      { id: "sales-b", document_line_type: "event_sales", event_id: "event-b", amount_cents: 150000,
        event_gross_cents: 152000, event_retained_cents: 2000, declared_event_net_cents: 120000 },
      { id: "sales-c", document_line_type: "event_sales", event_id: "event-c", amount_cents: 50000,
        event_gross_cents: 50500, event_retained_cents: 500, declared_event_net_cents: 50000 },
      { id: "invoice-a", document_line_type: "ticketline_invoice", event_id: "event-a", quota_line_id: "sales-a",
        transaction_id: "invoice-source-a", amount_cents: -10000 },
      { id: "invoice-b", document_line_type: "ticketline_invoice", event_id: "event-previous",
        transaction_id: "invoice-source-b", amount_cents: -5000, adjusts_statement_id: "statement-previous",
        adjusts_line_id: "sales-previous", adjustment_reason: "Synthetic late invoice" },
      { id: "venue-a", document_line_type: "venue_settlement", event_id: "event-a", quota_line_id: "sales-a",
        transaction_id: "venue-source-a", amount_cents: -20000 },
      { id: "venue-b", document_line_type: "venue_settlement", event_id: "event-b", quota_line_id: "sales-b",
        transaction_id: "venue-source-b", amount_cents: -30000 },
      { id: "advance-a", document_line_type: "advance", transaction_id: "advance-source-a", amount_cents: -200000 },
      { id: "advance-b", document_line_type: "advance", transaction_id: "advance-source-b", amount_cents: -100000 },
      { id: "carry", document_line_type: "carry_over", previous_statement_id: "statement-previous", amount_cents: -40000 },
    ],
  };
}

export const issue303OpeningContext: TicketlineStatementContext = { is_first_statement: true, confirmed_event_ids: [] };

export function issue303OpeningStatement(): TicketlineStatement {
  return {
    contract_version: 2, id: "opening-statement", financial_account_id: "account-opening",
    predecessor_statement_id: null, document_total_cents: -10000,
    lines: [
      { id: "opening", document_line_type: "opening_balance", amount_cents: -40000, opening: {
        note: "Synthetic manual opening approved for the first document", created_by: "preparer-a",
        created_at: "2030-01-01T10:00:00Z",
        admin_approval: { approved: true, approved_by: "admin-a", approved_at: "2030-01-01T11:00:00Z" },
      } },
      { id: "opening-sales", document_line_type: "event_sales", event_id: "event-opening", amount_cents: 50000,
        event_gross_cents: 50000, event_retained_cents: 0, declared_event_net_cents: 50000 },
      { id: "opening-advance", document_line_type: "advance", transaction_id: "opening-source", amount_cents: -20000 },
    ],
  };
}

/** R9: invented read-side documents/receipts, unrelated to operational PDFs. */
export function issue303ConsumerFixture() {
  const company = "company-synthetic", account = "account-a", hash = "a".repeat(64);
  const line = (id: string, statement: string, type: string, amount: number, event: string | null = null, extra = {}) => ({
    id, statement_id: statement, company_id: company, position: 0, description: `Synthetic ${id}`,
    line_type: type === "event_sales" ? "event_right" : type, document_line_type: type, amount, event_id: event,
    source_sha256: hash, document_page: 1, document_line_ref: id,
    opening_note: null, opening_created_by: null, opening_created_at: null,
    adjusts_statement_id: null, adjusts_line_id: null, adjustment_reason: null, ...extra,
  });
  const firstLines = [
    line("quota-a", "first", "event_sales", 1000, "event-a", { event_gross_amount: 1010, event_retained_amount: 10, declared_event_net: 700 }),
    line("invoice-a", "first", "ticketline_invoice", -100, "event-a", { quota_line_id: "quota-a", transaction_id: "invoice-source-a" }),
    line("venue-a", "first", "venue_settlement", -200, "event-a", { quota_line_id: "quota-a" }),
    line("advance-first", "first", "advance", -1100, null, { transaction_id: "repasse-first" }),
  ];
  const nextLines = [
    line("carry-next", "next", "carry_over", -400, null, { previous_statement_id: "first" }),
    line("quota-b", "next", "event_sales", 1500, "event-b", { event_gross_amount: 1520, event_retained_amount: 20, declared_event_net: 1200 }),
    line("quota-c", "next", "event_sales", 500, "event-c", { event_gross_amount: 505, event_retained_amount: 5, declared_event_net: 500 }),
    line("venue-b", "next", "venue_settlement", -300, "event-b", { quota_line_id: "quota-b" }),
    line("q4-a", "next", "ticketline_invoice", -50, "event-a", { transaction_id: "invoice-q4", adjusts_statement_id: "first", adjusts_line_id: "quota-a", adjustment_reason: "Synthetic subsequent correction" }),
    line("advance-next", "next", "advance", -900, null, { transaction_id: "repasse-next" }),
  ];
  const header = (id: string, date: string, cutoff: string, total: number, lines: ReturnType<typeof line>[], predecessor: string | null, status = "confirmed") => {
    const h = { id, company_id: company, financial_account_id: account, number: id, statement_date: date, created_at: `${date}T12:00:00Z`,
      document_total: total, status, contract_version: 2, revision: 1, position_cutoff_at: cutoff,
      position_timezone: "America/Fortaleza", position_cutoff_source: "pdf_explicit", predecessor_statement_id: predecessor,
      primary_document_id: `pdf-${id}`, primary_document_sha256: hash, opening_balance_line_id: null,
      ticket_office_statement_lines: lines, confirmation_receipt: null as Record<string, unknown> | null };
    if (status === "confirmed") h.confirmation_receipt = {
      contract_version: 2, statement_id: id, revision: 1, calculated_total: total, independent_position: total,
      confirmed_by: "admin-synthetic", confirmed_at: cutoff, opening_approved: false, opening: null,
      lines: structuredClone(lines), documents: [{ id: h.primary_document_id, sha256: hash }], sources: [],
      position_proof: { validator: "issue303-r4-v1", contract_version: 2, statement_id: id, revision: 1,
        position_cutoff_at: cutoff, position_timezone: h.position_timezone, position_cutoff_source: h.position_cutoff_source,
        primary_document_sha256: hash, independent_position: total, sources: [] },
    };
    return h;
  };
  // Document dates deliberately differ from cutoff ordering; a draft cannot win.
  const first = header("first", "2030-02-03", "2030-02-01T12:00:00Z", -400, firstLines, null);
  const next = header("next", "2030-02-02", "2030-02-02T12:00:00Z", 350, nextLines, "first");
  const draft = header("draft", "2030-02-04", "2030-02-04T12:00:00Z", 999, [], "next", "draft");
  const ids = ["event-a", "event-b", "event-c"];
  const transactions = [
    { id: "invoice-source-a", event_id: "event-a", paid_amount: 100, category_id: "cost" },
    { id: "venue-source-a", event_id: "event-a", paid_amount: 200, category_id: "cost" },
    { id: "venue-source-b", event_id: "event-b", paid_amount: 300, category_id: "cost" },
    { id: "invoice-q4", event_id: "event-a", paid_amount: 50, category_id: "cost" },
    { id: "repasse-first", event_id: null, paid_amount: 1100, category_id: "synthetic-transfer-category" },
    { id: "repasse-next", event_id: null, paid_amount: 900, category_id: "synthetic-transfer-category" },
  ].map(t => ({ ...t, account_id: account, type: "expense", amount: t.paid_amount, status: "paid", reversed_at: null, is_hidden: false }));
  const tables: Record<string, Record<string, any>[]> = {
    company_features: [{ ...issue303Feature, company_id: company, config: issue303Config }],
    ticket_office_statements: [draft, first, next],
    ticket_office_statement_lines: [...firstLines, ...nextLines],
    ticket_office_statement_events: ids.map((id, i) => ({ event_id: id, company_id: company, financial_account_id: account,
      statement_id: i === 0 ? "first" : "next", quota_line_id: `quota-${id.slice(-1)}`, created_by: "admin-synthetic", created_at: "2030-02-02T12:00:00Z" })),
    event_ticket_office_assignments: ids.map(id => ({ id: `assignment-${id}`, financial_account_id: account, event_id: id, is_conciliated: false, events: { id, name: `Synthetic ${id}`, status: "in_progress" } })),
    ticket_office_settlements: ids.map((id, i) => ({ id: `settlement-${id}`, company_id: company, financial_account_id: account, event_id: id, status: "confirmed", net_calculated: [700, 1200, 500][i], net_adjusted: null })),
    // Linked history is preserved and must never be subtracted a second time.
    event_ticket_office_advances: [{ id: "historic", financial_account_id: account, event_id: "event-a", amount: 1100, transaction_id: "repasse-first", settlement_id: null }],
    transactions,
  };
  return { company, account, tables, sales: ids.map((id, i) => ({ event_id: id, quantity: 10, revenue: [1000, 1500, 500][i] })) };
}
