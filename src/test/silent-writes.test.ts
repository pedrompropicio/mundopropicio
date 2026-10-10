import { describe, it, expect } from "vitest";
import { mustWrite } from "@/lib/must-write";
import { parseDateConflicts, withDateActions, bankDateOf } from "@/lib/bank-link-date";

describe("#196 mustWrite", () => {
  it("lança no erro da RLS", async () => {
    await expect(mustWrite(Promise.resolve({ data: null, error: { message: "new row violates row-level security policy" } }), "x.insert"))
      .rejects.toThrow(/x.insert: new row violates/);
  });
  it("0 linhas num UPDATE filtrado pela RLS → erro", async () => {
    await expect(mustWrite(Promise.resolve({ data: [], error: null }), "t.update", { expectRows: true })).rejects.toThrow(/nenhuma linha/);
  });
  it("com linhas → devolve", async () => {
    expect(await mustWrite(Promise.resolve({ data: [{ id: "a" }], error: null }), "t.update", { expectRows: true })).toEqual([{ id: "a" }]);
  });
});

describe("#233 data do banco no modo link", () => {
  it("P0410 traz as divergências", () => {
    const c = parseDateConflicts({ code: "P0410", details: JSON.stringify([{ transaction_id: "t", system_date: "2026-09-21", bank_date: "2026-09-18", amount: 10 }]) });
    expect(c?.[0].bank_date).toBe("2026-09-18");
    expect(parseDateConflicts({ code: "XX000" })).toBeNull();
  });
  it("decisão só vai nos itens link", () => {
    expect(withDateActions([{ id: "a", mode: "link", amount: 1 }, { id: "b", mode: "settle", amount: 2 }], { a: "keep", b: "align" }))
      .toEqual([{ transaction_id: "a", mode: "link", amount: 1, date_action: "keep" }, { transaction_id: "b", mode: "settle", amount: 2 }]);
  });
  it("value_date tem prioridade", () => {
    expect(bankDateOf({ value_date: "2026-09-18", booking_date: "2026-09-17" })).toBe("2026-09-18");
    expect(bankDateOf({ value_date: null, booking_date: "2026-09-17" })).toBe("2026-09-17");
  });
});
