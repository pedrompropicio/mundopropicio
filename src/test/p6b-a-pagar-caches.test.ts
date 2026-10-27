// @vitest-environment node
// P6b: 0285 a_pagar.caches on PGlite with the manual migration.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";

let db: PGlite;
const M0285 = readFileSync("supabase/manual/0285_p6b_a_pagar_caches.sql", "utf8");
const M0284 = readFileSync("supabase/manual/0284_p5b_a_pagar_por_evento.sql", "utf8");
const C = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const OTHER = "99999999-0000-0000-0000-000000000009";
const U = "20000000-0000-0000-0000-000000000001";
const ROOT = "10000000-0000-0000-0000-000000000001"; // em_fecho, started
const SUB = "10000000-0000-0000-0000-000000000002"; // sub-event of FECH
const FECH = "10000000-0000-0000-0000-000000000003"; // fechado
const FUT = "10000000-0000-0000-0000-000000000004"; // em_curso, future
const HIST = "10000000-0000-0000-0000-000000000005"; // historico

let n = 0;
const id = () => `30000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;
const call = async (company = C) =>
  (await db.query<{ v: any }>(`select get_financial_position_base('${company}') v`)).rows[0].v;
const ap = (v: any, st: string) => v.a_pagar.por_estagio[st];
const fc = (ev: string, amount: number, extra: Record<string, string> = {}) => {
  const fid = extra.id ?? id();
  const cols = ["id", "event_id", "company_id", "type", "status", "amount", "iva_rate", ...Object.keys(extra).filter((k) => k !== "id" && k !== "iva_rate")];
  const vals = [`'${fid}'`, `'${ev}'`, `'${C}'`, "'expense'", "'approved'", String(amount), extra.iva_rate ?? "0",
    ...Object.entries(extra).filter(([k]) => k !== "id" && k !== "iva_rate").map(([, v]) => v)];
  return { fid, sql: `INSERT INTO event_forecasts(${cols.join(",")}) VALUES(${vals.join(",")});` };
};
const tx = (ev: string | null, amount: number, paid: number, extra: Record<string, string> = {}) => {
  const tid = extra.id ?? id();
  const rest = Object.entries(extra).filter(([k]) => k !== "id");
  const cols = ["id", "event_id", "company_id", "type", "status", "amount", "iva_rate", "paid_amount", ...rest.map(([k]) => k)];
  const vals = [`'${tid}'`, ev ? `'${ev}'` : "null", `'${C}'`, "'expense'", "'approved'", String(amount), "0", String(paid), ...rest.map(([, v]) => v)];
  return { tid, sql: `INSERT INTO transactions(${cols.join(",")}) VALUES(${vals.join(",")});` };
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${U}'::uuid$$;
  CREATE TYPE app_role AS ENUM ('admin','manager','platform_admin','viewer');
  CREATE TABLE flags(pa boolean); INSERT INTO flags VALUES(false);
  CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$SELECT '${C}'::uuid$$;
  CREATE FUNCTION is_platform_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT pa FROM flags$$;
  CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
  CREATE FUNCTION has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
  CREATE TABLE user_roles(user_id uuid, company_id uuid, role app_role);
  INSERT INTO user_roles VALUES('${U}','${C}','manager');
  CREATE TABLE events(id uuid PRIMARY KEY, name text, date date, company_id uuid, parent_event_id uuid, st text);
  CREATE FUNCTION event_stage(uuid) RETURNS text LANGUAGE sql STABLE AS $$SELECT st FROM events WHERE id=$1$$;
  CREATE TABLE event_dates(event_id uuid, date date);
  CREATE TABLE account_categories(id uuid, code text);
  CREATE TABLE transactions(id uuid PRIMARY KEY, event_id uuid, company_id uuid, type text, status text, amount numeric,
    iva_rate integer, paid_amount numeric, forecast_id uuid, category_id uuid, parent_transaction_id uuid,
    installment_total integer, is_transitory boolean, transitory_reason text, exclude_from_result boolean,
    is_hidden boolean, reversed_at timestamptz, paying_partner_id uuid);
  CREATE TABLE event_forecasts(id uuid PRIMARY KEY, event_id uuid, company_id uuid, type text, status text, amount numeric,
    iva_rate integer, version_id uuid, is_transitory boolean, is_overhead boolean, exclude_from_result boolean,
    paying_partner_id uuid, cache_config_id uuid);
  CREATE TABLE cache_payment_contracts(id uuid, company_id uuid, cancelled_at timestamptz, artist_supplier_id uuid, artist_mother_id uuid, withholding_mother_id uuid);
  CREATE TABLE suppliers(id uuid, name text);
  CREATE TABLE cache_payment_contract_cities(contract_id uuid, forecast_id uuid, quota numeric);
  CREATE TABLE event_bp_line_reviews(forecast_id uuid, company_id uuid, decision text, saldo_at_review numeric, reviewed_at timestamptz);
  CREATE TABLE financial_accounts(id uuid, name text, type text, company_id uuid, is_active boolean, is_hidden boolean,
    skip_balance_check boolean, balance_visible_to_all boolean, initial_balance_date date, bal numeric);
  CREATE FUNCTION _account_true_balance_raw(uuid) RETURNS numeric LANGUAGE sql AS $$SELECT bal FROM financial_accounts WHERE id=$1$$;
  CREATE FUNCTION ticket_office_balances(uuid[]) RETURNS TABLE(account_id uuid, balance numeric) LANGUAGE sql
    AS $$SELECT id, bal FROM financial_accounts WHERE id = ANY($1)$$;
  CREATE TABLE event_third_party_operations(event_id uuid, company_id uuid, kind text, name text, gross_amount numeric, operator_result numeric);`);
  await db.exec("CREATE TABLE role_permissions(role app_role, permission text);");
  await db.exec(M0285);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`BEGIN; INSERT INTO events VALUES
   ('${ROOT}','root','2000-01-01','${C}',null,'em_fecho'),
   ('${FECH}','fech','2000-02-01','${C}',null,'fechado'),
   ('${SUB}','sub','2000-02-02','${C}','${FECH}','em_curso'),
   ('${FUT}','fut','2099-01-01','${C}',null,'em_curso'),
   ('${HIST}','hist','2000-03-01','${C}',null,'historico');`);
});
afterEach(async () => { await db.exec("ROLLBACK"); });

const K = (v: any) => v.a_pagar.caches;
const CAT = "40000000-0000-0000-0000-000000000001";
const SIM = "50000000-0000-0000-0000-000000000001";
const DEI = "50000000-0000-0000-0000-000000000002";

async function seedContracts() {
  await db.exec(`INSERT INTO account_categories VALUES('${CAT}','2.1.01');
    INSERT INTO suppliers VALUES('${SIM}','SIMONE MENDES'),('${DEI}','DEIVE LEONARDO');`);
  const mk = async (artist: string, sale: number[], ret: number[], cancelled = false) => {
    const kid = id(); const m1 = tx(null, sale.reduce((a, b) => a + b, 0), 0, { category_id: `'${CAT}'` });
    const m2 = tx(null, ret.reduce((a, b) => a + b, 0), 0, { category_id: `'${CAT}'` });
    let sql = m1.sql + m2.sql + `INSERT INTO cache_payment_contracts VALUES('${kid}','${C}',${cancelled ? "now()" : "null"},'${artist}','${m1.tid}','${m2.tid}');`;
    const evs = [ROOT, SUB];
    sale.forEach((v, i) => { sql += tx(evs[i], v, 0, { category_id: `'${CAT}'`, parent_transaction_id: `'${m1.tid}'` }).sql; });
    ret.forEach((v, i) => { sql += tx(evs[i], v, 0, { category_id: `'${CAT}'`, parent_transaction_id: `'${m2.tid}'` }).sql; });
    await db.exec(sql);
  };
  return mk;
}

it("caches: children only, per artist, withholding apart, sum of lines = total", async () => {
  const mk = await seedContracts();
  await mk(SIM, [100, 200], [30, 70]);
  await mk(DEI, [50], [10]);
  await mk(DEI, [999], [1], true); // cancelled: never counts
  const k = K(await call());
  const sim = k.por_artista.find((a: any) => a.artist_supplier_id === SIM);
  const dei = k.por_artista.find((a: any) => a.artist_supplier_id === DEI);
  expect(Number(sim.total)).toBe(400); expect(Number(sim.retencao_irs)).toBe(100); expect(Number(sim.sem_retencao)).toBe(300);
  expect(Number(dei.total)).toBe(60); expect(Number(dei.retencao_irs)).toBe(10);
  expect(Number(k.total)).toBe(460); expect(Number(k.retencao_irs_total)).toBe(110);
  const linhas = k.por_artista.flatMap((a: any) => a.por_evento).reduce((s: number, e: any) => s + Number(e.total), 0);
  expect(linhas).toBe(Number(k.total));
  expect(sim.por_evento).toHaveLength(2);
});

it("caches: partially paid child counts only the open part; paid child out; non-2.1 out; no contract -> sem_contrato", async () => {
  const mk = await seedContracts();
  await mk(SIM, [100], []);
  const other = id();
  await db.exec(`INSERT INTO account_categories VALUES('${other}','2.6.01');` + tx(ROOT, 40, 0, { category_id: `'${other}'` }).sql
    + tx(ROOT, 25, 0, { category_id: `'${CAT}'` }).sql);
  await db.exec(`UPDATE transactions SET paid_amount = 30 WHERE amount = 100 AND event_id IS NOT NULL;`);
  const k = K(await call());
  expect(Number(k.total)).toBe(70);
  expect(Number(k.sem_contrato.total)).toBe(25); expect(k.sem_contrato.n).toBe(1);
});

it("everything else equals 0284 (additive only)", async () => {
  const mk = await seedContracts();
  await mk(SIM, [100, 200], [30, 70]);
  const a = fc(ROOT, 100, { iva_rate: "23" });
  await db.exec(a.sql + fc(FUT, 400).sql + tx(FUT, 10, 0).sql + tx(ROOT, 50, 20, { forecast_id: `'${a.fid}'` }).sql);
  const after = structuredClone(await call()); delete after.a_pagar.caches;
  await db.exec(M0284);
  const before = await call();
  await db.exec(M0285);
  expect(after).toEqual(before);
  expect(before.a_pagar.caches).toBeUndefined();
});

it("gate unchanged: no permission -> financial_position_permission_denied", async () => {
  await db.exec(`CREATE OR REPLACE FUNCTION has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;`);
  await expect(call()).rejects.toThrow(/financial_position_permission_denied/);
});
