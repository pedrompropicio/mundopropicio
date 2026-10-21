import { describe, expect, it } from "vitest";
import { findTransactionsWithoutBankLine, reconcileStatement, reconciliationCash,
  type ReconcileTransaction, type ReconcilePayment } from "./reconcile";

const payment = (amount: number, patch: Partial<ReconcilePayment> = {}): ReconcilePayment => ({
  account_id: "bank", amount, payment_method: "transfer", status: "paid", reversed_at: null, ...patch,
});
const txn = (patch: Partial<ReconcileTransaction> = {}): ReconcileTransaction => ({
  id: "casino", description: "Casino Estoril", paid_amount: 30996, payment_date: "2026-10-01",
  date: "2026-10-01", account_id: "bank", reconciliation_account_id: "bank",
  first_statement_from: "2026-08-31", payments: [payment(23406),
    payment(7590, { payment_method: "compensation", account_id: null })], ...patch,
});
const line = (date = "2026-10-01", amount = 23406, description = "Casino Estoril") => ({
  key: "line", description, amount, bookingDate: date,
});

describe("#336 dinheiro por conta, nunca compensação", () => {
  it("#335 Estoril: grupo aplicado conta 23406; revertido conta zero, sem fallback histórico", () => {
    const legs = [payment(23406), payment(7590, { payment_method: "compensation", account_id: null })];
    expect(reconciliationCash(txn({ payments: legs }))).toBe(23406);
    expect(reconciliationCash(txn({ payment_date: "2026-08-01", payments: legs.map((p) => ({
      ...p, status: "reversed", reversed_at: "2026-10-21",
    })) }))).toBe(0);
    expect(reconciliationCash(txn({ paid_amount: 7590, account_id: null, payments: [
      payment(7590, { payment_method: "compensation", account_id: null }),
    ] }))).toBe(0);
  });
  it("Casino: camada b casa 23.406,00 dinheiro, não 30.996,00 liquidado", () => {
    expect(reconcileStatement([line()], [txn()], []).matches.get("line")?.layer).toBe("amount");
    expect(reconcileStatement([line(undefined, 30996)], [txn()], []).counts.unmatched).toBe(1);
  });
  it("camada c mantém 23.406,00 dinheiro com data fora da janela", () => {
    expect(reconcileStatement([line("2026-10-20")], [txn()], []).matches.get("line")?.layer).toBe("description");
  });
  it("só soma pernas pagas, não revertidas, da conta, sem compensação", () => {
    expect(reconciliationCash(txn({ payments: [payment(10), payment(90, { account_id: "other" }),
      payment(20, { status: "planned" }), payment(30, { reversed_at: "2026-10-01" }),
      payment(40, { payment_method: "compensation" }), payment(50, { payment_method: null })] }))).toBe(10);
  });
  it("fronteira estrita: sem pernas antes do primeiro extrato sim; igual/depois não", () => {
    expect(reconciliationCash(txn({ payments: [], payment_date: "2026-08-30" }))).toBe(30996);
    expect(reconciliationCash(txn({ payments: [], payment_date: "2026-08-31" }))).toBe(0);
    expect(reconciliationCash(txn({ payments: [], payment_date: "2026-09-01" }))).toBe(0);
  });
  it("sem corte/leitura ou só compensação nunca recorre ao paid_amount", () => {
    expect(reconciliationCash(txn({ payments: [], first_statement_from: null }))).toBe(0);
    expect(reconciliationCash(txn({ payments: undefined }))).toBe(0);
    expect(reconciliationCash(txn({ payment_date: "2026-08-01", payments: [payment(30996, { payment_method: "compensation" })] }))).toBe(0);
  });
  it("fronteira é da própria conta", () => {
    expect(reconciliationCash(txn({ payments: [], payment_date: "2026-08-10", first_statement_from: "2026-08-04" }))).toBe(0);
    expect(reconciliationCash(txn({ payments: [], payment_date: "2026-08-10", first_statement_from: "2026-08-31" }))).toBe(30996);
    expect(reconciliationCash(txn({ payments: [], payment_date: "2026-08-01", account_id: "other" }))).toBe(0);
  });
  it("SEPA: retenção é dinheiro líquido, sem regra especial para casar", () => {
    const t = txn({ paid_amount: 1000, payments: [payment(1000, { withholding_amount: 250 })] });
    const batch = { id: "export", payment_list_id: "list", msg_id: "PAGAMENTOS-MP-01102026", total_amount: 750, transaction_ids: [t.id] };
    const result = reconcileStatement([line(undefined, -750, "LOTE TRF CRED SEPA+ 01102026")], [t], [batch]);
    expect(result.matches.get("line")?.layer).toBe("sepa");
    expect(result.retentionTotal).toBe(250);
    expect(reconcileStatement([line(undefined, -1000, "LOTE TRF CRED SEPA+")], [t], [batch]).counts.unmatched).toBe(1);
  });
  it("lista sem movimento compara dinheiro com dinheiro e exclui compensação pura", () => {
    const rows = findTransactionsWithoutBankLine([txn(), txn({ id: "comp", payments: [payment(7590, { payment_method: "compensation" })] })], new Set(), "2026-10-01", "2026-10-31");
    expect(rows.map((t) => t.id)).toEqual(["casino"]);
    expect(rows.reduce((sum, t) => sum + reconciliationCash(t), 0)).toBe(23406);
    expect(findTransactionsWithoutBankLine(rows, new Set(["casino"]), "2026-10-01", "2026-10-31")).toEqual([]);
  });
});