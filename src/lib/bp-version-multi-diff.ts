/**
 * Multi-version diff engine: compares 2-4 BP version snapshots side-by-side.
 *
 * Output is a hierarchical tree (L1 group → L2 category → forecast rows) with
 * per-version values and totals, plus a global summary. Designed for the
 * BPVersionsCompareModal "multi" mode and PDF export.
 */
import type { ForecastSnapshot } from "./bp-version-diff";
import type { CategoryLookup } from "./category-hierarchy";

export interface MultiDiffVersionMeta {
  id: string;
  label: string;
}

export interface MultiDiffCell {
  amount: number | null; // null when forecast id absent in this version
  ivaRate: number | null;
  description: string | null;
}

export interface MultiDiffRow {
  forecastId: string;
  type: "income" | "expense";
  description: string; // best-known description (latest version with the row)
  categoryId: string | null;
  cells: MultiDiffCell[]; // index aligned with versions[]
  /** True when at least 2 versions have differing amount or one is missing */
  hasDifferences: boolean;
}

export interface MultiDiffCategoryGroup {
  /** L2 category code/name (group level used for sub-totals) */
  groupCode: string;
  groupName: string;
  rows: MultiDiffRow[];
  /** Totals per version: signed (income +, expense -) handled by caller */
  totalsBase: number[];
}

export interface MultiDiffSummary {
  versions: MultiDiffVersionMeta[];
  income: number[];
  expense: number[];
  result: number[]; // income - expense
  rowCount: number;
}

export interface MultiDiffResult {
  groups: MultiDiffCategoryGroup[];
  summary: MultiDiffSummary;
}

interface MultiDiffInput {
  versions: MultiDiffVersionMeta[];
  /** Forecast snapshots indexed by version id */
  snapshotsByVersion: Record<string, ForecastSnapshot[]>;
  lookup: Record<string, CategoryLookup>;
}

export function buildMultiDiff(input: MultiDiffInput): MultiDiffResult {
  const { versions, snapshotsByVersion, lookup } = input;
  const versionIndex = new Map(versions.map((v, i) => [v.id, i]));

  // Collect every forecast id across all versions.
  const rowsById = new Map<string, MultiDiffRow>();
  for (const v of versions) {
    const list = snapshotsByVersion[v.id] ?? [];
    const idx = versionIndex.get(v.id)!;
    for (const f of list) {
      let row = rowsById.get(f.id);
      if (!row) {
        row = {
          forecastId: f.id,
          type: f.type,
          description: f.description,
          categoryId: f.category_id,
          cells: versions.map(() => ({ amount: null, ivaRate: null, description: null })),
          hasDifferences: false,
        };
        rowsById.set(f.id, row);
      }
      row.cells[idx] = {
        amount: Number(f.amount) || 0,
        ivaRate: Number(f.iva_rate) || 0,
        description: f.description,
      };
      // Always keep the most recent description (later versions in the list win)
      row.description = f.description || row.description;
      row.type = f.type;
      row.categoryId = f.category_id ?? row.categoryId;
    }
  }

  // Compute hasDifferences per row.
  for (const row of rowsById.values()) {
    const presentAmounts = row.cells
      .map((c) => c.amount)
      .filter((a): a is number => a !== null);
    const allPresent = presentAmounts.length === row.cells.length;
    if (!allPresent) {
      row.hasDifferences = true;
      continue;
    }
    const min = Math.min(...presentAmounts);
    const max = Math.max(...presentAmounts);
    row.hasDifferences = Math.abs(max - min) >= 0.005;
  }

  // Group rows by L2 category.
  const groupsMap = new Map<string, MultiDiffCategoryGroup>();
  for (const row of rowsById.values()) {
    const cat = row.categoryId ? lookup[row.categoryId] : null;
    const key = cat?.groupCode ?? "_sem_categoria";
    const name = cat?.groupName ?? "Sem categoria";
    let g = groupsMap.get(key);
    if (!g) {
      g = {
        groupCode: key,
        groupName: name,
        rows: [],
        totalsBase: versions.map(() => 0),
      };
      groupsMap.set(key, g);
    }
    g.rows.push(row);
    row.cells.forEach((c, i) => {
      if (c.amount != null) g!.totalsBase[i] += c.amount;
    });
  }

  // Sort groups (sem categoria last) and rows by description.
  const groups = Array.from(groupsMap.values()).sort((a, b) => {
    if (a.groupCode === "_sem_categoria") return 1;
    if (b.groupCode === "_sem_categoria") return -1;
    return a.groupCode.localeCompare(b.groupCode);
  });
  for (const g of groups) {
    g.rows.sort((a, b) => (a.description || "").localeCompare(b.description || ""));
  }

  // Summary.
  const income = versions.map(() => 0);
  const expense = versions.map(() => 0);
  for (const row of rowsById.values()) {
    row.cells.forEach((c, i) => {
      if (c.amount == null) return;
      if (row.type === "income") income[i] += c.amount;
      else expense[i] += c.amount;
    });
  }
  const result = income.map((inc, i) => inc - expense[i]);

  return {
    groups,
    summary: {
      versions,
      income,
      expense,
      result,
      rowCount: rowsById.size,
    },
  };
}
