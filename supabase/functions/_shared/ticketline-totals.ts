/** Canonical signed statement totals; position is not evidence of a bank receipt. */
export function statementTypeTotals(lines: { line_type: string; amount: number | string | null }[]) {
  const totals: Record<string, number> = {};
  for (const line of lines) totals[line.line_type] = Math.round(((totals[line.line_type] ?? 0) + Number(line.amount ?? 0)) * 100) / 100;
  return totals;
}