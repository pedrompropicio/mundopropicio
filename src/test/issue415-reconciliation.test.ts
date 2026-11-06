import { describe, it, expect } from "vitest";
import { allocateFamilyExcess, reconcileSettlementProjection, type SettlementProjectionLine, type SettlementProjectionTotals } from "@/lib/settlement-reconciliation";
const ng = (net: number, gross = net) => ({ net, gross });
const expected = (expenses: number, revenue: number, houseOnly = 0, overhead = 0, grossExpenses = expenses): SettlementProjectionTotals => ({ expenses: ng(expenses, grossExpenses), overhead: ng(overhead), excess: ng(0), eventRevenue: ng(revenue), distributableRevenue: ng(revenue - houseOnly), houseOnlyRevenue: ng(houseOnly) });
const line = (id: string, cityId: string | null, kind: SettlementProjectionLine["kind"], net: number, patch: Partial<SettlementProjectionLine> = {}): SettlementProjectionLine => ({ id, cityId, categoryId: "category", kind, amount: ng(net), houseOnly: false, sourceLineIds: [id], ...patch });
describe("#415 Q2-A reconciliation", () => {
  it("C4 §6.7: family excess zero; local comparison +30/-30 retained net/gross", () => {
    const input = [{ categoryId: "travel", excess: ng(0), locals: [
      { cityId: "A", planned: ng(100, 123), realized: ng(130, 159.9), sourceLineIds: ["bpA", "txA"] },
      { cityId: "B", planned: ng(100, 123), realized: ng(70, 86.1), sourceLineIds: ["bpB", "txB"] },
    ] }];
    const copy = structuredClone(input);
    const out = allocateFamilyExcess(input);
    expect(out.map((r) => r.excess)).toEqual([ng(0), ng(0)]);
    expect(out.map((r) => r.localDeviation)).toEqual([ng(30, 36.9), ng(-30, -36.9)]);
    expect(input).toEqual(copy);
    const projected = reconcileSettlementProjection([line("bpA", "A", "expense", 100, { amount: ng(100, 123) }), line("bpB", "B", "expense", 100, { amount: ng(100, 123) }), line("rev", null, "revenue", 300)], expected(200, 300, 0, 0, 246));
    expect(projected.ok).toBe(true);
    expect(projected.totals.expenses).toEqual(ng(200, 246));
  });
  it("C4: positive family excess proportional by local positives, net/gross independently", () => {
    const out = allocateFamilyExcess([{ categoryId: "cat", excess: ng(40, 60), locals: [
      { cityId: "A", planned: ng(100), realized: ng(130, 110), sourceLineIds: ["a"] },
      { cityId: "B", planned: ng(100), realized: ng(110, 130), sourceLineIds: ["b"] },
      { cityId: "C", planned: ng(100), realized: ng(90), sourceLineIds: ["c"] },
    ] }]);
    expect(out.map((r) => r.excess)).toEqual([ng(30, 15), ng(10, 45), ng(0)]);
  });
  it("C4: cents use existing reconciler, last absolute tie; zero-weight rows cannot get a cent", () => {
    const out = allocateFamilyExcess([{ categoryId: null, excess: ng(0.01, 0.02), locals: ["A", "B", "C"].map((cityId, i) => ({ cityId, planned: ng(0), realized: ng(i === 2 ? 0 : 1), sourceLineIds: [cityId] })) }]);
    expect(out.map((r) => r.excess)).toEqual([ng(0, 0.01), ng(0.01, 0.01), ng(0)]);
  });
  it("C4: gross-only excess retained; missing positive traceable base stays Master/inconsistent", () => {
    const out = allocateFamilyExcess([{ categoryId: "zero-net", excess: ng(0, 23), locals: [{ cityId: "A", planned: ng(100), realized: ng(100, 123), sourceLineIds: ["vat"] }] }]);
    expect(out[0].excess).toEqual(ng(0, 23));
    const missing = allocateFamilyExcess([{ categoryId: "missing", excess: ng(10, 12), locals: [] }]);
    expect(missing).toEqual([expect.objectContaining({ cityId: null, label: "Master/não atribuído", excess: ng(10, 12), inconsistentBases: ["net", "gross"] })]);
  });
  it("C4 §6.7: preexpanded revenue 75/25, overhead once, house-only partition preserved", () => {
    const lines = [line("localA", "A", "revenue", 500), line("localB", "B", "revenue", 300),
      line("masterA", "A", "revenue", 75, { sourceLineIds: ["master-income"] }), line("masterB", "B", "revenue", 25, { sourceLineIds: ["master-income"] }),
      line("mpA", "A", "revenue", 30, { houseOnly: true, sourceLineIds: ["master-house"] }), line("mpB", "B", "revenue", 10, { houseOnly: true, sourceLineIds: ["master-house"] }),
      line("costA", "A", "expense", 200), line("costB", "B", "expense", 100),
      line("ohA", "A", "overhead", 30, { sourceLineIds: ["master-overhead"] }), line("ohB", "B", "overhead", 30, { sourceLineIds: ["master-overhead"] })];
    const result = reconcileSettlementProjection(lines, expected(360, 940, 40, 60));
    expect(result.ok).toBe(true);
    expect(result.byCity.map((r) => [r.id, r.totals.distributableRevenue.net, r.totals.expenses.net, r.totals.houseOnlyRevenue.net])).toEqual([["A", 575, 230, 30], ["B", 325, 130, 10]]);
    expect(result.byCategory[0].totals).toEqual(result.totals);
    expect(result.unallocatedMaster.totals.eventRevenue.net).toBe(0);
  });
  it("C4 §6.7: Master without a split rule stays unallocated with net/gross and 100/40 partition", () => {
    const lines = [line("localA", "A", "revenue", 500), line("localB", "B", "revenue", 300), line("master", null, "revenue", 100), line("master-mp", null, "revenue", 40, { houseOnly: true }), line("costA", "A", "expense", 230), line("costB", "B", "expense", 130)];
    const result = reconcileSettlementProjection(lines, expected(360, 940, 40));
    expect(result.ok).toBe(true);
    expect(result.unallocatedMaster.totals).toMatchObject({ eventRevenue: ng(140), distributableRevenue: ng(100), houseOnlyRevenue: ng(40) });
    expect(result.byCity.reduce((s, r) => s + r.totals.eventRevenue.net, 0)).toBe(940);
  });
  it("C4: a positive local delta without source proof stays Master instead of guessing a city", () => {
    const out = allocateFamilyExcess([{ categoryId: "unknown", excess: ng(5), locals: [{ cityId: "A", planned: ng(0), realized: ng(5), sourceLineIds: [] }] }]);
    expect(out[0].excess).toEqual(ng(0));
    expect(out[1]).toMatchObject({ cityId: null, excess: ng(5), inconsistentBases: ["net", "gross"] });
  });
  it("C4: city/category display cents reconcile to the same total and record the adjustment", () => {
    const lines = [line("A", "A", "expense", 0.015, { categoryId: "a" }), line("B", "B", "expense", 0.015, { categoryId: "b" })];
    const result = reconcileSettlementProjection(lines, expected(0.03, 0));
    expect(result.ok).toBe(true);
    expect(result.byCity.map((g) => g.totals.expenses.net)).toEqual([0.02, 0.01]);
    expect(result.byCategory.map((g) => g.totals.expenses.net)).toEqual([0.02, 0.01]);
    expect(result.byCity[1].displayAdjustments).toContainEqual({ key: "expenses", basis: "net", difference: -0.01 });
  });
  it("C4: source/perimeter errors stay visible rather than redistributed as rounding", () => {
    const result = reconcileSettlementProjection([line("cost", "A", "expense", 100)], expected(99, 0));
    expect(result.ok).toBe(false);
    expect(result.mismatches).toContainEqual({ key: "expenses", basis: "net", difference: 1 });
    expect(() => reconcileSettlementProjection([line("x", null, "expense", 1), line("x", null, "expense", 1)], expected(2, 0))).toThrow(/Duplicate/);
    expect(() => reconcileSettlementProjection([line("x", null, "expense", 1, { houseOnly: true })], expected(1, 0))).toThrow(/House-only/);
    expect(() => reconcileSettlementProjection([line("x", null, "expense", NaN)], expected(1, 0))).toThrow(/amount/);
  });
});
