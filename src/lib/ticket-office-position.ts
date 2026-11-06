import { roundCents } from "@/lib/ticket-office-reconciliation";

/** Read-only server provenance; account movements never become event quotas. */
export interface TicketOfficeStatementProvenance {
  statementId: string;
  status: "draft" | "confirmed";
  documentTotal: number | null;
  revision: number;
  cutoff: { at: string; timezone: string; source: "company_day_end" | "pdf_explicit" } | null;
  primaryDocument: { id: string; sha256: string } | null;
  receipt: { source: "server_confirmation_receipt"; value: Record<string, unknown> } | null;
  opening: {
    lineId: string; amount: number; note: string; preparedBy: string; preparedAt: string;
    approval: { approvedBy: string; approvedAt: string } | null;
  } | null;
  adjustments: {
    lineId: string; originalStatementId: string; originalLineId: string; reason: string;
    eventId: string | null; sourceSha256: string | null;
    documentPage: number | null; documentLineRef: string | null;
  }[];
}

export interface TicketOfficeV2Provenance {
  contractVersion: 2;
  financialAccountId: string;
  latestConfirmedStatementId: string | null;
  statements: TicketOfficeStatementProvenance[];
  eventMemberships: {
    event_id: string; statement_id: string; quota_line_id: string;
    company_id: string; financial_account_id: string; created_by: string; created_at: string;
  }[];
}

export interface TicketOfficePositionResult {
  openEvents: { id: string; name: string; balance: number }[];
  openTotal: number; advanced: number; calendarDifference: number; position: number; retained: number;
  provenance?: TicketOfficeV2Provenance;
}

export function ticketOfficePosition(
  events: { id: string; name: string; balance: number }[],
  settledIds: string[],
  statementEventIds: string[],
  position: number,
  retained: number,
  provenance?: TicketOfficeV2Provenance,
): TicketOfficePositionResult {
  if (provenance) {
    const latest = provenance.statements.find((s) => s.statementId === provenance.latestConfirmedStatementId && s.status === "confirmed");
    position = latest?.documentTotal ?? 0;
    statementEventIds = provenance.eventMemberships.map((m) => m.event_id);
  }
  const excluded = new Set([...settledIds, ...statementEventIds]);
  const openEvents = events.filter((event) => !excluded.has(event.id));
  const openTotal = roundCents(openEvents.reduce((sum, event) => sum + event.balance, 0));
  const advanced = Math.abs(position);
  // A positive statement is receivable, not an advance: preserve its signed contribution.
  const calendarDifference = roundCents(retained - openTotal - position);
  const result = { openEvents, openTotal, advanced, calendarDifference, position, retained };
  return provenance ? { ...result, provenance } : result;
}

export { statementTypeTotals } from "@shared/ticketline-totals";
