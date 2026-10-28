/**
 * Divide uma lista de ids em blocos para filtros `.in()` do PostgREST.
 * Listas grandes (ex.: ~1.545 UUIDs ≈ 55 KB de URL) excedem o que os gateways
 * aceitam de forma fiável (#392). Tamanho por defeito: 200.
 */
export const IN_CHUNK_SIZE = 200;

export function chunkIds<T>(ids: T[], size: number = IN_CHUNK_SIZE): T[][] {
  if (size < 1) throw new Error("chunk size inválido");
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
