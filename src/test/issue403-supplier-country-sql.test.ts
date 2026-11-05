// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/manual/0315_issue403_supplier_country.sql", "utf8");
const rollback = readFileSync("supabase/manual/rollback_0315_issue403_supplier_country_comentado.sql", "utf8");
const active = (sql: string) => sql.replace(/--[^\n]*/g, "");
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE TABLE public.companies(id text PRIMARY KEY, country text);
    CREATE TABLE public.suppliers(id text PRIMARY KEY, company_id text REFERENCES companies,
      name text, nif text, iban text, country text NOT NULL DEFAULT 'PT' CHECK (country ~ '^[A-Z]{2}$'));
    GRANT USAGE ON SCHEMA public TO authenticated, anon;
    GRANT SELECT (id, name, nif, company_id) ON public.suppliers TO authenticated;
    GRANT INSERT ON public.suppliers TO authenticated;
    INSERT INTO companies VALUES ('br','br'), ('pt','PT'), ('empty',NULL);
    INSERT INTO suppliers(id,company_id,country) VALUES ('historical','br','PT');
    CREATE FUNCTION public.fixture_company() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.company_id IS NULL THEN NEW.company_id := current_setting('fixture.company', true); END IF; RETURN NEW; END;
    $$;
    CREATE TRIGGER set_company_id_trigger BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.fixture_company();
  `);
  return db;
}
async function read(db: PGlite, sql: string) { return (await db.query(sql)).rows; }

describe("#403 / 0315 — SQL preparado; execução exclusivamente PGlite em memória", () => {
  it("mantém cópias byte a byte, um único GRANT de country e rollback só comentado", () => {
    expect(readFileSync("drizzle/migrations/0315_issue403_supplier_country.sql")).toEqual(Buffer.from(migration));
    expect(active(migration).match(/\bGRANT\b[^;]*;/gi)).toEqual(["GRANT SELECT (country) ON public.suppliers TO authenticated;"]);
    expect(active(migration)).toMatch(/ALTER COLUMN country DROP DEFAULT/);
    expect(active(migration)).toMatch(/BEFORE INSERT ON public.suppliers/);
    expect(active(migration)).not.toMatch(/\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/i);
    expect(migration).not.toContain("get_supplier_bank_details");
    expect(rollback.split("\n").filter(Boolean).every(line => line.startsWith("-- "))).toBe(true);
    expect(active(readFileSync("docs/testes/issue403/prova-janela.sql", "utf8")))
      .not.toMatch(/\b(?:INSERT|UPDATE|DELETE|BEGIN|SET|ROLLBACK)\b/i);
  });

  it("aplica duas vezes, fecha IBAN/anon, herda BR/PT e preserva ES, NOT NULL, CHECK e histórico", async () => {
    const db = await fixture();
    try {
      await db.exec(migration); await db.exec(migration);
      expect(await read(db, `SELECT has_column_privilege('authenticated','suppliers','country','SELECT') AS country,
        has_column_privilege('authenticated','suppliers','iban','SELECT') AS iban,
        has_column_privilege('anon','suppliers','country','SELECT') AS anon,
        has_function_privilege('authenticated','suppliers_default_country()','EXECUTE') AS execute`))
        .toEqual([{ country: true, iban: false, anon: false, execute: false }]);
      await db.exec("SET ROLE authenticated");
      expect(await read(db, "SELECT country FROM suppliers")).toEqual([{ country: "PT" }]);
      await expect(db.query("SELECT iban FROM suppliers")).rejects.toMatchObject({ code: "42501" });
      await db.exec(`SELECT set_config('fixture.company','br',false);
        INSERT INTO suppliers(id) VALUES ('implicit-company');
        INSERT INTO suppliers(id,company_id) VALUES ('new-br','br'),('new-pt','pt'),('fallback','empty');
        INSERT INTO suppliers(id,company_id,country) VALUES ('explicit','br','ES'),('null','br',NULL);`);
      await db.exec("RESET ROLE");
      expect(await read(db, "SELECT id,country FROM suppliers ORDER BY id")).toEqual([
        { id: "explicit", country: "ES" }, { id: "fallback", country: "PT" }, { id: "historical", country: "PT" },
        { id: "implicit-company", country: "BR" }, { id: "new-br", country: "BR" }, { id: "new-pt", country: "PT" }, { id: "null", country: "BR" },
      ]);
      await expect(db.query("INSERT INTO suppliers(id,company_id,country) VALUES ('invalid','br','br')"))
        .rejects.toMatchObject({ code: "23514" });
      expect(await read(db, `SELECT column_default, is_nullable FROM information_schema.columns
        WHERE table_name='suppliers' AND column_name='country'`)).toEqual([{ column_default: null, is_nullable: "NO" }]);
      // Só o SQL comentado do rollback é descomentado neste banco descartável.
      await db.exec(rollback.split("\n").filter(line => /^-- (DROP|ALTER|REVOKE) /.test(line)).map(line => line.slice(3)).join("\n"));
      expect(await read(db, `SELECT column_default FROM information_schema.columns
        WHERE table_name='suppliers' AND column_name='country'`)).toEqual([{ column_default: "'PT'::text" }]);
      expect(await read(db, "SELECT has_column_privilege('authenticated','suppliers','country','SELECT') AS readable"))
        .toEqual([{ readable: false }]);
      expect(await read(db, "SELECT tgname FROM pg_trigger WHERE tgrelid='suppliers'::regclass AND NOT tgisinternal")).toEqual([{ tgname: "set_company_id_trigger" }]);
    } finally { await db.close(); }
  }, 30000);

  it.each(["suppliers", "companies", "iban"])("recusa pré-condição inválida: %s", async failure => {
    const db = await fixture();
    try {
      if (failure === "iban") await db.exec("GRANT SELECT (iban) ON suppliers TO authenticated");
      else await db.exec(`ALTER TABLE ${failure} DROP COLUMN country`);
      await expect(db.exec(migration)).rejects.toMatchObject({ code: "P0001" });
    } finally { await db.close(); }
  }, 30000);
});
