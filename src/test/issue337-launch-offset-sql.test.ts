// @vitest-environment node
// Disposable, in-process PostgreSQL only; no credentials, network DB, SQL edits or deploys.
import { PGlite } from "@electric-sql/pglite";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const company = id(1), admin = id(10), supplier = id(20), bank = id(30), cash = id(31);
const receipt = id(337101), expense = id(337102), line = id(337301);
const date = "2026-10-13";
const items = (rec = receipt, exp = expense, noMoney = false) => [
  { transaction_id: rec, mode: noMoney ? "offset" : "settle", cash_order: noMoney ? null : 1, expected_open_cents: 3099600 },
  { transaction_id: exp, mode: "offset", cash_order: null, expected_open_cents: 759000 },
];
const movement = { account_id: bank, date, amount: 23406 };
const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await rows<T>(sql, params))[0];

async function install(path: string) {
  try {
    await db.exec(readFileSync(path, "utf8"));
  } catch (error) {
    const e = error as Error & { code?: string };
    throw new Error(`${path}: ${e.code ?? ""}: ${e.message}`, { cause: error });
  }
}

async function seedPair(rec = receipt, exp = expense) {
  await db.query(`INSERT INTO public.transactions
    (id, company_id, type, description, amount, iva_rate, date, status, supplier_id)
    VALUES ($1,$3,'income','Estoril sintético: receita',30996,0,$4,'approved',$5),
           ($2,$3,'expense','Estoril sintético: despesa',7590,0,$4,'approved',$5)`,
  [rec, exp, company, date, supplier]);
}

async function execute(money: object | null = movement, documents = items(), request = id(337401)) {
  return (await one<{ result: { group_id: string; status: string; movement_amount: number } }>(
    "SELECT public.transaction_offset_execute($1::uuid,$2::uuid,$3::jsonb,$4::jsonb,$5::date) AS result",
    [request, supplier, JSON.stringify(documents), money === null ? null : JSON.stringify(money), date],
  )).result;
}

const snapshot = () => one(`SELECT
  (SELECT count(*)::int FROM public.transaction_payments) AS payments,
  (SELECT count(*)::int FROM public.transaction_offset_groups) AS groups,
  (SELECT count(*)::int FROM public.transaction_offset_items) AS items,
  (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.transactions t) AS documents,
  (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.bank_statement_lines l) AS bank_lines,
  (SELECT count(*)::int FROM public.bank_line_transactions) AS bank_links`);

beforeAll(async () => {
  // The bootstrap role cannot be demoted in PostgreSQL. Match run.sh's initdb -U supabase_admin.
  db = new PGlite({ extensions: { unaccent }, username: "supabase_admin", initDbStartParams: ["--username=supabase_admin"] });
  // Same bootstrap/deployer split as run.sh; installed functions retain their original bodies.
  await db.exec(`CREATE ROLE postgres LOGIN SUPERUSER;
    ALTER DATABASE postgres OWNER TO postgres;
    SET SESSION AUTHORIZATION postgres;
    SET check_function_bodies=off;`);
  for (const file of [
    "stub.sql", "live/dependencies.sql", "live/functions.sql", "live/triggers.sql",
    "live/phase2c-auth.sql", "live/phase2d-constraints.sql", "live/phase2c-invariant-registry.sql",
    "live/phase2d-legacy.sql", "live/phase2e-replay.sql",
  ]) await install(`supabase/tests/issue335/${file}`);
  await db.exec("SET SESSION AUTHORIZATION supabase_admin");
  await install("supabase/tests/issue335/live/phase2d-role.sql");
  await db.exec("SET SESSION AUTHORIZATION postgres");
  for (const file of [
    "20261021_issue335_offset_group_storage.INERTE.sql",
  ]) await install(`supabase/manual/${file}`);
  await install("supabase/tests/issue335/storage-only.sql");
  await db.exec("SET ROLE postgres");
  for (const file of [
    "20261021_issue335_offset_core.INERTE.sql",
    "20261021_issue335_offset_approval.INERTE.sql",
    "20261021_issue335_status.INERTE.sql",
    "20261021_issue335_offset_invariants.INERTE.sql",
    "20261021_issue335_offset_balance.INERTE.sql",
    "20261021_issue335_cash_position.INERTE.sql",
    "20261021_issue335_cash_position_invariant.INERTE.sql",
    "0301_issue401_reconcile_bank_line_devolucao.sql",
  ]) await install(`supabase/manual/${file}`);
  await db.exec("SET SESSION AUTHORIZATION supabase_admin");
}, 60000);

beforeEach(async () => {
  await db.exec(`SET SESSION AUTHORIZATION authenticated;
    BEGIN;
    SELECT set_config('request.jwt.claim.sub','${admin}',true);`);
  expect(await one("SELECT current_user AS actor, session_user AS session, auth.uid()::text AS uid, current_company_id()::text AS company")).toEqual({
    actor: "authenticated", session: "authenticated", uid: admin, company,
  });
  await seedPair();
  // A real untouched sentinel makes the launch's lack of bank writes observable.
  await db.query(`INSERT INTO public.bank_statement_lines
    (id,company_id,financial_account_id,amount,booking_date,value_date,description)
    VALUES ($1,$2,$3,23406,$4,$4,'Linha sintética preservada pelo lançamento')`, [line, company, bank, date]);
});

afterEach(async () => { await db.exec("ROLLBACK; SET SESSION AUTHORIZATION supabase_admin"); });
afterAll(async () => { await db?.close(); });

describe("#337 E2b — porta lançamento sobre o SQL original em PGlite", () => {
  it("critério 2: fecha Estoril ao cêntimo, sem caixa nem linha de banco associada", async () => {
    const before = await snapshot();
    const result = await execute();
    expect(result.status).toBe("applied");
    expect(result.movement_amount).toBe(23406);
    expect(await rows(`SELECT transaction_id::text, payment_method, amount::text, account_id::text, status
      FROM public.transaction_payments ORDER BY transaction_id, payment_method`)).toEqual([
      { transaction_id: receipt, payment_method: "compensation", amount: "7590.00", account_id: null, status: "paid" },
      { transaction_id: receipt, payment_method: "transfer", amount: "23406", account_id: bank, status: "paid" },
      { transaction_id: expense, payment_method: "compensation", amount: "7590.00", account_id: null, status: "paid" },
    ]);
    expect(await rows(`SELECT id::text, paid_amount::text, status FROM public.transactions ORDER BY id`)).toEqual([
      { id: receipt, paid_amount: "30996.00", status: "paid" },
      { id: expense, paid_amount: "7590.00", status: "paid" },
    ]);
    expect(await one(`SELECT
      coalesce(sum(amount) FILTER (WHERE account_id=$1),0)::text AS bank_total,
      count(*) FILTER (WHERE account_id=$2)::int AS cash_legs FROM public.transaction_payments`, [bank, cash]))
      .toEqual({ bank_total: "23406", cash_legs: 0 });
    expect(await one("SELECT bank_line_id, account_id::text FROM public.transaction_offset_groups WHERE id=$1", [result.group_id]))
      .toEqual({ bank_line_id: null, account_id: bank });
    const after = await snapshot();
    expect(after.bank_lines).toEqual(before.bank_lines);
    expect(after.bank_links).toBe(before.bank_links);
  });

  it.each([
    { name: "sem account_id", money: { date, amount: 23406 }, noMoney: false, error: /^invalid_movement$/ },
    { name: "conta de caixa", money: { ...movement, account_id: cash }, noMoney: false, error: /^account_not_allowed$/ },
    { name: "sem dinheiro e ambos offset", money: null, noMoney: true, error: /^Excedem 23406,00 €/ },
    { name: "um cêntimo a mais", money: { ...movement, amount: 23406.01 }, noMoney: false, error: /^Faltam 0,01 €/ },
  ])("critério 3: recusa $name sem escrita", async ({ money, noMoney, error }) => {
    const before = await snapshot();
    // Recover from a rejected PostgreSQL statement without discarding the fixture.
    await db.exec("SAVEPOINT rejected_launch");
    await expect(execute(money, items(receipt, expense, noMoney))).rejects.toThrow(error);
    await db.exec("ROLLBACK TO SAVEPOINT rejected_launch");
    expect(await snapshot()).toEqual(before);
  });

  it("critério 4: a conciliação produz a mesma repartição e só acrescenta a ligação ao banco", async () => {
    const launch = await execute();
    const bankReceipt = id(337201), bankExpense = id(337202);
    await seedPair(bankReceipt, bankExpense);
    const bankItems = items(bankReceipt, bankExpense).map((item, index) => index === 0
      ? { ...item, request_id: id(337402), supplier_id: supplier } : item);
    await db.query("SELECT public.reconcile_bank_line($1::uuid,$2::jsonb)", [line, JSON.stringify(bankItems)]);
    const bankGroup = await one<{ id: string; bank_line_id: string; status: string }>(
      "SELECT id::text, bank_line_id::text, status FROM public.transaction_offset_groups WHERE request_id=$1", [id(337402)]);
    expect(bankGroup).toEqual({ id: expect.any(String), bank_line_id: line, status: "applied" });
    const composition = (group: string) => rows(`SELECT type,open_amount::text,cash_amount::text,compensation_amount::text
      FROM public.transaction_offset_items WHERE group_id=$1 ORDER BY type`, [group]);
    expect(await composition(bankGroup.id)).toEqual(await composition(launch.group_id));
    expect(await composition(launch.group_id)).toEqual([
      { type: "expense", open_amount: "7590.00", cash_amount: "0.00", compensation_amount: "7590.00" },
      { type: "income", open_amount: "30996.00", cash_amount: "23406.00", compensation_amount: "7590.00" },
    ]);
    expect(await one("SELECT status,offset_group_id::text FROM public.bank_statement_lines WHERE id=$1", [line]))
      .toEqual({ status: "matched", offset_group_id: bankGroup.id });
    expect(await rows("SELECT transaction_id::text FROM public.bank_line_transactions WHERE line_id=$1", [line]))
      .toEqual([{ transaction_id: bankReceipt }]);
    expect(await one("SELECT bank_line_id FROM public.transaction_offset_groups WHERE id=$1", [launch.group_id]))
      .toEqual({ bank_line_id: null });
  });
});
