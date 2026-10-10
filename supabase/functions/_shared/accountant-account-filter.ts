/**
 * #235 — fonte ÚNICA da exclusão de contas gerenciais (financial_accounts.is_accounting = false)
 * para a contabilidade: usada pela aba Documentos de /contabilidade (via src/lib/accountant-account-filter.ts)
 * e pela edge function generate-accountant-zip. Ecrã e ZIP leem a mesma lista com o mesmo predicado.
 *
 * NOT IN devolve NULL para account_id nulo, por isso as transações sem conta são mantidas explicitamente.
 */

/** Ids das contas gerenciais da empresa. Lança em erro (nunca devolve lista vazia por falha). */
export async function fetchNonAccountingAccountIds(client: any, companyId: string): Promise<string[]> {
  const { data, error } = await client
    .from("financial_accounts")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_accounting", false);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map((a) => a.id);
}

/** Predicado `.or(...)` do PostgREST, ou null quando não há contas gerenciais. */
export function nonAccountingOrFilter(nonAccountingIds: string[]): string | null {
  if (!nonAccountingIds.length) return null;
  return `account_id.is.null,account_id.not.in.(${nonAccountingIds.join(",")})`;
}

/** Conta gerencial no filtro (estado antigo guardado na UI) é tratada como "all". */
export function normalizeAccountFilter(accountFilter: string, nonAccountingIds: string[]): string {
  if (accountFilter === "all") return "all";
  return nonAccountingIds.includes(accountFilter) ? "all" : accountFilter;
}

/** Lista de contas pedidas sem as gerenciais (ZIP). */
export function accountingOnlyIds(accountIds: string[], nonAccountingIds: string[]): string[] {
  return accountIds.filter((id) => !nonAccountingIds.includes(id));
}
