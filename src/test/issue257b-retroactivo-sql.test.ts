// @vitest-environment node
// Exclusivamente PGlite em memória, dados sintéticos, sem credenciais ou rede.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getIvaRatesForCountry } from "@/lib/iva";

const sql = readFileSync("supabase/manual/0325_issue257_retroactivo_2026.sql", "utf8");
const rollback = readFileSync("supabase/manual/rollback_0325_issue257_retroactivo_2026_comentado.sql", "utf8");
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
    CREATE TABLE companies(id text PRIMARY KEY, display_name text, legal_name text, country text);
    CREATE TABLE suppliers(id text PRIMARY KEY, name text, country text);
    CREATE TABLE transactions(id uuid PRIMARY KEY, company_id text, supplier_id text,
      date date, type text, description text, amount numeric, iva_rate integer);
    INSERT INTO companies VALUES ('pt', 'Empresa PT', 'Denominação legal PT', 'PT');
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
    [9, null, "2026-07-01", "expense", 23],
    [10, "pt", "2026-06-01", "expense", 23],
    [11, "es", "2026-06-01", "expense", 13],
    [12, "es", "2026-06-01", "expense", 6],
  ] as const) {
    await db.query("INSERT INTO transactions(id, company_id, supplier_id, date, type, amount, iva_rate, description) VALUES ($1, 'pt', $2, $3, $4, 100, $5, $6)",
      [id(n), supplier, date, type, rate, `Lançamento ${n}`]);
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
  // E2b (base 733f3d8b8:57–61): antigo P por país do fornecedor → todas as despesas elegíveis, ordenadas pela taxa.
  it("§A inclui fornecedor ausente/local/estrangeiro e distingue 21% de 23% em PT", async () => {
    const { rows } = await db.query<{ id: string; iva_potencial: string; taxa_fora_do_pais: boolean }>(sectionA);
    expect(rows.map(row => row.id)).toEqual([id(1), id(7), id(2), id(3), id(10), id(11), id(12), id(9)]);
    expect(rows.map(row => Number(row.iva_potencial))).toEqual([21, 21, 21, 23, 23, 13, 6, 23]);
    expect(rows.map(row => row.taxa_fora_do_pais)).toEqual([true, true, true, false, false, false, false, false]);
    expect(rows[0]).toMatchObject({ empresa: "Empresa PT", descricao: "Lançamento 1", fornecedor: "Fornecedor ES", pais_fornecedor: "ES", amount: "100", iva_rate: 21 });
    expect(rows[1]).toMatchObject({ fornecedor: "Fornecedor PT", pais_fornecedor: "PT" });
    expect(rows[2]).toMatchObject({ fornecedor: "Sem país", pais_fornecedor: null });
    expect(rows[7]).toMatchObject({ descricao: "Lançamento 9", fornecedor: null, pais_fornecedor: null, iva_rate: 23 });
    expect(await marked()).toEqual([]);
  });
  // E2b (base 733f3d8b8:63–66): antigo total por empresa igual à prova §3 → grupos por empresa e taxa, somando o IVA arredondado da §A.
  it("§B conta as mesmas candidatas por empresa e taxa, incluindo fornecedor ausente", async () => {
    expect((await db.query(sectionB)).rows).toEqual([
      { company_id: "pt", company_name: "Empresa PT", iva_rate: 21, taxa_fora_do_pais: true, candidatas: 3, iva_nao_recuperavel_potencial: "63.00" },
      { company_id: "pt", company_name: "Empresa PT", iva_rate: 6, taxa_fora_do_pais: false, candidatas: 1, iva_nao_recuperavel_potencial: "6.00" },
      { company_id: "pt", company_name: "Empresa PT", iva_rate: 13, taxa_fora_do_pais: false, candidatas: 1, iva_nao_recuperavel_potencial: "13.00" },
      { company_id: "pt", company_name: "Empresa PT", iva_rate: 23, taxa_fora_do_pais: false, candidatas: 3, iva_nao_recuperavel_potencial: "69.00" },
    ]);
    expect(await marked()).toEqual([]);
  });
  it("§A/§B excluem as já marcadas sem escrever nas candidatas", async () => {
    await db.query("UPDATE transactions SET vat_non_recoverable = true WHERE id = $1", [id(1)]);
    expect((await db.query<{ id: string }>(sectionA)).rows.map(row => row.id)).toEqual([id(7), id(2), id(3), id(10), id(11), id(12), id(9)]);
    const { rows } = await db.query<{ iva_rate: number; candidatas: number; iva_nao_recuperavel_potencial: string }>(sectionB);
    expect(rows.find(row => row.iva_rate === 21)).toMatchObject({ candidatas: 2, iva_nao_recuperavel_potencial: "42.00" });
    expect(rows.reduce((sum, row) => sum + row.candidatas, 0)).toBe(7);
    expect(await marked()).toEqual([id(1)]);
  });
  it("§B reconcilia o IVA arredondado linha a linha da §A", async () => {
    await db.exec("UPDATE transactions SET amount = 100.02 WHERE iva_rate = 23");
    const details = (await db.query<{ iva_rate: number; iva_potencial: string }>(sectionA)).rows.filter(row => row.iva_rate === 23);
    expect(details.map(row => row.iva_potencial)).toEqual(["23.00", "23.00", "23.00"]);
    const summary = (await db.query<{ iva_rate: number; iva_nao_recuperavel_potencial: string }>(sectionB)).rows.find(row => row.iva_rate === 23);
    expect(summary?.iva_nao_recuperavel_potencial).toBe("69.00");
  });
  it.each([
    ["PT", "Portugal"], ["Portugal", "Portugal"],
    ["ES", "Espanha"], ["Espanha", "Espanha"], ["XX", null],
  ])("§A/§B usam a lista do selector para %s e separam empresas", async (country, selectorCountry) => {
    const companyId = `empresa-${country}`;
    await db.query("INSERT INTO companies VALUES ($1, 'Empresa AA', 'Denominação legal AA', $2)", [companyId, country]);
    const rates: readonly number[] = getIvaRatesForCountry(selectorCountry);
    for (const rate of [4, 5, 6, 9, 10, 12, 13, 16, 21, 22, 23]) {
      await db.query("INSERT INTO transactions(id, company_id, date, type, amount, iva_rate) VALUES ($1, $2, '2026-06-01', 'expense', 100, $3)", [id(100 + rate), companyId, rate]);
    }
    const details = (await db.query<{ company_id: string; iva_rate: number; taxa_fora_do_pais: boolean }>(sectionA)).rows;
    const groups = (await db.query<{ company_id: string; iva_rate: number; taxa_fora_do_pais: boolean; candidatas: number; iva_nao_recuperavel_potencial: string }>(sectionB)).rows;
    const companyDetails = details.filter(row => row.company_id === companyId);
    const companyGroups = groups.filter(row => row.company_id === companyId);
    expect(companyDetails).toHaveLength(11);
    expect(companyGroups).toHaveLength(11);
    for (const detail of companyDetails) {
      expect(detail.taxa_fora_do_pais).toBe(!rates.includes(detail.iva_rate));
      expect(companyGroups.find(group => group.iva_rate === detail.iva_rate)).toMatchObject({ taxa_fora_do_pais: detail.taxa_fora_do_pais, candidatas: 1, iva_nao_recuperavel_potencial: `${detail.iva_rate}.00` });
    }
    expect(groups.filter(row => row.company_id === "pt").find(row => row.iva_rate === 23)).toMatchObject({ candidatas: 3 });
    // Dentro de cada prioridade, Empresa AA precede Empresa PT, mesmo com datas PT anteriores.
    expect(details.filter(row => row.taxa_fora_do_pais)[0].company_id).toBe(companyId);
    expect(details.filter(row => !row.taxa_fora_do_pais)[0].company_id).toBe(companyId);
    expect(groups.filter(row => row.taxa_fora_do_pais)[0].company_id).toBe(companyId);
    expect(groups.filter(row => !row.taxa_fora_do_pais)[0].company_id).toBe(companyId);
  });
  it("§C conserva o texto original byte a byte, incluindo comentários", () => {
    expect(sql.slice(sql.indexOf("-- §C"))).toBe(`-- §C — Substituir o placeholder exclusivamente pelos ids revistos e aprovados.
-- Sem lista aprovada, o placeholder provoca erro; nunca substituir por uma query P.
-- A guarda aborta o bloco inteiro se faltar um id, houver duplicados, receita,
-- linha já marcada ou linha fora de 2026/com IVA zero. Não é reexecutável.
DO $$
DECLARE
  ids uuid[] := ARRAY[__IDS_APROVADOS__]::uuid[];
  n integer;
BEGIN
  IF coalesce(cardinality(ids), 0) = 0 THEN
    RAISE EXCEPTION '#257: lista aprovada vazia';
  END IF;

  UPDATE public.transactions
  SET vat_non_recoverable = true
  WHERE id = ANY(ids)
    AND type = 'expense'
    AND vat_non_recoverable = false
    AND date >= DATE '2026-01-01' AND date < DATE '2027-01-01'
    AND iva_rate > 0;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> cardinality(ids) THEN
    RAISE EXCEPTION '#257: contagem divergente: % linhas alteradas para % ids aprovados', n, cardinality(ids);
  END IF;
END
$$;
`);
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
