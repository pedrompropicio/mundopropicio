import { describe, expect, it } from "vitest";
import { offsetForecastOffer, previewTransactionOffset, type OffsetPlanItem } from "./transaction-offset-plan";
import { HISTORICAL_CASH_BOUNDARY, reconciliationCash } from "./bank-statement/reconcile";
const doc = (id: string, type: "income" | "expense", grossCents: number, cashOrder: number): OffsetPlanItem => ({ id, type, grossCents, paidCents: 0, cashOrder, supplierId: "casino", currency: "EUR" });
const four = [doc("sponsor", "income", 1230000, 0), doc("tickets", "income", 1590000, 1), doc("staff", "expense", 565000, 2), doc("room", "expense", 369000, 3)];
function allocation(items: OffsetPlanItem[], amount: number) {
  const result = previewTransactionOffset(items, amount);
  expect(result.ok).toBe(true);
  if (result.ok === false) throw new Error(result.message);
  return result.items;
}
describe("#335 pure preview", () => {
  it("four documents keep their gross and distribute 18860 without touching VAT", () => {
    const out = allocation(four, 1886000);
    expect(out.map(i => i.cashCents)).toEqual([1230000, 656000, 0, 0]);
    expect(out.map(i => i.compensationCents)).toEqual([0, 934000, 565000, 369000]);
    expect(four.map(i => i.grossCents)).toEqual([1230000, 1590000, 565000, 369000]);
  });
  it("Estoril 30996 = 23406 cash + 7590 compensation", () => {
    const out = allocation([doc("b873559f", "income", 3099600, 0), doc("0368bca9", "expense", 759000, 1)], 2340600);
    expect(out.map(i => [i.cashCents, i.compensationCents])).toEqual([[2340600, 759000], [0, 759000]]);
  });
  it("symmetric debit", () => {
    const out = allocation(four.map(i => ({ ...i, type: i.type === "income" ? "expense" : "income" })), -1886000);
    expect(out.map(i => i.cashCents)).toEqual([1230000, 656000, 0, 0]);
  });
  it("zero cash", () => {
    expect(allocation([doc("a", "income", 759000, 0), doc("b", "expense", 759000, 1)], 0).map(i => i.cashCents)).toEqual([0, 0]);
  });
  it("refuses missing cent", () => expect(previewTransactionOffset(four, 1886001)).toMatchObject({ ok: false, differenceCents: -1, message: "Faltam 0,01 €" }));
  it("refuses excess cent", () => expect(previewTransactionOffset(four, 1885999)).toMatchObject({ ok: false, differenceCents: 1, message: "Excedem 0,01 €" }));
  it("cash order is alterable", () => {
    const out = allocation(four.map(i => ({ ...i, cashOrder: i.id === "tickets" ? -1 : i.cashOrder })), 1886000);
    expect(out.find(i => i.id === "tickets")?.cashCents).toBe(1590000);
    expect(out.find(i => i.id === "sponsor")?.cashCents).toBe(296000);
  });
  it("uses remaining debt after real prior payment", () => {
    const items = [doc("a", "income", 3099600, 0), doc("b", "expense", 759000, 1)]; items[0].paidCents = 100000;
    expect(allocation(items, 2240600)[0].openCents).toBe(2999600);
  });
  it("rejects fractional cents", () => expect(previewTransactionOffset([{ ...four[0], grossCents: 1230000.1 }, ...four.slice(1)], 1886000).ok).toBe(false));
  it.each(["hasInstallments", "hasCredit", "hasFx"] as const)("rejects %s", flag => expect(previewTransactionOffset([{ ...four[0], [flag]: true }, ...four.slice(1)], 1886000)).toMatchObject({ ok: false, code: "unsupported_debt" }));
  it("rejects FX currency", () => expect(previewTransactionOffset([{ ...four[0], currency: "BRL" }, ...four.slice(1)], 1886000).ok).toBe(false));
  it("different suppliers rejected", () => expect(previewTransactionOffset([{ ...four[0], supplierId: "other" }, ...four.slice(1)], 1886000).ok).toBe(false));
  it("empty approved active BP offers creation", () => expect(offsetForecastOffer({ approved: true, active: true, linkedTransactionSupplierIds: [] }, "casino")).toBe("create"));
  it("shared BP never offers creation", () => expect(offsetForecastOffer({ approved: true, active: true, linkedTransactionSupplierIds: ["other"] }, "casino")).toBe("unavailable"));
  it("own existing transaction supersedes BP", () => expect(offsetForecastOffer({ approved: true, active: true, linkedTransactionSupplierIds: ["casino", "other"] }, "casino")).toBe("existing"));
  it("unapproved or inactive BP unavailable", () => {
    expect(offsetForecastOffer({ approved: false, active: true, linkedTransactionSupplierIds: [] }, "casino")).toBe("unavailable");
    expect(offsetForecastOffer({ approved: true, active: false, linkedTransactionSupplierIds: [] }, "casino")).toBe("unavailable");
  });
  it("#336 strict historical boundary preserved", () => {
    expect(HISTORICAL_CASH_BOUNDARY).toBe("first_bank_statement_period_from");
    const t = { id: "a", description: "", paid_amount: 30996, payment_date: null, date: "2026-08-30", payments: [], account_id: "bank", reconciliation_account_id: "bank", first_statement_from: "2026-08-31" };
    expect(reconciliationCash(t)).toBe(30996);
    expect(reconciliationCash({ ...t, date: "2026-08-31" })).toBe(0);
  });
});
