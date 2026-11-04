// @vitest-environment node
// SQL executado apenas em PGlite em memória, com dados sintéticos e sem credenciais.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/migrations/0319_issue257_vat_non_recoverable.sql", "utf8");
const manual = readFileSync("supabase/manual/0319_issue257_vat_non_recoverable.sql", "utf8");
const rollback = readFileSync("supabase/manual/rollback_0319_issue257_vat_non_recoverable_comentado.sql", "utf8");
const proof = readFileSync("docs/testes/issue257/prova-janela.sql", "utf8");
const comment = "#257 (D-ERP347): true = IVA não recuperável (ex.: estrangeiro), vai ao custo; valor = amount × iva_rate/100. Leituras por ligar (#218/#415).";
let db: PGlite;
const column = () => db.query(`
  SELECT data_type, is_nullable, column_default FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'vat_non_recoverable'
`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE transactions(id uuid PRIMARY KEY, type text, amount numeric, iva_rate numeric);
    INSERT INTO transactions VALUES
      ('00000000-0000-0000-0000-000000000001', 'expense', 243.98, 21),
      ('00000000-0000-0000-0000-000000000002', 'income', 1000, 23);
  `);
}, 30_000);
afterAll(async () => { await db?.close(); });

describe("#257 — 0319 preparada, sem aplicação remota", () => {
  it("mantém cópias idênticas, só DDL aditivo e rollback totalmente comentado", () => {
    expect(Buffer.from(migration).equals(Buffer.from(manual))).toBe(true);
    expect(manual).toContain("Classe R2 — PREPARADA, NÃO APLICADA. Aplicar só pelo PROC-promocao com Sim");
    expect(manual.replace(/--[^\n]*/g, "").trim()).toBe(
      "ALTER TABLE public.transactions\n  ADD COLUMN IF NOT EXISTS vat_non_recoverable boolean NOT NULL DEFAULT false;\n\n" +
      `COMMENT ON COLUMN public.transactions.vat_non_recoverable IS\n  '${comment}';`,
    );
    expect(rollback.split("\n").every(line => !line || line.startsWith("-- "))).toBe(true);
    expect(rollback).toContain("-- ALTER TABLE public.transactions DROP COLUMN IF EXISTS vat_non_recoverable;");
  });

  it("não tem a coluna antes e aplica os bytes do manual à tabela com duas linhas", async () => {
    expect((await column()).rows).toEqual([]);
    await db.exec(manual);
    expect((await column()).rows).toEqual([{ data_type: "boolean", is_nullable: "NO", column_default: "false" }]);
    expect((await db.query("SELECT vat_non_recoverable FROM transactions ORDER BY id")).rows)
      .toEqual([{ vat_non_recoverable: false }, { vat_non_recoverable: false }]);
    expect((await db.query(`SELECT col_description('public.transactions'::regclass, attnum) AS comment
      FROM pg_attribute WHERE attrelid = 'public.transactions'::regclass AND attname = 'vat_non_recoverable'`)).rows)
      .toEqual([{ comment }]);
  });

  it("usa false por omissão, aceita true e rejeita NULL", async () => {
    await db.exec(`INSERT INTO transactions(id, type, amount, iva_rate)
      VALUES ('00000000-0000-0000-0000-000000000003', 'expense', 100, 23)`);
    expect((await db.query("SELECT vat_non_recoverable FROM transactions WHERE amount = 100")).rows)
      .toEqual([{ vat_non_recoverable: false }]);
    await db.exec(`INSERT INTO transactions VALUES
      ('00000000-0000-0000-0000-000000000004', 'expense', 200, 23, true)`);
    expect((await db.query("SELECT vat_non_recoverable FROM transactions WHERE amount = 200")).rows)
      .toEqual([{ vat_non_recoverable: true }]);
    await expect(db.exec(`INSERT INTO transactions VALUES
      ('00000000-0000-0000-0000-000000000005', 'expense', 300, 23, NULL)`)).rejects.toThrow(/not-null constraint/);
  });

  it("é reexecutável sem perder marcações e o rollback descomentado remove a coluna", async () => {
    await db.exec(manual);
    expect((await db.query("SELECT vat_non_recoverable FROM transactions WHERE amount = 200")).rows)
      .toEqual([{ vat_non_recoverable: true }]);
    const executableRollback = rollback.split("\n").find(line => line.startsWith("-- ALTER TABLE"))!.slice(3);
    await db.exec(executableRollback);
    expect((await column()).rows).toEqual([]);
    expect((await db.query("SELECT count(*)::int AS n FROM transactions")).rows).toEqual([{ n: 4 }]);
  });

  it("prova-janela só contém SELECT e mede antes/depois/candidatas 2026 por empresa", async () => {
    const statements = proof.replace(/--[^\n]*/g, "").split(";").map(s => s.trim()).filter(Boolean);
    expect(statements).toHaveLength(4);
    expect(statements.every(s => s.startsWith("SELECT "))).toBe(true);
    expect((await db.query(statements[0])).rows).toEqual([{ coluna_existe: false }]);
    await db.exec(manual);
    expect((await db.query(statements[1])).rows).toEqual([{ data_type: "boolean", is_nullable: "NO", column_default: "false" }]);
    expect((await db.query(statements[2])).rows).toEqual([{ total_true: 0 }]);
    await db.exec(`
      ALTER TABLE transactions ADD COLUMN company_id text, ADD COLUMN supplier_id text, ADD COLUMN date date;
      CREATE TABLE companies(id text PRIMARY KEY, name text, country text);
      CREATE TABLE suppliers(id text PRIMARY KEY, country text);
      INSERT INTO companies VALUES ('pt', 'Empresa PT', 'PT'), ('br', 'Empresa BR', 'BR');
      INSERT INTO suppliers VALUES ('es', 'ES'), ('pt', 'PT'), ('unknown', NULL);
      INSERT INTO transactions(id, type, amount, iva_rate, company_id, supplier_id, date)
      SELECT ('00000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid, type, amount, iva_rate, company_id, supplier_id, date::date
      FROM (VALUES
        (1, 'expense', 100, 21, 'pt', 'es', '2026-01-01'),
        (2, 'expense', 200, 23, 'pt', 'unknown', '2026-12-31'),
        (3, 'expense', 500, 21, 'br', 'es', '2026-06-01'),
        (4, 'income', 100, 21, 'pt', 'es', '2026-06-01'),
        (5, 'expense', 100, 0, 'pt', 'es', '2026-06-01'),
        (6, 'expense', 100, 23, 'pt', 'pt', '2026-06-01'),
        (7, 'expense', 100, 21, 'pt', 'es', '2025-12-31'),
        (8, 'expense', 100, 21, 'pt', 'es', '2027-01-01')
      ) AS fixture(n, type, amount, iva_rate, company_id, supplier_id, date);
    `);
    const rows = (await db.query<Record<string, unknown>>(statements[3])).rows;
    expect(rows.map(row => ({ ...row, iva_nao_recuperavel_potencial: Number(row.iva_nao_recuperavel_potencial) })))
      .toEqual([
        { company_id: "br", company_name: "Empresa BR", candidatas: 1, iva_nao_recuperavel_potencial: 105 },
        { company_id: "pt", company_name: "Empresa PT", candidatas: 2, iva_nao_recuperavel_potencial: 67 },
      ]);
  });
});
