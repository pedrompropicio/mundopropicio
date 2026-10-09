/**
 * Espelho em TS da normalização de `public.normalize_supplier_name` e da
 * regra de `public.check_supplier_similar` (D-ERP199). A decisão real é na
 * base; isto serve para testes e para explicar o porquê no ecrã.
 */
const SUFFIXES = /\b(lda|ltda|unipessoal|sa|s a|sociedade|eireli|ou|llc|inc)\b/g;

export function normalizeSupplierName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeNif(nif: string | null | undefined): string {
  return (nif ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Trigramas como no pg_trgm (cada palavra com "  " à esquerda e " " à direita). */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.split(" ").filter(Boolean)) {
    const p = `  ${w} `;
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => tb.has(t) && inter++);
  return inter / (ta.size + tb.size - inter);
}

export function isSimilarSupplierName(a: string, b: string): boolean {
  const na = normalizeSupplierName(a);
  const nb = normalizeSupplierName(b);
  if (!na || !nb) return false;
  if (Math.min(na.length, nb.length) >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return trigramSimilarity(na, nb) >= 0.6;
}
