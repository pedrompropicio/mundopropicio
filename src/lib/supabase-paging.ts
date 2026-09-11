/**
 * Paginação de leituras PostgREST.
 *
 * O PostgREST devolve no máximo 1000 linhas por pedido. Queries sem `.range()`
 * ficam silenciosamente truncadas — foi exactamente o defeito que originou este
 * helper (Transações/Dashboard/IVA/Relatório de fornecedores).
 *
 * IMPORTANTE: a query passada em `build` TEM de ter uma ordenação total e única
 * (acrescentar sempre `.order("id", { ascending: true })` como último critério),
 * caso contrário blocos consecutivos podem saltar ou duplicar linhas.
 */
export async function fetchAllPaged<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  opts?: { pageSize?: number; maxRows?: number }
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? 1000;
  const maxRows = opts?.maxRows ?? 20000;

  const all: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await build(from, to);
    if (error) throw error;

    const batch = data ?? [];
    all.push(...batch);

    if (batch.length < pageSize) break;

    from += pageSize;

    if (all.length >= maxRows) {
      console.warn(
        `[fetchAllPaged] Limite de segurança maxRows=${maxRows} atingido (${all.length} linhas carregadas). ` +
          `O resultado está INCOMPLETO — aumenta maxRows ou filtra a query no servidor.`
      );
      break;
    }
  }

  return all;
}
