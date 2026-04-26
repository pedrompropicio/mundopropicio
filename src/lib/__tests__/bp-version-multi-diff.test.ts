import { describe, it, expect } from "vitest";
import { buildMultiDiff, type ForecastSnapshot } from "../bp-version-multi-diff";
import type { CategoryLookup } from "../category-hierarchy";

// Helper to build a snapshot quickly.
function fc(
  id: string,
  type: "income" | "expense",
  description: string,
  amount: number,
  categoryId: string | null = "cat-bilheteira",
  iva = 23
): ForecastSnapshot {
  return {
    id,
    type,
    description,
    specification: null,
    amount,
    iva_rate: iva,
    status: "approved",
    category_id: categoryId,
  };
}

const lookup: Record<string, CategoryLookup> = {
  "cat-bilheteira": {
    id: "cat-bilheteira",
    name: "Bilheteira",
    code: "1.1.1",
    parentId: "cat-vendas",
    groupName: "Vendas",
    groupCode: "1.1",
  },
  "cat-cache": {
    id: "cat-cache",
    name: "Cachês",
    code: "2.1.1",
    parentId: "cat-artistico",
    groupName: "Artístico",
    groupCode: "2.1",
  },
};

describe("buildMultiDiff", () => {
  it("aligns rows by forecast id across versions and computes per-version totals", () => {
    const v1 = "v1";
    const v2 = "v2";
    const result = buildMultiDiff({
      versions: [
        { id: v1, label: "v1" },
        { id: v2, label: "v2" },
      ],
      snapshotsByVersion: {
        [v1]: [
          fc("f-bilh", "income", "Bilhetes", 10000, "cat-bilheteira"),
          fc("f-cache", "expense", "Cachê DJ", 3000, "cat-cache"),
        ],
        [v2]: [
          fc("f-bilh", "income", "Bilhetes", 12000, "cat-bilheteira"),
          fc("f-cache", "expense", "Cachê DJ", 3500, "cat-cache"),
        ],
      },
      lookup,
    });

    expect(result.summary.income).toEqual([10000, 12000]);
    expect(result.summary.expense).toEqual([3000, 3500]);
    expect(result.summary.result).toEqual([7000, 8500]);
    expect(result.summary.rowCount).toBe(2);
  });

  it("flags hasDifferences when amounts differ between versions", () => {
    const r = buildMultiDiff({
      versions: [
        { id: "a", label: "a" },
        { id: "b", label: "b" },
      ],
      snapshotsByVersion: {
        a: [fc("f1", "expense", "X", 100)],
        b: [fc("f1", "expense", "X", 150)],
      },
      lookup,
    });
    const row = r.groups[0].rows.find((x) => x.forecastId === "f1")!;
    expect(row.hasDifferences).toBe(true);
  });

  it("does NOT flag hasDifferences when amounts are equal (within 0.005)", () => {
    const r = buildMultiDiff({
      versions: [
        { id: "a", label: "a" },
        { id: "b", label: "b" },
      ],
      snapshotsByVersion: {
        a: [fc("f1", "expense", "X", 100)],
        b: [fc("f1", "expense", "X", 100.001)],
      },
      lookup,
    });
    const row = r.groups[0].rows.find((x) => x.forecastId === "f1")!;
    expect(row.hasDifferences).toBe(false);
  });

  it("flags hasDifferences when row exists in one version but not the other", () => {
    const r = buildMultiDiff({
      versions: [
        { id: "a", label: "a" },
        { id: "b", label: "b" },
      ],
      snapshotsByVersion: {
        a: [fc("f1", "expense", "Only A", 100)],
        b: [],
      },
      lookup,
    });
    const row = r.groups[0].rows.find((x) => x.forecastId === "f1")!;
    expect(row.hasDifferences).toBe(true);
    expect(row.cells[0].amount).toBe(100);
    expect(row.cells[1].amount).toBeNull();
  });

  it("groups rows by L2 category (groupCode)", () => {
    const r = buildMultiDiff({
      versions: [{ id: "a", label: "a" }],
      snapshotsByVersion: {
        a: [
          fc("f1", "income", "Bilh", 100, "cat-bilheteira"),
          fc("f2", "expense", "Cachê", 50, "cat-cache"),
        ],
      },
      lookup,
    });
    expect(r.groups).toHaveLength(2);
    const codes = r.groups.map((g) => g.groupCode).sort();
    expect(codes).toEqual(["1.1", "2.1"]);
  });

  it("places 'sem categoria' last in the groups order", () => {
    const r = buildMultiDiff({
      versions: [{ id: "a", label: "a" }],
      snapshotsByVersion: {
        a: [
          fc("f1", "income", "Bilh", 100, "cat-bilheteira"),
          fc("f2", "expense", "Sem cat", 50, null),
        ],
      },
      lookup,
    });
    expect(r.groups[r.groups.length - 1].groupCode).toBe("_sem_categoria");
  });

  it("supports up to 4 versions and computes correct cell alignment", () => {
    const r = buildMultiDiff({
      versions: [
        { id: "v1", label: "v1" },
        { id: "v2", label: "v2" },
        { id: "v3", label: "v3" },
        { id: "v4", label: "v4" },
      ],
      snapshotsByVersion: {
        v1: [fc("f1", "expense", "X", 100)],
        v2: [fc("f1", "expense", "X", 200)],
        v3: [], // missing in v3
        v4: [fc("f1", "expense", "X", 400)],
      },
      lookup,
    });
    const row = r.groups[0].rows[0];
    expect(row.cells.map((c) => c.amount)).toEqual([100, 200, null, 400]);
    expect(row.hasDifferences).toBe(true);
    expect(r.summary.expense).toEqual([100, 200, 0, 400]);
  });

  it("uses the latest non-empty description for the row label", () => {
    const r = buildMultiDiff({
      versions: [
        { id: "v1", label: "v1" },
        { id: "v2", label: "v2" },
      ],
      snapshotsByVersion: {
        v1: [fc("f1", "expense", "Antigo", 100)],
        v2: [fc("f1", "expense", "Atualizado", 100)],
      },
      lookup,
    });
    expect(r.groups[0].rows[0].description).toBe("Atualizado");
  });

  it("handles empty input safely", () => {
    const r = buildMultiDiff({
      versions: [{ id: "a", label: "a" }],
      snapshotsByVersion: { a: [] },
      lookup,
    });
    expect(r.groups).toEqual([]);
    expect(r.summary.income).toEqual([0]);
    expect(r.summary.expense).toEqual([0]);
    expect(r.summary.result).toEqual([0]);
    expect(r.summary.rowCount).toBe(0);
  });

  it("computes group totalsBase correctly per version", () => {
    const r = buildMultiDiff({
      versions: [
        { id: "a", label: "a" },
        { id: "b", label: "b" },
      ],
      snapshotsByVersion: {
        a: [
          fc("f1", "income", "B1", 100, "cat-bilheteira"),
          fc("f2", "income", "B2", 200, "cat-bilheteira"),
        ],
        b: [
          fc("f1", "income", "B1", 150, "cat-bilheteira"),
          fc("f2", "income", "B2", 250, "cat-bilheteira"),
        ],
      },
      lookup,
    });
    const grp = r.groups.find((g) => g.groupCode === "1.1")!;
    expect(grp.totalsBase).toEqual([300, 400]);
  });
});
