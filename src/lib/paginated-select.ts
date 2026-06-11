/**
 * Helper para contornar o limite implícito de 1000 linhas do PostgREST.
 *
 * Faz `.range(from, from+pageSize-1)` em loop até a resposta vir menor que
 * `pageSize`. Aceita um builder que devolve uma nova query a cada página
 * (necessário porque o cliente supabase-js não permite reusar a mesma query
 * com `.range()` aplicado várias vezes).
 *
 * Uso:
 *   const rows = await fetchAllPaginated(() =>
 *     supabase.from("ticket_sales")
 *       .select("zone_id, quantity, unit_price, financial_account_id, sale_date")
 *       .in("zone_id", zoneIds)
 *   );
 */
export async function fetchAllPaginated<T = any>(
  builder: () => any,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // hard cap defensivo: 200 páginas (200k linhas) — evita loop infinito
  for (let i = 0; i < 200; i++) {
    const q = builder().range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
