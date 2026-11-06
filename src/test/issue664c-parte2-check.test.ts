// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/migrations/0335_issue664_supplier_country_required.sql");
const split = migration.indexOf("-- PARTE 2 —");
const part2 = migration.subarray(split).toString("utf8");
const md5 = (bytes: Buffer) => createHash("md5").update(bytes).digest("hex");

// Fixtures descartáveis em memória, sem ligações externas nem credenciais.
async function fixture(countryDefinition = "text NOT NULL") {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE public.suppliers (
        id integer PRIMARY KEY,
        country ${countryDefinition},
        CONSTRAINT suppliers_country_iso2 CHECK (country ~ '^[A-Z]{2}$')
      );
      CREATE FUNCTION public.suppliers_default_country() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.country IS NULL THEN NEW.country := 'PT'; END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER suppliers_default_country_trigger
        BEFORE INSERT ON public.suppliers
        FOR EACH ROW EXECUTE FUNCTION public.suppliers_default_country();
    `);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function countryChecks(db: PGlite) {
  return (await db.query<{ conname: string; convalidated: boolean }>(`
    SELECT c.conname, c.convalidated
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'country'
    WHERE c.conrelid = 'public.suppliers'::regclass AND c.contype = 'c'
      AND a.attnum = ANY(c.conkey)
    ORDER BY c.conname
  `)).rows;
}

describe("#664c — PARTE 2 da 0335 conserva o CHECK de país existente", () => {
  it("preserva os bytes da PARTE 1 e as cópias idênticas, com rollback só comentado", () => {
    expect(split).toBeGreaterThan(0);
    expect(migration.subarray(0, split).toString("utf8").split("\n")).toHaveLength(271);
    expect(md5(migration.subarray(0, split))).toBe("6e395b5dc30487a7a53b032de0fde392");
    expect(readFileSync("supabase/manual/0335_issue664_supplier_country_required.sql")).toEqual(migration);
    expect(part2).toContain("`suppliers_country_iso2` (validado); não se recria");
    expect(part2).not.toMatch(/\b(?:ADD|VALIDATE)\s+CONSTRAINT\b/i);
    const rollback = readFileSync("supabase/manual/rollback_0335_issue664_supplier_country_required_comentado.sql", "utf8");
    expect(rollback.split("\n").every(line => !line.trim() || line.startsWith("--"))).toBe(true);
    expect(rollback).not.toMatch(/DROP CONSTRAINT[^\n]*suppliers_country_iso2/);
  });

  it("executa sem erro e mantém um único CHECK de país validado, com o mesmo OID", async () => {
    const db = await fixture();
    try {
      await db.exec("INSERT INTO suppliers(id, country) VALUES (1, 'PT'), (2, 'ES')");
      const before = await db.query("SELECT oid FROM pg_constraint WHERE conname = 'suppliers_country_iso2'");
      await db.exec(part2);
      expect(await countryChecks(db)).toEqual([{ conname: "suppliers_country_iso2", convalidated: true }]);
      expect((await db.query("SELECT oid FROM pg_constraint WHERE conname = 'suppliers_country_iso2'")).rows).toEqual(before.rows);
      expect((await db.query("SELECT to_regprocedure('public.suppliers_default_country()') AS fn")).rows).toEqual([{ fn: null }]);
      expect((await db.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.suppliers'::regclass AND NOT tgisinternal")).rows).toEqual([]);
      expect((await db.query("SELECT country FROM suppliers ORDER BY id")).rows).toEqual([{ country: "PT" }, { country: "ES" }]);
      await db.exec("INSERT INTO suppliers(id, country) VALUES (3, 'DE')");
      for (const country of ["", "es", "XYZ"]) {
        await expect(db.query("INSERT INTO suppliers(id, country) VALUES (4, $1)", [country]))
          .rejects.toMatchObject({ code: "23514", constraint: "suppliers_country_iso2" });
      }
      await expect(db.exec("INSERT INTO suppliers(id) VALUES (4)")).rejects.toMatchObject({ code: "23502" });
    } finally { await db.close(); }
  }, 30000);

  it("a pré-condição aborta com fornecedor sem país e mantém o trigger e o CHECK", async () => {
    const db = await fixture("text");
    try {
      await db.exec("INSERT INTO suppliers(id, country) VALUES (1, 'PT'); UPDATE suppliers SET country = NULL WHERE id = 1");
      await expect(db.exec(part2)).rejects.toThrow("0335: suppliers.country tem de ser NOT NULL e sem DEFAULT (0104/0315)");
      expect((await db.query("SELECT country FROM suppliers")).rows).toEqual([{ country: null }]);
      expect(await countryChecks(db)).toEqual([{ conname: "suppliers_country_iso2", convalidated: true }]);
      expect((await db.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.suppliers'::regclass AND NOT tgisinternal")).rows)
        .toEqual([{ tgname: "suppliers_default_country_trigger" }]);
      await db.exec("INSERT INTO suppliers(id) VALUES (2)");
      expect((await db.query("SELECT country FROM suppliers WHERE id = 2")).rows).toEqual([{ country: "PT" }]);
    } finally { await db.close(); }
  }, 30000);

  it("a pré-condição continua a recusar um DEFAULT silencioso", async () => {
    const db = await fixture("text NOT NULL DEFAULT 'PT'");
    try {
      await expect(db.exec(part2)).rejects.toThrow("0335: suppliers.country tem de ser NOT NULL e sem DEFAULT (0104/0315)");
      expect(await countryChecks(db)).toEqual([{ conname: "suppliers_country_iso2", convalidated: true }]);
      await db.exec("INSERT INTO suppliers(id) VALUES (1)");
      expect((await db.query("SELECT country FROM suppliers")).rows).toEqual([{ country: "PT" }]);
    } finally { await db.close(); }
  }, 30000);
});
