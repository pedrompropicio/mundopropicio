/**
 * #299: o invariante tabelas_acima_de_1000 compara por NOME com a lista vigiada.
 * A lista vive em dois sítios — o JSON (teste postgrest-row-limit) e o array da
 * função na base (última migração com WATCHED_TABLES_BEGIN/END). Têm de bater.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import largeTables from "../postgrest-large-tables.json";

const DIR = resolve(__dirname, "../../../drizzle/migrations");

describe("lista de tabelas grandes espelhada na base", () => {
  it("JSON = array da última migração do invariante", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
    let last: string | null = null;
    for (const f of files) {
      const s = readFileSync(join(DIR, f), "utf8");
      const m = s.match(/WATCHED_TABLES_BEGIN\s*\n--\s*(.+?)\s*\n--\s*WATCHED_TABLES_END/s);
      if (m) last = m[1];
    }
    expect(last, "migração com WATCHED_TABLES em falta").not.toBeNull();
    const db = [...last!.matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).sort();
    const json = [...(largeTables as { tables: string[] }).tables].sort();
    expect(db).toEqual(json);
  });
});
