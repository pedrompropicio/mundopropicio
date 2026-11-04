// @vitest-environment node
// Exclusivamente PGlite em memória, dados sintéticos, sem credenciais ou rede.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const sql = readFileSync("supabase/manual/0325_issue257_retroactivo_2026.sql", "utf8");
const rollback = readFileSync("supabase/manual/rollback_0325_issue257_retroactivo_2026_comentado.sql", "utf8");
const proof = readFileSync("docs/testes/issue257/prova-janela.sql", "utf8");
const stripComments = (s: string) => s.replace(/--[^\n]*/g, "").trim();
const [sectionA, sectionB] = stripComments(sql).split(";");
const sectionC = sql.slice(sql.indexOf("DO $$"));
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const approve = (ids: number[]) => sectionC.replace("__IDS_APROVADOS__", ids.map(n => `'${id(n)}'`).join(", "));
let db: PGlite;
const marked = async () => (await db.query<{ id: string }>("SELECT id FROM transactions WHERE vat_non_recoverable ORDER BY id")).rows.map(r => r.id);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE companies(id text PRIMARY KEY, name text, country text);
    CREATE TABLE suppliers(id text PRIMARY KEY, name text, country text);
    CREATE TABLE transactions(id uuid PRIMARY KEY, company_id text, supplier_id text,
      date date, type text, amount numeric, iva_rate numeric);
    INSERT INTO companies VALUES ('pt', 'Empresa PT', 'PT');
    INSERT INTO suppliers VALUES ('es', 'Fornecedor ES', 'ES'), ('pt', 'Fornecedor PT', 'PT'), ('unknown', 'Sem país', NULL);
  `);
  await db.exec(readFileSync("supabase/manual/0319_issue257_vat_non_recoverable.sql", "utf8"));
}, 30_000);
beforeEach(async () => {
  await db.exec("TRUNCATE transactions");
  for (const [n, supplier, date, type, rate] of [
    [1, "es", "2026-01-01", "expense", 21],
    [2, "unknown", "2026-12-31", "expense", 21],
    // Candidata estrangeira com IVA português recuperável: a revisão deixa-a fora.
    [3, "es", "2026-06-01", "expense", 23],
    [4, "es", "2026-06-01", "income", 21],
    [5, "es", "2025-12-31", "expense", 21],
    [6, "es", "2026-06-01", "expense", 0],
    [7, "pt", "2026-06-01", "expense", 21],
    [8, "es", "2027-01-01", "expense", 21],
  ] as const) {
    await db.query("INSERT INTO transactions(id, company_id, supplier_id, date, type, amount, iva_rate) VALUES ($1, 'pt', $2, $3, $4, 100, $5)",
      [id(n), supplier, date, type, rate]);
  }
});
afterAll(async () => { await db?.close(); });

describe("#257b C3 — 0325 manual por ids aprovados", () => {
  it("mantém DML preparado, placeholder obrigatório e rollback só comentado", () => {
    expect(sql).toContain("Classe R2 — PREPARADA, NÃO APLICADA. DML; só na janela, com Sim, depois da 0319 e da lista aprovada");
    expect(sectionA.trim()).toMatch(/^SELECT /); expect(sectionB.trim()).toMatch(/^SELECT /);
    expect(stripComments(sectionC)).not.toMatch(/country|suppliers|companies/);
    expect(stripComments(sectionC)).toContain("WHERE id = ANY(ids)");
    expect(rollback.split("\n").every(line => !line || line.startsWith("-- "))).toBe(true);
  });
  it("§A devolve exatamente P, incluindo país desconhecido, sem decidir recuperabilidade", async () => {
    const { rows } = await db.query<{ id: string; iva_potencial: string }>(sectionA);
    expect(rows.map(row => row.id)).toEqual([id(1), id(3), id(2)]);
    expect(rows.map(row => Number(row.iva_potencial))).toEqual([21, 23, 21]);
    expect(await marked()).toEqual([]);
  });
  it("§B reproduz a contagem da prova §3", async () => {
    const original = stripComments(proof).split(";").filter(s => s.trim())[3];
    expect((await db.query(sectionB)).rows).toEqual((await db.query(original)).rows);
    expect((await db.query(sectionB)).rows).toEqual([{ company_id: "pt", company_name: "Empresa PT", candidatas: 3, iva_nao_recuperavel_potencial: "65.0000000000000000" }]);
  });
  it("§C com placeholder falha sem marcar qualquer linha", async () => {
    await expect(db.exec(sectionC)).rejects.toThrow(); expect(await marked()).toEqual([]);
  });
  it("marca só 2 ids revistos das 3 candidatas e o rollback descomentado repõe", async () => {
    await db.exec(approve([1, 2])); expect(await marked()).toEqual([id(1), id(2)]);
    const undo = rollback.split("\n").find(line => line.startsWith("-- UPDATE"))!.slice(3)
      .replace("__IDS_APROVADOS__", `'${id(1)}', '${id(2)}'`);
    await db.exec(undo); expect(await marked()).toEqual([]);
  });
  it.each([[1, 99], [1, 4], [1, 5], [1, 6], [1, 8], [1, 1]])(
    "lista inválida %j aborta todas as marcações por contagem", async (...ids) => {
      await expect(db.exec(approve(ids))).rejects.toThrow(/contagem divergente/); expect(await marked()).toEqual([]);
    },
  );
  it("reexecução falha por contagem, conservando as marcações anteriores", async () => {
    await db.exec(approve([1, 2]));
    await expect(db.exec(approve([1, 2]))).rejects.toThrow(/0 linhas alteradas para 2 ids/);
    expect(await marked()).toEqual([id(1), id(2)]);
    // Também reverte uma nova candidata quando outra já estava marcada.
    await expect(db.exec(approve([1, 3]))).rejects.toThrow(/contagem divergente/);
    expect(await marked()).toEqual([id(1), id(2)]);
  });
  it("lista vazia falha antes do UPDATE", async () => {
    await expect(db.exec(approve([]))).rejects.toThrow(/lista aprovada vazia/); expect(await marked()).toEqual([]);
  });
});
