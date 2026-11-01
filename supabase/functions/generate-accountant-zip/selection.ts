// #395: pure, credential-free validation for exact visible-result exports.
export const MAX_TX = 500;
export const MAX_BYTES = 200 * 1024 * 1024;
export const TX_LIMIT_ERROR = `Mais de ${MAX_TX} transações no período. Reduza o período.`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertTransactionLimit(count: number): void {
  if (count > MAX_TX) throw new Error(TX_LIMIT_ERROR);
}

export function assertZipSize(bytes: number): void {
  if (bytes > MAX_BYTES) throw new Error("ZIP excederia 200MB. Reduza o período.");
}

export function parseTransactionIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
    throw new Error("transaction_ids deve ser uma lista de identificadores de transações.");
  }
  assertTransactionLimit(value.length);
  return value.map((id: string) => id.toLowerCase());
}

export function queryableTransactionIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => UUID.test(id)))];
}

export function canExportCompany(
  roles: Array<{ role: string; company_id: string | null }>,
  companyId: string,
): boolean {
  return roles.some((r) => r.role === "platform_admin" ||
    (["admin", "manager", "accountant"].includes(r.role) && r.company_id === companyId));
}

export function selectRequestedTransactions<T extends {
  id: string; company_id: string; account_id: string | null;
}>(requested: string[], transactions: T[], companyId: string, nonAccountingIds: string[]) {
  assertTransactionLimit(requested.length);
  const requestedSet = new Set(queryableTransactionIds(requested));
  const excluded = new Set(nonAccountingIds);
  const eligible = new Map(transactions
    .filter((t) => requestedSet.has(t.id) && t.company_id === companyId &&
      (t.account_id === null || !excluded.has(t.account_id)))
    .map((t) => [t.id, t] as const));
  return {
    transactions: [...eligible.values()],
    ignored_count: requested.filter((id) => !eligible.has(id)).length,
  };
}