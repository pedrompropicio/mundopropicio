// @vitest-environment node
// 0286: o pagamento de uma nota de reembolso nunca entra no resultado (PGlite).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";

const SQL = readFileSync("supabase/manual/0286_reembolso_pagamento_fora_resultado.sql", "utf8");
const TRIGGERS = SQL.slice(0, SQL.indexOf("-- 3) Registo da invariante"));
const INVARIANT_BODY = SQL.slice(SQL.indexOf("-- 4) Invariante"));
const BLOCK_QUERY = `SELECT count(*)::int AS n FROM public.reimbursement_notes rn
  JOIN public.transactions t ON t.id = rn.payment_transaction_id
 WHERE t.exclude_from_result IS DISTINCT FROM true`;
const PROPAGATE = readFileSync("supabase/migrations/20260507210701_579d5c11-d4ca-436e-bd0c-a57f052d5862.sql", "utf8");

let db: PGlite;
const NOTE = "40000000-0000-0000-0000-000000000001";
const PAY = "50000000-0000-0000-0000-000000000001";
const ITEM = "50000000-0000-0000-0000-000000000002";

const flag = async (id: string) =>
  (await db.query<{ e: boolean | null }>(`select exclude_from_result e from transactions where id='${id}'`)).rows[0]?.e;
const snapshot = async (id: string) =>
  (await db.query(`select amount, status, paid_amount, payment_date, iva_rate from transactions where id='${id}'`)).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE transactions(id uuid PRIMARY KEY, type text, status text, amount numeric, iva_rate integer,
    paid_amount numeric, payment_date date, exclude_from_result boolean DEFAULT false, updated_at timestamptz);
  CREATE TABLE reimbursement_notes(id uuid PRIMARY KEY, code text, status text, payment_transaction_id uuid,
    paid_at timestamptz, updated_at timestamptz);
  CREATE TABLE reimbursement_note_items(reimbursement_note_id uuid, transaction_id uuid);`);
  await db.exec(PROPAGATE);
  await db.exec(TRIGGERS);
});
afterAll(async () => db.close());

beforeEach(async () => {
  await db.exec(`DELETE FROM reimbursement_note_items; DELETE FROM reimbursement_notes; DELETE FROM transactions;
  INSERT INTO transactions(id,type,status,amount,iva_rate,paid_amount) VALUES
    ('${ITEM}','expense','approved',100,23,0);
  INSERT INTO reimbursement_notes(id,code,status) VALUES('${NOTE}','R-T/2026','approved');
  INSERT INTO reimbursement_note_items VALUES('${NOTE}','${ITEM}');`);
});

it("ligar um pagamento novo à nota marca-o fora do resultado", async () => {
  await db.exec(`INSERT INTO transactions(id,type,status,amount,iva_rate,paid_amount,exclude_from_result)
    VALUES('${PAY}','expense','approved',123,0,0,false);
    UPDATE reimbursement_notes SET status='pending_payment', payment_transaction_id='${PAY}' WHERE id='${NOTE}';`);
  expect(await flag(PAY)).toBe(true);
  expect(Number((await snapshot(PAY)).amount)).toBe(123);
  expect(Number((await db.query<{ n: number }>(BLOCK_QUERY)).rows[0].n)).toBe(0);
});

it("transação criada antes e ligada depois também fica fora do resultado", async () => {
  await db.exec(`INSERT INTO transactions(id,type,status,amount,iva_rate,paid_amount,exclude_from_result)
    VALUES('${PAY}','expense','approved',123,0,0,null);`);
  expect(await flag(PAY)).toBe(null);
  await db.exec(`INSERT INTO reimbursement_notes(id,code,status,payment_transaction_id)
    VALUES('40000000-0000-0000-0000-000000000009','R-X/2026','pending_payment','${PAY}');`);
  expect(await flag(PAY)).toBe(true);
});

it("enquanto ligada, a transação não pode voltar ao resultado", async () => {
  await db.exec(`INSERT INTO transactions(id,type,status,amount,iva_rate,paid_amount) VALUES('${PAY}','expense','approved',123,0,0);
    UPDATE reimbursement_notes SET payment_transaction_id='${PAY}' WHERE id='${NOTE}';`);
  await expect(db.exec(`UPDATE transactions SET exclude_from_result=false WHERE id='${PAY}'`)).rejects.toThrow(/reembolso/);
  expect(await flag(PAY)).toBe(true);
});

it("depois de desligada (reabrir nota), a flag pode mudar", async () => {
  await db.exec(`INSERT INTO transactions(id,type,status,amount,iva_rate,paid_amount) VALUES('${PAY}','expense','approved',123,0,0);
    UPDATE reimbursement_notes SET payment_transaction_id='${PAY}' WHERE id='${NOTE}';
    UPDATE reimbursement_notes SET payment_transaction_id=null, status='draft' WHERE id='${NOTE}';
    UPDATE transactions SET exclude_from_result=false WHERE id='${PAY}';`);
  expect(await flag(PAY)).toBe(false);
});

it("liquidar o pagamento continua a pagar itens e nota, sem mudar valores", async () => {
  await db.exec(`INSERT INTO transactions(id,type,status,amount,iva_rate,paid_amount) VALUES('${PAY}','expense','approved',123,0,0);
    UPDATE reimbursement_notes SET status='pending_payment', payment_transaction_id='${PAY}' WHERE id='${NOTE}';
    UPDATE transactions SET status='paid', paid_amount=123, payment_date='2026-10-28' WHERE id='${PAY}';`);
  const item = await snapshot(ITEM);
  expect(item.status).toBe("paid");
  // valor do item vem do propagate (não tocado pela 0286)
  const note = (await db.query<{ status: string }>(`select status from reimbursement_notes where id='${NOTE}'`)).rows[0];
  expect(note.status).toBe("paid");
  expect(Number((await snapshot(PAY)).paid_amount)).toBe(123);
  expect(await flag(PAY)).toBe(true);
  expect(await flag(ITEM)).toBe(false); // o custo continua no item
});

it("o bloco da invariante conta 1 quando a flag está errada (caso forçado)", async () => {
  await db.exec(`ALTER TABLE transactions DISABLE TRIGGER trg_reimbursement_payment_guard_exclude;
    ALTER TABLE reimbursement_notes DISABLE TRIGGER trg_reimbursement_payment_force_exclude;
    INSERT INTO transactions(id,type,status,amount,iva_rate,paid_amount,exclude_from_result) VALUES('${PAY}','expense','paid',123,0,123,false);
    UPDATE reimbursement_notes SET payment_transaction_id='${PAY}' WHERE id='${NOTE}';
    ALTER TABLE transactions ENABLE TRIGGER trg_reimbursement_payment_guard_exclude;
    ALTER TABLE reimbursement_notes ENABLE TRIGGER trg_reimbursement_payment_force_exclude;`);
  expect(Number((await db.query<{ n: number }>(BLOCK_QUERY)).rows[0].n)).toBe(1);
});

it("o bloco novo da invariante usa o mesmo predicado e referência 0", () => {
  expect(INVARIANT_BODY).toContain("t.exclude_from_result IS DISTINCT FROM true");
  expect(INVARIANT_BODY).toContain("WHERE i.name = 'reembolso_pagamento_no_resultado'");
  expect(SQL).toMatch(/'reembolso_pagamento_no_resultado'[\s\S]*'error', 'empresa', 0/);
});
