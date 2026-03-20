import { compareHierarchicalCodes } from "@/lib/utils";

/**
 * Utility to group transactions/forecasts by the chart of accounts hierarchy.
 * Categories have 3 levels:
 *   L1 (root): e.g. "Rendimentos", "Custos do Evento"
 *   L2 (group): e.g. "Vendas", "Artístico", "Logística"
 *   L3 (detail): e.g. "Bilheteira", "Cachês", "Aéreo"
 *
 * Reports group by L2, showing L3 as detail lines under each L2 subtotal.
 */

export interface CategoryNode {
  id: string;
  name: string;
  code: string;
  parentId?: string | null;
  parent_id?: string | null;
}

export interface CategoryLookup {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  /** L2 parent (group) name — or own name if this IS L2 */
  groupName: string;
  groupCode: string;
}

/**
 * Build a lookup map: categoryId → CategoryLookup
 * Supports both L3 (leaf) and L2 (group) category IDs in transactions.
 */
export function buildCategoryLookup(categories: CategoryNode[]): Record<string, CategoryLookup> {
  const byId: Record<string, CategoryNode> = {};
  categories.forEach((c) => { byId[c.id] = c; });

  const getParentId = (c: CategoryNode) => c.parent_id ?? c.parentId ?? null;

  const lookup: Record<string, CategoryLookup> = {};

  categories.forEach((cat) => {
    const pid = getParentId(cat);
    const parent = pid ? byId[pid] : null;
    const parentPid = parent ? getParentId(parent) : null;
    const grandParent = parentPid ? byId[parentPid] : null;

    if (grandParent) {
      // This is L3 (leaf) → group = parent (L2)
      lookup[cat.id] = {
        id: cat.id, name: cat.name, code: cat.code, parentId: pid,
        groupName: parent!.name, groupCode: parent!.code,
      };
    } else if (parent) {
      // This is L2 → group = itself
      lookup[cat.id] = {
        id: cat.id, name: cat.name, code: cat.code, parentId: pid,
        groupName: cat.name, groupCode: cat.code,
      };
    } else {
      // This is L1 (root) → group = itself
      lookup[cat.id] = {
        id: cat.id, name: cat.name, code: cat.code, parentId: null,
        groupName: cat.name, groupCode: cat.code,
      };
    }
  });

  return lookup;
}

export interface AggregatedGroup {
  groupName: string;
  groupCode: string;
  totalBase: number;
  totalIva: number;
  details: { name: string; code: string; base: number; iva: number }[];
}

/**
 * Aggregate items (transactions or forecasts) into groups by L2 category.
 * Each item must have: category_id, amount, iva_rate
 */
export function aggregateByHierarchy(
  items: any[],
  lookup: Record<string, CategoryLookup>
): AggregatedGroup[] {
  const groups: Record<string, {
    groupName: string;
    groupCode: string;
    details: Record<string, { name: string; code: string; base: number; iva: number }>;
  }> = {};

  items.forEach((item) => {
    const catInfo = lookup[item.category_id];
    const groupName = catInfo?.groupName ?? "Sem categoria";
    const groupCode = catInfo?.groupCode ?? "Z";
    const detailName = catInfo?.name ?? "Sem categoria";
    const detailCode = catInfo?.code ?? "Z.Z";

    if (!groups[groupName]) {
      groups[groupName] = { groupName, groupCode, details: {} };
    }
    const g = groups[groupName];
    if (!g.details[detailName]) {
      g.details[detailName] = { name: detailName, code: detailCode, base: 0, iva: 0 };
    }

    const amt = Number(item.amount);
    const ivaRate = Number(item.iva_rate ?? 0);
    g.details[detailName].base += amt;
    g.details[detailName].iva += amt * ivaRate / 100;
  });

  // Convert to array sorted by group code
  return Object.values(groups)
    .map((g) => ({
      groupName: g.groupName,
      groupCode: g.groupCode,
      totalBase: Object.values(g.details).reduce((s, d) => s + d.base, 0),
      totalIva: Object.values(g.details).reduce((s, d) => s + d.iva, 0),
      details: Object.values(g.details).sort((a, b) => compareHierarchicalCodes(a.code, b.code)),
    }))
    .sort((a, b) => compareHierarchicalCodes(a.groupCode, b.groupCode));
}

/**
 * Aggregate without IVA (DRE variant where IVA comes from calcAmountWithIva).
 * Returns groups with exIva, iva (calculated from withIva - exIva), incIva.
 */
export function aggregateByHierarchyDRE(
  items: any[],
  lookup: Record<string, CategoryLookup>,
  calcWithIva: (amount: number, ivaRate: number) => number
): AggregatedGroup[] {
  const groups: Record<string, {
    groupName: string;
    groupCode: string;
    details: Record<string, { name: string; code: string; base: number; iva: number }>;
  }> = {};

  items.forEach((item) => {
    const catInfo = lookup[item.category_id];
    const groupName = catInfo?.groupName ?? "Sem categoria";
    const groupCode = catInfo?.groupCode ?? "Z";
    const detailName = catInfo?.name ?? "Sem categoria";
    const detailCode = catInfo?.code ?? "Z.Z";

    if (!groups[groupName]) {
      groups[groupName] = { groupName, groupCode, details: {} };
    }
    const g = groups[groupName];
    if (!g.details[detailName]) {
      g.details[detailName] = { name: detailName, code: detailCode, base: 0, iva: 0 };
    }

    const amt = Number(item.amount);
    const ivaRate = Number(item.iva_rate ?? 23);
    const withIva = calcWithIva(amt, ivaRate);
    g.details[detailName].base += amt;
    g.details[detailName].iva += withIva - amt;
  });

  return Object.values(groups)
    .map((g) => ({
      groupName: g.groupName,
      groupCode: g.groupCode,
      totalBase: Object.values(g.details).reduce((s, d) => s + d.base, 0),
      totalIva: Object.values(g.details).reduce((s, d) => s + d.iva, 0),
      details: Object.values(g.details).sort((a, b) => compareHierarchicalCodes(a.code, b.code)),
    }))
    .sort((a, b) => compareHierarchicalCodes(a.groupCode, b.groupCode));
}
