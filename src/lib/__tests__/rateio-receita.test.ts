/** #339 C — rateio multi-evento (modelo A) em RECEITAS. */
import { describe, it, expect } from "vitest";
import { excludeRateioChildren, isRateioChild, splitLegNeedsOverride, splitLegExceedsBudget } from "@/lib/rateio-children";
import { reconcileStatement } from "@/lib/bank-statement/reconcile";

const leg = { hasAnyBP: true, hasMatch: true, budget: 1000, used: 900, childAmount: 300 };

describe("#339 C — verba excedida numa perna", () => {
  it("despesa: excesso exige justificação (bloqueia como hoje)", () => {
    expect(splitLegNeedsOverride("expense", leg)).toBe(true);
  });
  it("receita: excesso é só aviso, nunca bloqueio", () => {
    expect(splitLegNeedsOverride("income", leg)).toBe(false);
    expect(splitLegExceedsBudget(leg)).toBe(true);
  });
  it("perna sem linha de BP continua a exigir justificação nos dois tipos", () => {
    const noLine = { ...leg, hasMatch: false };
    expect(splitLegNeedsOverride("expense", noLine)).toBe(true);
    expect(splitLegNeedsOverride("income", noLine)).toBe(true);
  });
  it("dentro da verba não pede nada", () => {
    expect(splitLegNeedsOverride("income", { ...leg, childAmount: 100 })).toBe(false);
    expect(splitLegNeedsOverride("expense", { ...leg, childAmount: 100 })).toBe(false);
  });
});

// Mãe income 3.000 sem evento, com conta; 3 filhas income por evento, sem conta.
const mother = { id: "m", type: "income", amount: 3000, event_id: null, account_id: "acc", parent_transaction_id: null, installment_group_id: null };
const kids = ["e1", "e2", "e3"].map((e, i) => ({ id: `k${i}`, type: "income", amount: 1000, event_id: e, account_id: null, parent_transaction_id: "m", installment_group_id: null }));

describe("#339 C — agregações neutras ao tipo", () => {
  it("empresa: conta a mãe income e não as filhas", () => {
    const rows = excludeRateioChildren([mother, ...kids]);
    expect(rows.map((r) => r.id)).toEqual(["m"]);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(3000);
  });
  it("evento: contam as filhas (a mãe não tem evento)", () => {
    const e1 = [mother, ...kids].filter((t) => t.event_id === "e1");
    expect(e1.map((t) => t.id)).toEqual(["k0"]);
    expect(kids.every(isRateioChild)).toBe(true);
  });
});

describe("#339 C — conciliação de um crédito único", () => {
  it("o crédito liga à MÃE (tem conta); filhas nunca ficam ligadas", () => {
    const txs = [
      { id: "m", account_id: "acc", description: "Receita partilhada", paid_amount: 3000, payment_date: "2026-10-20", date: "2026-10-20", status: "paid" },
    ];
    const r = reconcileStatement([{ key: "L1", description: "TRF RECEITA PARTILHADA", amount: 3000, bookingDate: "2026-10-20" }], txs as any, []);
    const m = r.matches.get("L1");
    expect(m?.transactionIds).toEqual(["m"]);
    expect([...r.explainedTransactionIds]).toEqual(["m"]);
  });
});
