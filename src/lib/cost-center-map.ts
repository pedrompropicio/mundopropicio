/**
 * #230 (D-ERP245) — mapa Centro Custo → rubrica.
 * Normalizador ÚNICO partilhado com o importador (supabase/functions/_shared/coala-centro-custo.ts).
 * A sugestão é só sugestão: grava-se em import_cost_center_map apenas quando confirmada.
 */
import { normCentroCusto, FALLBACK_CATEGORY_CODE } from "../../supabase/functions/_shared/coala-centro-custo";
import { stringSimilarity } from "@/lib/string-similarity";

export { normCentroCusto, FALLBACK_CATEGORY_CODE };

export interface CcCategory { id: string; code: string; name: string; parent_id: string | null }

export interface CcSuggestion {
  category_id: string;
  via: "historico" | "nome";
  score: number;
}

/** Só rubricas de lançamento (L3: x.y.zz) e nunca o "A Classificar". */
export const isMappableCategory = (c: CcCategory) =>
  /^\d+\.\d+\.\d+$/.test(c.code) && c.code !== FALLBACK_CATEGORY_CODE;

/**
 * Sugestão: (1) rubrica mais usada à mão nas linhas importadas com o mesmo
 * centro (≥ 60% das linhas classificadas), senão (2) maior semelhança de nome
 * (Dice ≥ 0,5 sobre o nome normalizado da L3, ou da L2 pai).
 */
export function suggestCategoryForCostCenter(
  costCenter: string,
  categories: CcCategory[],
  history: Array<{ category_id: string | null }> = [],
): CcSuggestion | null {
  const cc = normCentroCusto(costCenter);
  if (!cc) return null;
  const mappable = categories.filter(isMappableCategory);
  const ids = new Set(mappable.map((c) => c.id));

  const counts = new Map<string, number>();
  let total = 0;
  for (const h of history) {
    if (!h.category_id || !ids.has(h.category_id)) continue;
    counts.set(h.category_id, (counts.get(h.category_id) ?? 0) + 1);
    total++;
  }
  if (total > 0) {
    const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (n / total >= 0.6) return { category_id: best, via: "historico", score: n / total };
  }

  const byId = new Map(categories.map((c) => [c.id, c]));
  let bestName: CcSuggestion | null = null;
  for (const c of mappable) {
    const own = stringSimilarity(cc, normCentroCusto(c.name));
    const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
    const viaParent = parent ? stringSimilarity(cc, normCentroCusto(parent.name)) * 0.9 : 0;
    const score = Math.max(own, viaParent);
    if (score >= 0.5 && (!bestName || score > bestName.score)) bestName = { category_id: c.id, via: "nome", score };
  }
  return bestName;
}

/** Ordem do importador: mapa confirmado → nome exacto da rubrica → null (A Classificar). */
export function resolveCostCenter(
  costCenter: string | null | undefined,
  map: Map<string, string>,
  categories: CcCategory[],
): string | null {
  const cc = normCentroCusto(costCenter);
  if (!cc) return null;
  const hit = map.get(cc);
  if (hit) return hit;
  return categories.find((c) => c.parent_id != null && normCentroCusto(c.name) === cc)?.id ?? null;
}
