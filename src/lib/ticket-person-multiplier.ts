/**
 * Lotes "Promo - 2x" vendem 1 bilhete = 2 pessoas.
 * Usado APENAS para contagem de público (não afecta capacidade nem receita).
 * Detecção por nome: contém "2x" como token (ex.: "Lote 3 | Promo - 2x ...").
 */
export function getPersonMultiplier(name?: string | null): number {
  if (!name) return 1;
  // Aceita "2x", "2 x", "2X" no início ou após separador não-alfanumérico.
  return /(^|[^a-z0-9])2\s*x(\b|[^a-z0-9])/i.test(name) ? 2 : 1;
}
