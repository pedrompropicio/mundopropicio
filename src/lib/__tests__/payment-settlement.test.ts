import { describe, it, expect } from "vitest";
import { isSettlingPayment, settledTxIdsFrom, listItemPhase, onlySettlingPayments } from "../payment-settlement";

describe("isSettlingPayment", () => {
  it("só paid sem estorno liquida", () => {
    expect(isSettlingPayment({ status: "paid", reversed_at: null })).toBe(true);
    expect(isSettlingPayment({ status: "paid" })).toBe(true);
    expect(isSettlingPayment({ status: "cancelled", reversed_at: null })).toBe(false);
    expect(isSettlingPayment({ status: "planned", reversed_at: null })).toBe(false);
    expect(isSettlingPayment({ status: "paid", reversed_at: "2026-10-07T10:00:00Z" })).toBe(false);
    expect(isSettlingPayment(null)).toBe(false);
  });
});

describe("settledTxIdsFrom", () => {
  it("ignora cancelados e estornados (caso fe18ebe5)", () => {
    const s = settledTxIdsFrom([
      { transaction_id: "fe18ebe5", status: "cancelled", reversed_at: null },
      { transaction_id: "a", status: "paid", reversed_at: null },
      { transaction_id: "b", status: "paid", reversed_at: "2026-10-01" },
      { transaction_id: "c", status: "cancelled" },
      { transaction_id: "c", status: "paid" },
    ]);
    expect([...s].sort()).toEqual(["a", "c"]);
  });
  it("aceita vazio", () => expect(settledTxIdsFrom(undefined).size).toBe(0));
});

describe("listItemPhase", () => {
  const settled = new Set(["s"]);
  it("liquidada ganha sobre paga", () =>
    expect(listItemPhase({ txId: "s", manuallyMarkedPaid: true, settledTxIds: settled })).toBe("settled"));
  it("pagamento cancelado + marcada → Pagas por liquidar", () =>
    expect(listItemPhase({ txId: "x", txStatus: "approved", manuallyMarkedPaid: true, settledTxIds: settled })).toBe("markedPaid"));
  it("pagamento cancelado sem marca → Por pagar", () =>
    expect(listItemPhase({ txId: "x", txStatus: "approved", settledTxIds: settled })).toBe("unpaid"));
  it("tx paid sem liquidação válida → legado", () =>
    expect(listItemPhase({ txId: "x", txStatus: "paid", settledTxIds: settled })).toBe("legacy"));
});

describe("onlySettlingPayments", () => {
  it("aplica status=paid e reversed_at is null", () => {
    const calls: string[] = [];
    const q: any = {
      eq: (c: string, v: any) => (calls.push(`eq:${c}=${v}`), q),
      is: (c: string, v: any) => (calls.push(`is:${c}=${v}`), q),
    };
    onlySettlingPayments(q);
    expect(calls).toEqual(["eq:status=paid", "is:reversed_at=null"]);
  });
});
