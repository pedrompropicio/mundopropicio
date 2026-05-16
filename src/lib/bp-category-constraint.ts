/**
 * Helpers para aplicar a regra "TX vinculada a BP só pode ter L3 do mesmo L2".
 * Defesa universal é o trigger no banco; estes helpers fornecem UX (filtragem + pré-validação).
 */
export interface CatNode { id: string; parent_id: string | null; code?: string; name?: string }

/** L2 ancestor id de uma categoria (L1→null, L2→self, L3→parent). */
export function getL2Id(catId: string | null | undefined, cats: CatNode[]): string | null {
  if (!catId) return null;
  const byId = new Map(cats.map((c) => [c.id, c]));
  const cur = byId.get(catId);
  if (!cur) return null;
  // L1: parent_id null
  if (!cur.parent_id) return null;
  const parent = byId.get(cur.parent_id);
  if (!parent) return null;
  // Se o parent é L1 (parent_id null), então cur É L2 → devolve self
  if (!parent.parent_id) return cur.id;
  // Caso contrário cur é L3 → devolve parent (L2)
  return parent.id;
}

/** True se duas categorias estão no mesmo L2 (ou são o mesmo L2). */
export function sameL2(catA: string | null, catB: string | null, cats: CatNode[]): boolean {
  const a = getL2Id(catA, cats);
  const b = getL2Id(catB, cats);
  if (!a || !b) return true; // sem info → não bloqueia
  return a === b;
}
