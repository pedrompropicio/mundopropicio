// @vitest-environment node
// PGlite efémero, sem credenciais, rede ou aplicação a uma base externa.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migrationPath = "drizzle/migrations/0315_issue403_supplier_country.sql";
const manualPath = "supabase/manual/0315_issue403_supplier_country.sql";
const rollbackPath = "supabase/manual/rollback_0315_issue403_supplier_country_comentado.sql";
const migration = readFileSync(manualPath, "utf8");
const rollback = readFileSync(rollbackPath, "utf8");
const executable = (sql: string) => sql.replace(/--[^\n]*/g, "");
const uncommentRollback = () => rollback.split("\n").map(line => line.replace(/^-- ?/, "")).slice(3).join("\n");
const br = "10000000-0000-0000-0000-000000000001";
const pt = "10000000-0000-0000-0000-000000000002";
const noCountry = "10000000-0000-0000-0000-000000000003";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE TABLE public.companies(id uuid PRIMARY KEY, country text);
    CREATE TABLE public.suppliers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text,
      company_id uuid REFERENCES public.companies(id), country text NOT NULL DEFAULT 'PT',
      nif text, iban text, CONSTRAINT suppliers_country_iso2 CHECK (country ~ '^[A-Z]{2}$'));
    INSERT INTO public.companies VALUES ('${br}', 'br'), ('${pt}', 'PT'), ('${noCountry}', NULL);
    INSERT INTO public.suppliers(name, company_id) VALUES ('existente', '${br}');
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT SELECT(id, name, nif, company_id), INSERT, UPDATE ON public.suppliers TO authenticated;
    -- O trigger existente pode preencher a empresa quando o modal a omite.
    CREATE FUNCTION public.set_company_id_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.company_id IS NULL THEN NEW.company_id := '${br}'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.suppliers
      FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();
  `);
}, 30000);
afterAll(async () => { await db?.close(); });

describe.sequential("#403 / 0315 — preparação do país do fornecedor", () => {
  it("C1: cópias byte-idênticas, um único GRANT restrito a country, sem DML ou RPC", () => {
    expect(readFileSync(migrationPath)).toEqual(readFileSync(manualPath));
    const sql = executable(migration);
    expect(sql.match(/\bGRANT\b[^;]*;/gi)).toEqual([
      "GRANT SELECT (country) ON public.suppliers TO authenticated;",
    ]);
    expect(sql).toMatch(/ALTER COLUMN country DROP DEFAULT/i);
    expect(sql).toMatch(/BEFORE INSERT ON public\.suppliers/i);
    expect(sql).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
    expect(sql).not.toMatch(/get_supplier_bank_details|DROP\s+(?:NOT NULL|CONSTRAINT)/i);
    expect(rollback.trim().split("\n").every(line => line.startsWith("-- "))).toBe(true);
    const proof = readFileSync("docs/testes/issue403/prova-janela.sql", "utf8");
    expect(executable(proof)).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|BEGIN|ROLLBACK|SET)\b/i);
    expect(proof.match(/^-- UPDATE /gm)).toHaveLength(2);
  });

  it("C2: aplica duas vezes sem alterar os dados existentes, default nulo e um só trigger", async () => {
    await db.exec(migration);
    await db.exec(migration);
    expect((await db.query("SELECT country FROM public.suppliers WHERE name = 'existente'")).rows).toEqual([{ country: "PT" }]);
    expect((await db.query(`SELECT column_default, is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='suppliers' AND column_name='country'`)).rows)
      .toEqual([{ column_default: null, is_nullable: "NO" }]);
    expect((await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.suppliers'::regclass
      AND tgname='zz_suppliers_default_country' AND NOT tgisinternal`)).rows).toHaveLength(1);
  });

  it("C2: authenticated lê country/nif mas não iban; anon continua sem acesso", async () => {
    expect((await db.query(`SELECT
      has_column_privilege('authenticated','public.suppliers','country','SELECT') AS country,
      has_column_privilege('authenticated','public.suppliers','nif','SELECT') AS nif,
      has_column_privilege('authenticated','public.suppliers','iban','SELECT') AS iban,
      has_column_privilege('anon','public.suppliers','country','SELECT') AS anon,
      has_function_privilege('anon','public.suppliers_default_country()','EXECUTE') AS anon_execute,
      has_function_privilege('authenticated','public.suppliers_default_country()','EXECUTE') AS auth_execute`)).rows)
      .toEqual([{ country: true, nif: true, iban: false, anon: false, anon_execute: false, auth_execute: false }]);
    await db.exec("SET ROLE authenticated");
    try {
      expect((await db.query("SELECT country FROM public.suppliers")).rows).toEqual([{ country: "PT" }]);
      await expect(db.query("SELECT iban FROM public.suppliers")).rejects.toMatchObject({ code: "42501" });
    } finally { await db.exec("RESET ROLE"); }
  });

  it("C2: INSERT autenticado herda BR/PT, preserva ES explícito e tem último recurso PT", async () => {
    await db.exec("SET ROLE authenticated");
    try {
      for (const [company, expected] of [[br, "BR"], [pt, "PT"], [noCountry, "PT"]]) {
        const result = await db.query("INSERT INTO public.suppliers(name, company_id) VALUES ('teste', $1) RETURNING country", [company]);
        expect(result.rows).toEqual([{ country: expected }]);
      }
      expect((await db.query(`INSERT INTO public.suppliers(name, company_id, country)
        VALUES ('explícito', '${br}', 'ES') RETURNING country`)).rows).toEqual([{ country: "ES" }]);
      expect((await db.query("INSERT INTO public.suppliers(name) VALUES ('empresa pelo trigger') RETURNING country")).rows)
        .toEqual([{ country: "BR" }]);
      await expect(db.query(`INSERT INTO public.suppliers(name, company_id, country)
        VALUES ('inválido', '${br}', 'br')`)).rejects.toMatchObject({ code: "23514" });
      await expect(db.query("UPDATE public.suppliers SET country = NULL WHERE name = 'teste'"))
        .rejects.toMatchObject({ code: "23502" });
    } finally { await db.exec("RESET ROLE"); }
  });

  it("C1–2: pré-condições abortam com IBAN legível ou qualquer coluna country ausente", async () => {
    for (const setup of [
      "GRANT SELECT (iban) ON public.suppliers TO authenticated",
      "ALTER TABLE public.suppliers DROP COLUMN country",
      "ALTER TABLE public.companies DROP COLUMN country",
    ]) {
      await db.exec("BEGIN");
      try {
        await db.exec(setup);
        // O BEGIN interno em transacção existente não confirma alterações.
        await expect(db.exec(migration)).rejects.toThrow(/0315:/);
      } finally { await db.exec("ROLLBACK"); }
    }
    expect((await db.query("SELECT count(*)::int AS n FROM public.suppliers")).rows[0]).toEqual({ n: 6 });
  });

  it("C2: rollback descomentado repõe DEFAULT PT, revoga leitura e retira trigger/função", async () => {
    await db.exec(uncommentRollback());
    expect((await db.query(`SELECT column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='suppliers' AND column_name='country'`)).rows)
      .toEqual([{ column_default: "'PT'::text" }]);
    expect((await db.query(`SELECT has_column_privilege('authenticated','public.suppliers','country','SELECT') AS allowed,
      to_regprocedure('public.suppliers_default_country()') AS fn`)).rows).toEqual([{ allowed: false, fn: null }]);
    expect((await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.suppliers'::regclass
      AND tgname='zz_suppliers_default_country'`)).rows).toEqual([]);
    expect((await db.query(`INSERT INTO public.suppliers(name, company_id) VALUES ('depois', '${br}') RETURNING country`)).rows)
      .toEqual([{ country: "PT" }]);
  });
});
