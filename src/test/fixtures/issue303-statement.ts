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
