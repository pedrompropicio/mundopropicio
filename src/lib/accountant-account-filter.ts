/**
 * Exclusão de contas gerenciais (financial_accounts.is_accounting = false) na aba
 * Documentos de /contabilidade — mesmo predicado usado pela edge function
 * generate-accountant-zip (#235, 23/09/2026).
 *
 * NOT IN devolve NULL para account_id nulo, por isso as transações sem conta
 * são mantidas explicitamente.
 */

/** Predicado `.or(...)` do PostgREST, ou null quando não há contas gerenciais. */
export function nonAccountingOrFilter(nonAccountingIds: string[]): string | null {
  if (!nonAccountingIds.length) return null;
  return `account_id.is.null,account_id.not.in.(${nonAccountingIds.join(",")})`;
}

/**
 * Normaliza o filtro de conta: uma conta gerencial (só possível por estado
 * antigo guardado na UI) é tratada como "all".
 */
export function normalizeAccountFilter(
  accountFilter: string,
  nonAccountingIds: string[],
): string {
  if (accountFilter === "all") return "all";
  return nonAccountingIds.includes(accountFilter) ? "all" : accountFilter;
}
