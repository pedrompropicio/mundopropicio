/**
 * #196 — escrita que a RLS pode recusar: ler SEMPRE o erro. Com
 * `.select("id")` na cadeia, valida também que afectou linhas (a RLS a
 * filtrar UPDATE/DELETE devolve 0 linhas sem erro — lição de 05/10).
 * Lança Error legível; quem chama mostra-o (toast) ou deixa a mutation falhar.
 */
export interface WriteResult<T = unknown> { data?: T | null; error?: { message?: string } | null }

export async function mustWrite<T = unknown>(
  query: PromiseLike<WriteResult<T>>,
  label: string,
  opts: { expectRows?: boolean } = {},
): Promise<T | null | undefined> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message ?? "erro desconhecido"}`);
  if (opts.expectRows && (!Array.isArray(data) || data.length === 0)) {
    throw new Error(`${label}: nenhuma linha gravada (sem permissão ou registo inexistente).`);
  }
  return data;
}
