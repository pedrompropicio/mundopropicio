// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/migrations/0340_issue664b_coala_sync_supplier_country.sql", "utf8");
const manual = readFileSync("supabase/manual/0340_issue664b_coala_sync_supplier_country.sql", "utf8");
const rollback = readFileSync("supabase/manual/rollback_0340_issue664b_coala_sync_supplier_country_comentado.sql", "utf8");

describe("#664b critério 1 — 0340 preparada em PGlite isolado", () => {
  it("mantém cópia exacta, sem transacção, default ou DML; rollback só comentado", () => {
    expect(Buffer.from(manual)).toEqual(Buffer.from(migration));
    const executable = migration.replace(/--[^\n]*/g, "");
    expect(executable).not.toMatch(/\b(BEGIN|COMMIT|DEFAULT|INSERT|UPDATE|DELETE)\b/i);
    expect(migration).toContain("PREPARADA, NÃO APLICADA");
    expect(executable).toMatch(/NOT VALID[\s\S]*VALIDATE CONSTRAINT/);
    expect(rollback.split("\n").every(line => !line.trim() || line.startsWith("--"))).toBe(true);
  });

  it("nasce NULL, aceita ES, recusa es/XYZ e desfaz a coluna e o CHECK", async () => {
    const db = new PGlite();
    try {
      await db.exec("CREATE TABLE public.coala_sync_config (id integer PRIMARY KEY);");
      await db.exec(migration);
      await db.exec("INSERT INTO public.coala_sync_config(id) VALUES (1);");
      expect((await db.query("SELECT new_supplier_country FROM public.coala_sync_config")).rows)
        .toEqual([{ new_supplier_country: null }]);
      await db.exec("UPDATE public.coala_sync_config SET new_supplier_country = 'ES';");
      expect((await db.query("SELECT new_supplier_country FROM public.coala_sync_config")).rows)
        .toEqual([{ new_supplier_country: "ES" }]);
      for (const value of ["es", "XYZ", ""]) {
        await expect(db.query("UPDATE public.coala_sync_config SET new_supplier_country = $1", [value]))
          .rejects.toThrow(/coala_sync_config_new_supplier_country_check/);
      }
      await db.exec(rollback.split("\n").filter(line => /^-- (ALTER|  )/.test(line))
        .map(line => line.replace(/^-- /, "")).join("\n"));
      expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'coala_sync_config'")).rows)
        .toEqual([{ column_name: "id" }]);
      expect((await db.query("SELECT conname FROM pg_constraint WHERE conname = 'coala_sync_config_new_supplier_country_check'")).rows)
        .toEqual([]);
    } finally { await db.close(); }
  }, 30000);
});
