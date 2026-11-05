// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("drizzle/migrations/0335_issue664_supplier_country_required.sql");
const split = migration.indexOf("-- PARTE 2 —");
const part1 = migration.slice(0, split), part2 = migration.slice(split);
const rollback = read("supabase/manual/rollback_0335_issue664_supplier_country_required_comentado.sql");
const uncomment = (sql: string) => sql.split("\n").map(line => line.replace(/^-- ?/, "")).join("\n");
const legacy = read("drizzle/migrations/0048_derp201_supplier_similarity_flags.sql");
const oldRpcs = legacy.slice(legacy.indexOf("CREATE OR REPLACE FUNCTION public._supplier_resolve_or_create("), legacy.indexOf("-- Invariante"));
const company = "00000000-0000-0000-0000-000000000001";
const noCountry = "00000000-0000-0000-0000-000000000002";
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${company}'::uuid $$;
    CREATE FUNCTION public.current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${company}'::uuid $$;
    CREATE FUNCTION public.has_role(uuid, text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TABLE public.companies(id uuid PRIMARY KEY, country text);
    CREATE TABLE public.suppliers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
      company_id uuid NOT NULL REFERENCES companies, nif text, iban text,
      is_active boolean NOT NULL DEFAULT true, category text, notes text,
      country text NOT NULL DEFAULT 'PT');
    CREATE TABLE supplier_similarity_flags(company_id uuid, supplier_id uuid, similar_supplier_id uuid, motivo text, source text);
    INSERT INTO companies VALUES ('${company}', 'BR'), ('${noCountry}', NULL);
    CREATE FUNCTION public._supplier_similar_candidates(uuid, text, text, uuid)
    RETURNS TABLE(id uuid, motivo text, is_active boolean) LANGUAGE sql AS $$
      SELECT s.id, 'nif'::text, s.is_active FROM suppliers s
      WHERE s.company_id = $1 AND s.id IS DISTINCT FROM $4 AND s.nif = $3
    $$;
  `);
  await db.exec(read("drizzle/migrations/0302_issue403_supplier_foreign_accounts.sql"));
  // Prova que a 0335 lê o nome real em vez de adivinhar o nome gerado pela 0302.
  await db.exec("ALTER TABLE suppliers RENAME CONSTRAINT suppliers_tax_id_type_check TO fixture_actual_tax_check");
  await db.exec(read("drizzle/migrations/0315_issue403_supplier_country.sql"));
  await db.exec(oldRpcs);
  return db;
}
async function scalar<T>(db: PGlite, sql: string) {
  return Object.values((await db.query<Record<string, T>>(sql)).rows[0])[0];
}

describe("#664 / 0335 — SQL só em PGlite descartável, sem credenciais", () => {
  it("mantém cópia byte a byte, duas partes, rollback integral comentado e prova só SELECT", () => {
    expect(read("supabase/manual/0335_issue664_supplier_country_required.sql")).toBe(migration);
    expect(split).toBeGreaterThan(0);
    expect(migration).toContain("PREPARADA, NÃO APLICADA");
    expect(migration).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(rollback.split("\n").filter(Boolean).every(line => line.startsWith("--"))).toBe(true);
    const trigger0315 = read("drizzle/migrations/0315_issue403_supplier_country.sql").split("CREATE OR REPLACE FUNCTION public.suppliers_default_country()")[1];
    expect(uncomment(rollback)).toContain("CREATE OR REPLACE FUNCTION public.suppliers_default_country()" + trigger0315);
    const proof = read("docs/testes/issue664/prova-janela-0335.sql").replace(/--[^\n]*/g, "");
    expect(proof).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|DO|BEGIN|SET|CALL|ALTER|DROP)\b/i);
    expect(proof).toContain("md5(pg_get_functiondef(p.oid))");
    expect(proof).toContain("a.attnotnull");
  });

  it("preserva os corpos e ACL da 0048 e o teste RLS vivo salvo o país", () => {
    const begin = part1.indexOf("CREATE OR REPLACE FUNCTION public._supplier_resolve_or_create(");
    const end = part1.indexOf("CREATE OR REPLACE FUNCTION public.get_or_create_generic_camarim_supplier(");
    const restored = part1.slice(begin, end)
      .replaceAll(", p_country text DEFAULT NULL)", ")")
      .replace("(name, nif, company_id, is_active, country)", "(name, nif, company_id, is_active)")
      .replace(", nullif(upper(btrim(p_country)), ''))", ")")
      .replace(", p_source, p_country)", ", p_source)")
      .replaceAll("_supplier_resolve_or_create(uuid, text, text, text, text)", "_supplier_resolve_or_create(uuid, text, text, text)")
      .replaceAll("public.supplier_resolve_or_create(text, text, text, text)", "public.supplier_resolve_or_create(text, text, text)");
    expect(restored.trim()).toBe(oldRpcs.trim());
    const currentRls = read("supabase/baseline/live-only/functions__public.run_rls_isolation_test__119a6fab28.sql");
    const pattern = /CREATE OR REPLACE FUNCTION public.run_rls_isolation_test\(\)[\s\S]*?\$function\$\s*;/;
    expect(part1.match(pattern)?.[0].replace("(name, company_id, country)", "(name, company_id)")
      .replace("VALUES ('FAKE_RLS_TEST', v_mp_id, 'PT')", "VALUES ('FAKE_RLS_TEST', v_mp_id)"))
      .toBe(currentRls.match(pattern)?.[0]);
  });

  it("PARTE 1 mantém ambas as RPCs antigas sem país via trigger e aceita sem_nif no CHECK real", async () => {
    const db = await fixture();
    try {
      await db.exec(part1);
      await db.query(`SELECT supplier_resolve_or_create('Legado UI', NULL, 'sponsors_import')`);
      await db.query(`SELECT _supplier_resolve_or_create('${company}', 'Legado edge', NULL, 'apply_coala_bp')`);
      expect((await db.query("SELECT country FROM suppliers ORDER BY name")).rows).toEqual([{ country: "BR" }, { country: "BR" }]);
      await db.exec(`INSERT INTO suppliers(name,company_id,country,tax_id_type) VALUES ('Sem NIF','${company}','ES','sem_nif')`);
      await expect(db.exec(`INSERT INTO suppliers(name,company_id,country,tax_id_type) VALUES ('Inválido','${company}','ES','inventado')`))
        .rejects.toMatchObject({ code: "23514" });
      expect(await scalar(db, `SELECT conname FROM pg_constraint WHERE conrelid='suppliers'::regclass AND conname='fixture_actual_tax_check'`)).toBe("fixture_actual_tax_check");
      expect(await scalar(db, `SELECT has_function_privilege('anon','supplier_resolve_or_create(text,text,text,text)','EXECUTE')`)).toBe(false);
      expect(await scalar(db, `SELECT has_function_privilege('authenticated','supplier_resolve_or_create(text,text,text,text)','EXECUTE')`)).toBe(true);
      expect(await scalar(db, `SELECT has_function_privilege('authenticated','_supplier_resolve_or_create(uuid,text,text,text,text)','EXECUTE')`)).toBe(false);
      expect(await scalar(db, `SELECT has_function_privilege('service_role','_supplier_resolve_or_create(uuid,text,text,text,text)','EXECUTE')`)).toBe(true);
    } finally { await db.close(); }
  }, 30000);

  it("PARTE 2 recusa país omitido (23502) e inválido (23514); ES e RPCs explícitas gravam, sem alterar os existentes", async () => {
    const db = await fixture();
    try {
      await db.exec(`INSERT INTO suppliers(name, company_id, country) VALUES ('Histórico', '${company}', 'PT')`);
      await db.exec(part1); await db.exec(part2);
      await expect(db.exec(`INSERT INTO suppliers(name,company_id) VALUES ('Sem país','${company}')`)).rejects.toMatchObject({ code: "23502" });
      for (const country of ["", "es", "XYZ"]) {
        await expect(db.exec(`INSERT INTO suppliers(name,company_id,country) VALUES ('Inválido','${company}','${country}')`)).rejects.toMatchObject({ code: "23514" });
      }
      await db.exec(`INSERT INTO suppliers(name,company_id,country) VALUES ('Explícito','${company}','ES')`);
      await db.query(`SELECT supplier_resolve_or_create('Nova UI', NULL, 'sponsors_import', ' es ')`);
      await db.query(`SELECT _supplier_resolve_or_create('${company}','Nova edge',NULL,'apply_coala_bp','ES')`);
      await expect(db.query(`SELECT supplier_resolve_or_create('Sem país UI', NULL, 'sponsors_import')`)).rejects.toMatchObject({ code: "23502" });
      await expect(db.query(`SELECT _supplier_resolve_or_create('${company}','Sem país edge',NULL,'apply_coala_bp',' ')`)).rejects.toMatchObject({ code: "23502" });
      expect((await db.query("SELECT name,country FROM suppliers ORDER BY name")).rows).toEqual([
        { name: "Explícito", country: "ES" }, { name: "Histórico", country: "PT" }, { name: "Nova UI", country: "ES" }, { name: "Nova edge", country: "ES" },
      ]);
      expect(await scalar(db, `SELECT to_regprocedure('public.suppliers_default_country()')`)).toBe(null);
      expect(await scalar(db, `SELECT count(*)::int FROM pg_trigger WHERE tgname='suppliers_default_country_trigger'`)).toBe(0);
      expect(await scalar(db, `SELECT convalidated FROM pg_constraint WHERE conname='suppliers_country_iso2_check'`)).toBe(true);
      // Sem mudar a reutilização de um NIF activo.
      await db.exec(`UPDATE suppliers SET nif='synthetic-tax' WHERE name='Nova UI'`);
      const reused = await scalar<{ reused: boolean }>(db, `SELECT supplier_resolve_or_create('Reutilizar','synthetic-tax','sponsors_import','BR')`);
      expect(reused.reused).toBe(true);
    } finally { await db.close(); }
  }, 30000);

  it("genérico de camarim usa país explícito da empresa; empresa sem país não cria", async () => {
    const db = await fixture();
    try {
      await db.exec(part1); await db.exec(part2);
      const id = await scalar<string>(db, `SELECT get_or_create_generic_camarim_supplier('${company}')`);
      expect(await scalar(db, `SELECT country FROM suppliers WHERE id='${id}'`)).toBe("BR");
      expect(await scalar(db, `SELECT get_or_create_generic_camarim_supplier('${company}')`)).toBe(id);
      await expect(db.query(`SELECT get_or_create_generic_camarim_supplier('${noCountry}')`)).rejects.toThrow("empresa sem país válido");
      expect(await scalar(db, `SELECT count(*)::int FROM suppliers WHERE company_id='${noCountry}'`)).toBe(0);
    } finally { await db.close(); }
  }, 30000);

  it("rollback descomentado repõe exactamente a 0315 e as assinaturas antigas da 0048", async () => {
    const db = await fixture();
    try {
      await db.exec(part1); await db.exec(part2);
      const rollbackSql = uncomment(rollback);
      await db.exec(rollbackSql.slice(rollbackSql.indexOf("DO $rollback_precondition$")));
      await db.exec(`INSERT INTO suppliers(name,company_id) VALUES ('Após rollback','${company}')`);
      expect(await scalar(db, "SELECT country FROM suppliers WHERE name='Após rollback'")).toBe("BR");
      await db.query(`SELECT supplier_resolve_or_create('RPC reposta', NULL, 'sponsors_import')`);
      expect(await scalar(db, `SELECT to_regprocedure('public.supplier_resolve_or_create(text,text,text,text)')`)).toBe(null);
      expect(await scalar(db, `SELECT to_regprocedure('public.suppliers_default_country()') IS NOT NULL`)).toBe(true);
    } finally { await db.close(); }
  }, 30000);

  it("precondição recusa country nullable em vez de fingir a garantia 23502", async () => {
    const db = await fixture();
    try {
      await db.exec("ALTER TABLE suppliers ALTER COLUMN country DROP NOT NULL");
      await expect(db.exec(part1)).rejects.toThrow("NOT NULL e sem DEFAULT");
    } finally { await db.close(); }
  }, 30000);
});
