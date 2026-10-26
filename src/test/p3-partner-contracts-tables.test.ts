// @vitest-environment node
// P3 passo 1 — estrutura das tabelas (0271) em PGlite, sem Live.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SQL = readFileSync("supabase/manual/0271_p3_partner_contracts_tables.sql", "utf8");
let db: PGlite;
const ids = { s: "", p: "", e: "", sup: "" };

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION is_platform_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE TABLE events(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE suppliers(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE event_settlements(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE event_settlement_participants(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());`);
  await db.exec(SQL);
  for (const [k, t] of [["s", "event_settlements"], ["p", "event_settlement_participants"], ["e", "events"], ["sup", "suppliers"]] as const)
    ids[k] = (await db.query<any>(`INSERT INTO ${t} DEFAULT VALUES RETURNING id`)).rows[0].id;
}, 60000);
afterAll(async () => { await db?.close(); });

const ins = async (extra: Record<string, string>) => {
  const base: Record<string, string> = {
    company_id: "gen_random_uuid()", settlement_id: `'${ids.s}'`, participant_id: `'${ids.p}'`, event_id: `'${ids.e}'`,
    beneficiary_supplier_id: `'${ids.sup}'`, gross: "1000", withholding_applies: "false", due_date: "'2026-11-30'", ...extra,
  };
  try { await db.query(`INSERT INTO partner_payment_contracts(${Object.keys(base)}) VALUES (${Object.values(base)})`); return "ok"; }
  catch (e) { return (e as Error).message; }
};

describe("P3 passo 1 — tabelas", () => {
  it("contrato simples aceite, sentido 'out' por defeito", async () => {
    expect(await ins({})).toBe("ok");
  });
  it("retenção sem resposta Sim/Não é recusada (sem pré-seleção)", async () => {
    expect(await ins({ withholding_applies: "NULL" })).toMatch(/null/i);
  });
  it("vencimento obrigatório", async () => { expect(await ins({ due_date: "NULL" })).toMatch(/null/i); });
  it("sentido 'in' ainda não é aceite (P4)", async () => { expect(await ins({ direction: "'in'" })).toMatch(/check/i); });
  it("retenção Sim exige taxa e vencimento", async () => {
    expect(await ins({ withholding_applies: "true" })).toMatch(/ppc_withholding_shape/);
    expect(await ins({ withholding_applies: "true", withholding_rate: "25", withholding_amount: "250", withholding_due_date: "'2026-12-20'" })).toBe("ok");
  });
  it("retenção Não não pode ter valor de retenção", async () => {
    expect(await ins({ withholding_amount: "10" })).toMatch(/ppc_withholding_shape/);
  });
  it("retenção + adiantamentos não passam o bruto; bruto > 0", async () => {
    expect(await ins({ advances_amount: "1000.01" })).toMatch(/ppc_amounts/);
    expect(await ins({ gross: "0" })).toMatch(/check/i);
  });
  it("RLS ligada e só SELECT para authenticated", async () => {
    const r = (await db.query<any>(`SELECT relrowsecurity FROM pg_class WHERE relname='partner_payment_contracts'`)).rows[0];
    expect(r.relrowsecurity).toBe(true);
    const g = (await db.query<any>(`SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name='partner_payment_contracts' AND grantee='authenticated'`)).rows;
    expect(g.map((x) => x.privilege_type)).toEqual(["SELECT"]);
    const a = (await db.query<any>(`SELECT count(*)::int c FROM information_schema.role_table_grants WHERE table_name='partner_payment_contracts' AND grantee='anon'`)).rows[0];
    expect(a.c).toBe(0);
  });
  it("transactions ganha colunas nulas com papéis fixos", async () => {
    await db.query(`INSERT INTO transactions DEFAULT VALUES`);
    await expect(db.query(`UPDATE transactions SET partner_contract_role='outro'`)).rejects.toThrow(/check/i);
  });
});
