// @vitest-environment node
// Fixture PGlite descartável: sem credenciais, rede, homologação ou Live.
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationPath = "drizzle/migrations/0309_issue341_historico_pago_declarativo.sql";
const migration = readFileSync(migrationPath, "utf8");
const oldStatus = readFileSync("supabase/manual/20261021_issue335_status.INERTE.sql", "utf8");
const oldPaid = readFileSync("supabase/migrations/20261002120740_6be30c36-594d-4678-9477-1a3b995136ac.sql", "utf8")
  .split("\n").slice(263, 302).join("\n");
const oldReference = readFileSync("drizzle/migrations/0052_derp_remove_tx_paga_sem_linha_ref_paid_157.sql", "utf8");
const rollbackCommented = readFileSync("supabase/manual/rollback_0309_issue341_historico_pago_declarativo_comentado.sql", "utf8");
const rollback = rollbackCommented.split("\n").filter((line) => line.startsWith("--")).slice(2)
  .map((line) => line.slice(3)).join("\n");
const proof = readFileSync("docs/testes/issue341/prova-janela.sql", "utf8");
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const company = id(1000), historical = id(1001), ordinary = id(1002), child = id(1003);
let db: PGlite;
let originalDefinitions: unknown;
let originalAcl: unknown;
let baseline: unknown;
const one = async (sql: string) => (await db.query<any>(sql)).rows[0];
const state = (n: number) => one(`SELECT status, paid_amount::text, payment_date::text FROM transactions WHERE id='${id(n)}'`);
const definitions = () => one(`SELECT pg_get_functiondef('public._derive_paid_amount(uuid)'::regprocedure) AS derive,
  pg_get_functiondef('public._run_invariant_checks_paid()'::regprocedure) AS paid`);
const acl = () => one(`SELECT has_function_privilege('anon','public._derive_paid_amount(uuid)','EXECUTE') AS anon,
  has_function_privilege('authenticated','public._derive_paid_amount(uuid)','EXECUTE') AS authenticated,
  has_function_privilege('service_role','public._derive_paid_amount(uuid)','EXECUTE') AS service`);
async function transaction(run: () => Promise<void>) {
  await db.exec("BEGIN");
  try { await run(); } finally { await db.exec("ROLLBACK"); }
}
async function add(n: number, event = ordinary, extras = "") {
  await db.exec(`INSERT INTO transactions(id,event_id,company_id,type,amount,iva_rate,status,paid_amount,payment_date,account_id,date,description)
    VALUES('${id(n)}','${event}','${company}','expense',100,23,'paid',123,'2026-01-02','${id(1004)}','2026-01-01','fixture ${n}');
    ${extras ? `UPDATE transactions SET ${extras} WHERE id='${id(n)}';` : ""}`);
}
async function leg(n: number, amount: number, status = "paid") {
  await db.exec(`INSERT INTO transaction_payments(transaction_id,amount,status,payment_date)
    VALUES('${id(n)}',${amount},'${status}','2026-02-03')`);
}
async function derive(n: number) { await db.query(`SELECT public._derive_paid_amount('${id(n)}')`); }
async function ordinaryScenarios() {
  for (let n = 1; n <= 9; n++) await add(n, n === 8 ? child : ordinary);
  await leg(2, 40); await leg(3, 123);
  await db.exec(`UPDATE transactions SET parent_transaction_id='${id(90)}',split_percentage=50 WHERE id='${id(4)}';
    UPDATE transactions SET is_reimbursement=true WHERE id='${id(5)}';
    INSERT INTO partner_paid_expenses VALUES('${id(7)}');`);
  await leg(6, 123, "reversed");
  // Até um master histórico não isenta a cidade sem carimbo próprio.
  // Uma linha planned também basta para desactivar a excepção.
  await leg(9, 123, "planned");
  for (let n = 1; n <= 9; n++) await derive(n);
  return (await db.query(`SELECT id,status,paid_amount::text,payment_date::text FROM transactions ORDER BY id`)).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE companies(id uuid PRIMARY KEY, display_name text);
    CREATE TABLE events(id uuid PRIMARY KEY, company_id uuid, name text, historical_at timestamptz, parent_event_id uuid);
    CREATE TABLE transactions(id uuid PRIMARY KEY, event_id uuid, company_id uuid, type text, amount numeric,
      iva_rate numeric, status text, currency text, parent_transaction_id uuid, split_percentage numeric,
      is_reimbursement boolean DEFAULT false, paid_amount numeric, payment_date date, updated_at timestamptz DEFAULT now(),
      account_id uuid, date date, description text);
    CREATE TABLE transaction_payments(id serial PRIMARY KEY, transaction_id uuid, amount numeric, status text,
      payment_date date, closes_transaction boolean, offset_group_id uuid, reversed_at timestamptz);
    CREATE TABLE partner_paid_expenses(transaction_id uuid);
    CREATE TABLE transaction_offset_items(transaction_id uuid, group_id uuid, prior_paid_amount numeric,
      prior_status text, prior_payment_date date);
    CREATE TABLE transaction_offset_groups(id uuid, status text);
    CREATE TABLE system_invariants(name text PRIMARY KEY, description text, severity text, scope text,
      reference_count bigint, notes text, reference_updated_at timestamptz);
    CREATE FUNCTION issue335_context_valid(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION enforce_transaction_approval_permission() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN -- issue335-approval-v2l
        RETURN NEW;
      END $$;
    INSERT INTO companies VALUES('${company}','Empresa sintética');
    INSERT INTO events VALUES('${historical}','${company}','Histórico','2026-10-27',NULL),
      ('${ordinary}','${company}','Actual',NULL,NULL),('${child}','${company}','Cidade',NULL,'${historical}');`);
  // Carregar o candidato INERTE inteiro e o intervalo pedido (264–302), sem reescrever os corpos.
  await db.exec(oldStatus);
  await db.exec(oldPaid);
  await db.exec(oldReference.split("\n").find((line) => line.startsWith("UPDATE public.system_invariants SET reference_count = 157"))!);
  await db.exec(`REVOKE ALL ON FUNCTION public._derive_paid_amount(uuid) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public._derive_paid_amount(uuid) TO service_role;`);
  originalDefinitions = await definitions(); originalAcl = await acl();
  await transaction(async () => { baseline = await ordinaryScenarios(); });
}, 30_000);
afterAll(async () => { await db?.close(); });

describe.sequential("#341 — 0309 preparada em fixture PGlite", () => {
  it("1: cópia manual byte a byte, sem DML financeiro fora dos corpos originais", () => {
    const hash = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(hash(migrationPath)).toBe(hash("supabase/manual/0309_issue341_historico_pago_declarativo.sql"));
    const oldBody = oldStatus.slice(oldStatus.indexOf("CREATE OR REPLACE FUNCTION"), oldStatus.indexOf("COMMIT;"));
    const guardStart = migration.indexOf("  -- issue341-historico-v1:");
    const guardEnd = migration.indexOf("  v_gross :=", guardStart);
    const newBody = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION"), migration.indexOf("\nCREATE OR REPLACE FUNCTION public._run"));
    expect(newBody.replace(migration.slice(guardStart, guardEnd), "").trimEnd()).toBe(oldBody.trimEnd());
    const topLevel = migration.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$function\$;/g, "");
    expect(topLevel).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:public\.)?(?:transactions|transaction_payments)\b/i);
    expect(topLevel).toContain("reference_count = 0");
    expect(topLevel).toContain("6612516798");
    expect(topLevel).toContain("reference_updated_at = now()");
    expect(rollbackCommented.split("\n").every((line) => !line.trim() || line.startsWith("--"))).toBe(true);
  });

  it("2e: recusa pré-condições ausentes e mantém os objectos quando a migração aborta", async () => {
    for (const change of [
      "DROP FUNCTION public._derive_paid_amount(uuid)",
      `CREATE OR REPLACE FUNCTION public._derive_paid_amount(p_tx_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$ BEGIN RETURN; END $$`,
      "DROP FUNCTION public._run_invariant_checks_paid()",
    ]) {
      await db.exec("BEGIN");
      await db.exec(change);
      await expect(db.exec(migration.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, ""))).rejects.toThrow(/issue341:/);
      await db.exec("ROLLBACK");
      expect(await definitions()).toEqual(originalDefinitions);
    }
  });

  it("2a/e: medição anterior, aplicação sem alterações de dados, idempotência e ACL preservada", async () => {
    await add(20, historical);
    const before = await state(20);
    expect((await one("SELECT current_count::int, reference_count::int FROM _run_invariant_checks_paid()")).current_count).toBe(1);
    // Antes: deriva e perde a declaração; rollback conserva a fixture importada.
    await transaction(async () => {
      await derive(20);
      expect(await state(20)).toEqual({ status: "approved", paid_amount: "0", payment_date: null });
    });
    await db.exec(migration);
    expect(await state(20)).toEqual(before);
    const after = await definitions();
    expect(after.derive).toContain("issue335-status-v2l");
    expect(after.derive).toContain("issue341-historico-v1");
    expect(await acl()).toEqual(originalAcl);
    expect(await one(`SELECT has_function_privilege('anon','public._run_invariant_checks_paid()','EXECUTE') AS anon,
      has_function_privilege('authenticated','public._run_invariant_checks_paid()','EXECUTE') AS authenticated,
      has_function_privilege('service_role','public._run_invariant_checks_paid()','EXECUTE') AS service`))
      .toEqual({ anon: false, authenticated: false, service: true });
    const invariant = await one("SELECT current_count::int, reference_count::int, conforme FROM _run_invariant_checks_paid()");
    expect(invariant).toEqual({ current_count: 0, reference_count: 0, conforme: true });
    await db.exec(migration);
    expect(await definitions()).toEqual(after);
    expect(await one("SELECT current_count::int, reference_count::int, conforme FROM _run_invariant_checks_paid()")).toEqual(invariant);
    const full = await one(`SELECT row_to_json(t) AS tx FROM transactions t WHERE id='${id(20)}'`);
    await derive(20);
    expect(await state(20)).toEqual(before);
    expect(await one(`SELECT row_to_json(t) AS tx FROM transactions t WHERE id='${id(20)}'`)).toEqual(full);
    expect((await one("SELECT count(*)::int n FROM transaction_payments")).n).toBe(0);
    await db.exec(`DELETE FROM transactions WHERE id='${id(20)}'`);
  });

  it("2b: histórico com perna parcial segue approved e com perna total segue paid", async () => {
    await transaction(async () => {
      await add(21, historical); await leg(21, 40); await derive(21);
      expect(await state(21)).toEqual({ status: "approved", paid_amount: "40", payment_date: null });
      await leg(21, 83); await derive(21);
      expect(await state(21)).toEqual({ status: "paid", paid_amount: "123", payment_date: "2026-02-03" });
      // Decisão: apagar a última perna conserva o estado resultante, sem reconstrução.
      await db.exec(`DELETE FROM transaction_payments WHERE transaction_id='${id(21)}'`);
      await derive(21);
      expect(await state(21)).toEqual({ status: "paid", paid_amount: "123", payment_date: "2026-02-03" });
      expect((await one("SELECT count(*)::int n FROM transaction_payments")).n).toBe(0);
    });
  });

  it("2c: seis cenários não históricos iguais antes/depois, mais sócio, subevento e planned", async () => {
    await transaction(async () => {
      const after = await ordinaryScenarios();
      expect(after).toEqual(baseline);
      for (const n of [1, 6, 8, 9]) expect(await state(n)).toEqual({ status: "approved", paid_amount: "0", payment_date: null });
      expect(await state(2)).toEqual({ status: "approved", paid_amount: "40", payment_date: null });
      expect(await state(3)).toEqual({ status: "paid", paid_amount: "123", payment_date: "2026-02-03" });
      for (const n of [4, 5, 7]) expect(await state(n)).toEqual({ status: "paid", paid_amount: "123", payment_date: "2026-01-02" });
    });
  });

  it("2d: vigia exclui só histórico sem linhas; reversed/planned e cidade sem carimbo contam", async () => {
    await transaction(async () => {
      await add(30); await add(31, historical); await add(32, historical); await leg(32, 123, "reversed");
      expect((await one("SELECT current_count::int FROM _run_invariant_checks_paid()")).current_count).toBe(2);
      await add(33, historical); await leg(33, 123, "planned");
      await add(34, child);
      expect((await one("SELECT current_count::int FROM _run_invariant_checks_paid()")).current_count).toBe(4);
      for (const n of [32, 33, 34]) {
        await derive(n);
        expect(await state(n)).toEqual({ status: "approved", paid_amount: "0", payment_date: null });
      }
    });
  });

  it("2: isenções D-ERP157 mantêm-se também em históricos com linhas", async () => {
    await transaction(async () => {
      await add(35, historical, `parent_transaction_id='${id(90)}',split_percentage=50`);
      await add(36, historical, "is_reimbursement=true"); await add(37, historical);
      await db.exec(`INSERT INTO partner_paid_expenses VALUES('${id(37)}')`);
      for (const n of [35, 36, 37]) { await leg(n, 40); await derive(n); }
      for (const n of [35, 36, 37]) expect(await state(n)).toEqual({ status: "paid", paid_amount: "123", payment_date: "2026-01-02" });
      expect((await one("SELECT current_count::int FROM _run_invariant_checks_paid()")).current_count).toBe(0);
    });
  });

  it("3: prova de janela executa todas as partes, mede 157 e conserva hashes/dados/pernas", async () => {
    // Fixture separada por limpeza explícita: o guião inclui o seu próprio BEGIN/ROLLBACK.
    await db.exec(`INSERT INTO transactions(id,event_id,company_id,type,amount,iva_rate,status,paid_amount,payment_date,date,description)
      SELECT ('10000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,'${historical}','${company}',
        CASE WHEN n<=155 THEN 'expense' ELSE 'income' END,100,23,'paid',123,'2026-01-02','2026-01-01','Importada'
      FROM generate_series(1,157) n;
      UPDATE transactions SET paid_amount=125 WHERE id='10000000-0000-0000-0000-000000000157'`);
    const parts = proof.split(/-- PARTE: (?:ANTES|DEPOIS|SIMULAÇÃO)\n/).slice(1);
    expect(parts).toHaveLength(3);
    for (const part of parts.slice(0, 2)) expect(part.replace(/--[^\n]*/g, "")).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|DO|BEGIN|COMMIT|ROLLBACK|_derive_paid_amount)\b/i);
    expect(parts[2].trim()).toMatch(/^BEGIN;[\s\S]*ROLLBACK;$/);
    const beforeDefinitions = await definitions();
    const all = await db.query("SELECT row_to_json(t) tx FROM transactions t ORDER BY id");
    const beforeMigration = await definitions();
    await db.exec(rollback);
    const beforeResults = await db.exec(parts[0]);
    expect(beforeResults[1].rows.map((row: any) => Number(row.transaction_count)).reduce((a, b) => a + b, 0)).toBe(157);
    expect((beforeResults[2].rows[0] as any).current_count).toBe(157);
    expect(beforeResults[1].rows.map((row: any) => Number(row.gross_sum)).reduce((a, b) => a + b, 0)).toBe(19311);
    expect(beforeResults[4].rows[0]).toEqual({ diagnostic_paid_amount_acima_do_bruto: 1 });
    await db.exec(migration);
    expect(await definitions()).toEqual(beforeMigration);
    const afterResults = await db.exec(parts[1]);
    expect((afterResults[2].rows[0] as any).current_count).toBe(0);
    expect(afterResults[3].rows).toEqual(beforeResults[3].rows);
    const sim = await db.exec(parts[2]);
    expect(sim[2].rows).toHaveLength(157);
    expect(sim[1].rows).toEqual(sim[3].rows);
    expect(await db.query("SELECT row_to_json(t) tx FROM transactions t ORDER BY id")).toEqual(all);
    expect((await one("SELECT count(*)::int n FROM transaction_payments")).n).toBe(0);
    expect(await definitions()).toEqual(beforeDefinitions);
    await db.exec("DELETE FROM transactions");
  });

  it("2e: rollback descomentado repõe os dois corpos e notas exactas da 0052 com referência 157", async () => {
    await db.exec(rollback);
    expect(await definitions()).toEqual(originalDefinitions);
    const expectedNotes = oldReference.match(/reference_count = 157, notes = \$n\$([\s\S]*?)\$n\$/)![1];
    expect(await one("SELECT reference_count::int, notes FROM system_invariants WHERE name='paid_sem_pagamento'"))
      .toEqual({ reference_count: 157, notes: expectedNotes });
    expect(await acl()).toEqual(originalAcl);
  });
});
