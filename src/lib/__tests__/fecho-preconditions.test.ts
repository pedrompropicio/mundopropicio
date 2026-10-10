import { describe, it, expect } from "vitest";
import { computeFechoPreconditions, hasBlockingPrecondition } from "../fecho-preconditions";

const base = { revenue: 100, hasTicketSales: true, bpExpenseLines: 3, bpIncomeLines: 1, partners: 1, isTourCity: false, parentPartners: 0, expenses: 80 };

describe("computeFechoPreconditions (#88)", () => {
  it("evento completo → nada", () => {
    expect(computeFechoPreconditions(base)).toEqual([]);
  });
  it("sem sócios/BP/receita → bloqueia", () => {
    const r = computeFechoPreconditions({ ...base, partners: 0, bpExpenseLines: 0, revenue: 0, hasTicketSales: false });
    expect(r.filter((p) => p.level === "blocking").map((p) => p.key)).toEqual(["no_partners", "no_bp", "no_revenue"]);
    expect(hasBlockingPrecondition(r)).toBe(true);
  });
  it("cidade sem sócios próprios com sócios no pai → remete ao Master", () => {
    const r = computeFechoPreconditions({ ...base, partners: 0, isTourCity: true, parentPartners: 1 });
    expect(r[0].message).toMatch(/Master/);
  });
  it("receita muito abaixo do custo → aviso, não bloqueia", () => {
    const r = computeFechoPreconditions({ ...base, revenue: 178321.75, expenses: 598737.73 });
    expect(r.map((p) => p.key)).toContain("low_coverage");
    expect(hasBlockingPrecondition(r)).toBe(false);
  });
});
