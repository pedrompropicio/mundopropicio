/** #415 Q2-A. Projection only: inputs are canonical, already expanded Master/city lines. */
import { roundCents } from "./iva.ts";
import { reconcileDisplayValues } from "./partner-settlement-internal-report.ts";

export interface NetGross { net: number; gross: number }
export interface FamilyExcessInput {
  categoryId: string | null;
  /** Authoritative family overrun, supplied by the canonical cost composition. */
  excess: NetGross;
  locals: { cityId: string | null; planned: NetGross; realized: NetGross; sourceLineIds: string[] }[];
}
export interface AllocatedFamilyExcess {
  categoryId: string | null;
  cityId: string | null;
  label: string;
  excess: NetGross;
  localDeviation: NetGross;
  sourceLineIds: string[];
  inconsistentBases: ("net" | "gross")[];
}
const amount = (n: number) => { if (!Number.isFinite(n)) throw new Error("Invalid reconciliation amount"); return n; };
const pair = (p: NetGross) => { amount(p.net); amount(p.gross); };

/** Allocate each base independently. The existing display reconciler handles cents only. */
export function allocateFamilyExcess(inputs: readonly FamilyExcessInput[]): AllocatedFamilyExcess[] {
  if (new Set(inputs.map((i) => i.categoryId)).size !== inputs.length) throw new Error("Duplicate family category");
  return inputs.flatMap((input) => {
    pair(input.excess);
    if (input.excess.net < 0 || input.excess.gross < 0) throw new Error("Negative family excess");
    if (new Set(input.locals.map((r) => r.cityId)).size !== input.locals.length) throw new Error("Duplicate local excess perimeter");
    const rows: AllocatedFamilyExcess[] = input.locals.map((row) => {
      pair(row.planned); pair(row.realized);
      if (row.sourceLineIds.some((id) => typeof id !== "string" || !id) || new Set(row.sourceLineIds).size !== row.sourceLineIds.length) throw new Error("Invalid local provenance");
      return { categoryId: input.categoryId, cityId: row.cityId, label: row.cityId ?? "Master/não atribuído",
        excess: { net: 0, gross: 0 },
        localDeviation: { net: roundCents(row.realized.net - row.planned.net), gross: roundCents(row.realized.gross - row.planned.gross) },
        sourceLineIds: [...row.sourceLineIds], inconsistentBases: [] };
    });
    for (const basis of ["net", "gross"] as const) {
      const weights = input.locals.map((r) => r.sourceLineIds.length ? Math.max(0, r.realized[basis] - r.planned[basis]) : 0);
      const totalWeight = weights.reduce((s, n) => s + n, 0);
      const target = roundCents(input.excess[basis]);
      if (target === 0) continue;
      if (totalWeight === 0) {
        let master = rows.find((r) => r.cityId === null);
        if (!master) { master = { categoryId: input.categoryId, cityId: null, label: "Master/não atribuído", excess: { net: 0, gross: 0 }, localDeviation: { net: 0, gross: 0 }, sourceLineIds: [], inconsistentBases: [] }; rows.push(master); }
        master.excess[basis] = target;
        master.inconsistentBases.push(basis);
      } else {
        // Exclude zero weights so a cent can never be assigned to a city without positive excess.
        const indices = weights.map((w, i) => w > 0 ? i : -1).filter((i) => i !== -1);
        const allocated = reconcileDisplayValues(indices.map((i) => target * weights[i] / totalWeight), target);
        indices.forEach((i, j) => { rows[i].excess[basis] = allocated[j]; });
      }
    }
    return rows;
  });
}

export interface SettlementProjectionLine {
  id: string;
  sourceLineIds: string[];
  cityId: string | null;
  categoryId: string | null;
  kind: "expense" | "overhead" | "excess" | "revenue";
  amount: NetGross;
  /** Revenue partition has already been decided by settlement-revenue; never refill a bucket here. */
  houseOnly: boolean;
}
export interface SettlementProjectionTotals {
  expenses: NetGross;
  overhead: NetGross;
  excess: NetGross;
  eventRevenue: NetGross;
  distributableRevenue: NetGross;
  houseOnlyRevenue: NetGross;
}
const empty = (): SettlementProjectionTotals => ({ expenses: { net: 0, gross: 0 }, overhead: { net: 0, gross: 0 }, excess: { net: 0, gross: 0 }, eventRevenue: { net: 0, gross: 0 }, distributableRevenue: { net: 0, gross: 0 }, houseOnlyRevenue: { net: 0, gross: 0 } });
function totalLines(lines: readonly SettlementProjectionLine[]): SettlementProjectionTotals {
  const out = empty();
  const add = (key: keyof SettlementProjectionTotals, value: NetGross) => {
    out[key].net += value.net; out[key].gross += value.gross;
  };
  for (const l of lines) {
    if (l.kind === "revenue") { add("eventRevenue", l.amount); add(l.houseOnly ? "houseOnlyRevenue" : "distributableRevenue", l.amount); }
    else { add("expenses", l.amount); if (l.kind === "overhead") add("overhead", l.amount); if (l.kind === "excess") add("excess", l.amount); }
  }
  for (const value of Object.values(out)) { value.net = roundCents(value.net); value.gross = roundCents(value.gross); }
  return out;
}

/** Never invent split rules: a null city remains Master; totals mismatches stay explicit. */
export function reconcileSettlementProjection(lines: readonly SettlementProjectionLine[], expected: SettlementProjectionTotals) {
  if (new Set(lines.map((l) => l.id)).size !== lines.length) throw new Error("Duplicate projected line");
  for (const l of lines) {
    pair(l.amount);
    if (!l.sourceLineIds.length || new Set(l.sourceLineIds).size !== l.sourceLineIds.length) throw new Error("Missing/duplicate line provenance");
    if (l.houseOnly && l.kind !== "revenue") throw new Error("House-only expense");
  }
  Object.values(expected).forEach(pair);
  const totals = totalLines(lines);
  const group = (field: "cityId" | "categoryId") => {
    const groups = [...new Set(lines.map((l) => l[field]))].map((id) => {
      const detail = lines.filter((l) => l[field] === id);
      return { id, totals: totalLines(detail), lineIds: detail.map((l) => l.id),
        displayAdjustments: [] as { key: keyof SettlementProjectionTotals; basis: "net" | "gross"; difference: number }[] };
    });
    for (const key of Object.keys(totals) as (keyof SettlementProjectionTotals)[]) {
      for (const basis of ["net", "gross"] as const) {
        const adjusted = reconcileDisplayValues(groups.map((g) => g.totals[key][basis]), totals[key][basis]);
        groups.forEach((g, index) => {
          const difference = roundCents(adjusted[index] - g.totals[key][basis]);
          if (difference !== 0) g.displayAdjustments.push({ key, basis, difference });
          g.totals[key][basis] = adjusted[index];
        });
      }
    }
    return groups;
  };
  const mismatches = (Object.keys(totals) as (keyof SettlementProjectionTotals)[]).flatMap((key) =>
    (["net", "gross"] as const).flatMap((basis) => {
      const difference = roundCents(totals[key][basis] - expected[key][basis]);
      return difference === 0 ? [] : [{ key, basis, difference }];
    }));
  const byCity = group("cityId");
  return { totals, byCity, byCategory: group("categoryId"),
    unallocatedMaster: { label: "Master/não atribuído", totals: byCity.find((g) => g.id === null)?.totals ?? empty() },
    mismatches, ok: mismatches.length === 0 };
}
