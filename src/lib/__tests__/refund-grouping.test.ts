import { describe, it, expect } from "vitest";
import { groupTransactionsByRefund, type RefundNoteSummary } from "../refund-grouping";
import { fixtures } from "@/test/seeds/refund-consolidation";

const opts = (notes: Map<string, RefundNoteSummary>) => ({
  getId: (t: any) => t.id,
  getNoteId: (t: any) => t.reimbursement_note_id ?? null,
  getAmount: (t: any) => Number(t.amount ?? 0),
  notes,
});

describe("groupTransactionsByRefund", () => {
  it("Cenário 1: lista sem reembolsos devolve só txs", () => {
    const { transactions, notes } = fixtures.scenario1;
    const out = groupTransactionsByRefund(transactions, opts(notes));
    expect(out).toHaveLength(transactions.length);
    expect(out.every((r) => r.kind === "tx")).toBe(true);
  });

  it("Cenário 2: 1 nota com 3 filhas → 1 header + 3 children, total somado", () => {
    const { transactions, notes } = fixtures.scenario2;
    const out = groupTransactionsByRefund(transactions, opts(notes));
    const header = out.find((r) => r.kind === "group-header") as any;
    expect(header).toBeTruthy();
    expect(header.childCount).toBe(3);
    expect(header.total).toBeCloseTo(60, 2);
    expect(out.filter((r) => r.kind === "group-child")).toHaveLength(3);
  });

  it("Cenário 4: várias notas misturadas com txs soltas preservam ordem original", () => {
    const { transactions, notes } = fixtures.scenario4;
    const out = groupTransactionsByRefund(transactions, opts(notes));
    // Sequência esperada: tx-solta, header(NOTE_A), 2 filhas A, header(NOTE_B), 2 filhas B, tx-solta
    expect(out[0]).toMatchObject({ kind: "tx" });
    expect(out[1]).toMatchObject({ kind: "group-header", noteId: "NOTE_A", childCount: 2 });
    expect(out[2]).toMatchObject({ kind: "group-child", noteId: "NOTE_A" });
    expect(out[3]).toMatchObject({ kind: "group-child", noteId: "NOTE_A" });
    expect(out[4]).toMatchObject({ kind: "group-header", noteId: "NOTE_B", childCount: 2 });
    expect(out[out.length - 1]).toMatchObject({ kind: "tx" });
  });

  it("Cenário 8: nota com 0 filhas (ausente do input) não é renderizada", () => {
    const { transactions, notes } = fixtures.scenario8;
    const out = groupTransactionsByRefund(transactions, opts(notes));
    expect(out.find((r) => r.kind === "group-header")).toBeUndefined();
    expect(out).toHaveLength(transactions.length);
  });

  it("retroatividade: agrupa independentemente do status da nota", () => {
    const { transactions, notes } = fixtures.scenarioRetroactive;
    const out = groupTransactionsByRefund(transactions, opts(notes));
    const headers = out.filter((r) => r.kind === "group-header") as any[];
    expect(headers).toHaveLength(4);
    const statuses = headers.map((h) => h.status).sort();
    expect(statuses).toEqual(["cancelled", "draft", "paid", "settled"]);
  });
});
