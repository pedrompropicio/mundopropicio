/**
 * Semelhança de texto — coeficiente de Dice sobre bigramas.
 *
 * Casa única no frontend. É o mesmo motor usado pela edge function
 * `generate-historical-transactions` e pelo modal de implantação: não
 * reimplementar em mais sítio nenhum.
 */

/** Normalização usada em todo o matching: minúsculas, sem acentos, sem extremos. */
export function normalizeForMatch(s: string | null | undefined): string {
  return (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Coeficiente de Dice (0..1) entre duas descrições. */
export function stringSimilarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return 0;
  const bigrams = (s: string) => {
    const set: Record<string, number> = {};
    for (let i = 0; i < s.length - 1; i++) {
      const bi = s.substring(i, i + 2);
      set[bi] = (set[bi] || 0) + 1;
    }
    return set;
  };
  const bg1 = bigrams(na);
  const bg2 = bigrams(nb);
  let intersection = 0;
  for (const bi in bg1) {
    if (bg2[bi]) intersection += Math.min(bg1[bi], bg2[bi]);
  }
  return (2 * intersection) / (na.length - 1 + nb.length - 1);
}
