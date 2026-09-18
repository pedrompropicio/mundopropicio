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

/**
 * Variante que recebe o *query builder* já montado e o pagina, devolvendo
 * `{ data, error }` como o PostgREST — para não obrigar a reescrever o
 * tratamento de erro de cada chamada (#206, fase 1).
 *
 * Acrescenta `.order("id", { ascending: true })` como ÚLTIMO critério, para
 * garantir a ordenação total que a paginação exige, e percorre a query em
 * blocos de 1000 até esgotar as linhas.
 *
 * Nota: o builder do supabase-js é re-executável — cada `await` faz um pedido
 * novo — e `.range()` sobrepõe-se a cada volta.
 */
export async function fetchAllPagedQuery<T = any>(
  query: any,
  opts?: { pageSize?: number; maxRows?: number }
): Promise<{ data: T[] | null; error: any }> {
  const pageSize = opts?.pageSize ?? 1000;
  const maxRows = opts?.maxRows ?? 50000;

  let q: any = query;
  try {
    q = q.order("id", { ascending: true });
  } catch {
    // tabela sem coluna `id` — fica a ordenação que o chamador definiu
  }

  const all: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) return { data: null, error };

    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < pageSize) break;

    from += pageSize;
    if (all.length >= maxRows) {
      console.warn(
        `[fetchAllPagedQuery] Limite de segurança maxRows=${maxRows} atingido (${all.length} linhas). ` +
          `O resultado está INCOMPLETO — filtra a query no servidor ou usa uma RPC de agregação.`
      );
      break;
    }
  }

  return { data: all, error: null };
}
