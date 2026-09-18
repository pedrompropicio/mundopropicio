/**
 * Paginação de leituras PostgREST nas edge functions (#206, fase 1).
 *
 * Gémeo de `src/lib/supabase-paging.ts` — as edge functions não podem importar
 * de `src/`. O PostgREST devolve no máximo 1000 linhas por pedido; qualquer
 * leitura sem `.range()` numa tabela grande fica truncada em silêncio.
 */
export async function fetchAllPagedQuery<T = any>(
  query: any,
  opts?: { pageSize?: number; maxRows?: number },
): Promise<{ data: T[] | null; error: any }> {
  const pageSize = opts?.pageSize ?? 1000;
  const maxRows = opts?.maxRows ?? 50000;

  let q: any = query;
  try {
    q = q.order("id", { ascending: true });
  } catch {
    // tabela sem coluna `id`
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
      console.warn(`[fetchAllPagedQuery] maxRows=${maxRows} atingido — resultado INCOMPLETO`);
      break;
    }
  }

  return { data: all, error: null };
}
