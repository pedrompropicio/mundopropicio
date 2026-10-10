import { roundCents } from "@/lib/ticket-office-reconciliation";

export function ticketOfficePosition(
  events: { id: string; name: string; balance: number }[],
  settledIds: string[],
  statementEventIds: string[],
  position: number,
  retained: number,
) {
  const excluded = new Set([...settledIds, ...statementEventIds]);
  const openEvents = events.filter((event) => !excluded.has(event.id));
  const openTotal = roundCents(openEvents.reduce((sum, event) => sum + event.balance, 0));
  const advanced = Math.abs(position);
  // A positive statement is receivable, not an advance: preserve its signed contribution.
  const calendarDifference = roundCents(retained - openTotal - position);
  return { openEvents, openTotal, advanced, calendarDifference, position, retained };
}

export function statementTypeTotals(lines: { line_type: string; amount: number | string | null }[]) {
  const totals: Record<string, number> = {};
  for (const line of lines) {
    totals[line.line_type] = roundCents((totals[line.line_type] ?? 0) + Number(line.amount ?? 0));
  }
  return totals;
}