// @vitest-environment node
// P5b passo 1 (D-ERP325): 0284 a_pagar.por_evento on PGlite with the byte-identical manual migration.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";

let db: PGlite;
const M0284 = readFileSync("supabase/manual/0284_p5b_a_pagar_por_evento.sql", "utf8");
const M0283 = readFileSync("supabase/manual/0283_p4b_financial_position_permission.sql", "utf8");
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
  CREATE TABLE cache_payment_contracts(id uuid, company_id uuid, cancelled_at timestamptz);
  CREATE TABLE cache_payment_contract_cities(contract_id uuid, forecast_id uuid, quota numeric);
  CREATE TABLE event_bp_line_reviews(forecast_id uuid, company_id uuid, decision text, saldo_at_review numeric, reviewed_at timestamptz);
  CREATE TABLE financial_accounts(id uuid, name text, type text, company_id uuid, is_active boolean, is_hidden boolean,
    skip_balance_check boolean, balance_visible_to_all boolean, initial_balance_date date, bal numeric);
  CREATE FUNCTION _account_true_balance_raw(uuid) RETURNS numeric LANGUAGE sql AS $$SELECT bal FROM financial_accounts WHERE id=$1$$;
  CREATE FUNCTION ticket_office_balances(uuid[]) RETURNS TABLE(account_id uuid, balance numeric) LANGUAGE sql
    AS $$SELECT id, bal FROM financial_accounts WHERE id = ANY($1)$$;
  CREATE TABLE event_third_party_operations(event_id uuid, company_id uuid, kind text, name text, gross_amount numeric, operator_result numeric);`);
  await db.exec("CREATE TABLE role_permissions(role app_role, permission text);");
  await db.exec(M0284);
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

const pe = (v: any, ev: string) => v.a_pagar.por_evento.find((e: any) => e.evento_id === ev);
const sumByStage = (v: any) => {
  for (const [st, b] of Object.entries<any>(v.a_pagar.por_estagio)) {
    const s = v.a_pagar.por_evento.filter((e: any) => e.estagio === st).reduce((a: number, e: any) => a + Number(e.a_pagar_total), 0);
    expect(Math.round((Number(b.total) - s) * 100) / 100).toBe(0);
  }
};
const strip = (v: any) => { const c = structuredClone(v); delete c.a_pagar.por_evento; delete c.a_pagar.por_evento_nota; return c; };

it("migration and manual copy are byte-identical", () => {
  const { readdirSync } = require("node:fs");
  const f = readdirSync("supabase/migrations").find((x: string) => x.endsWith("_0284_p5b_a_pagar_por_evento.sql"));
  expect(readFileSync(`supabase/migrations/${f}`, "utf8")).toBe(M0284);
});

it("not-started em_curso: BP out of total, in bp_total/bp_por_lancar; launched tx in a_pagar", async () => {
  const l = fc(FUT, 1000, { iva_rate: "23" });
  await db.exec(l.sql + tx(FUT, 100, 40, { forecast_id: `'${l.fid}'` }).sql + tx(FUT, 50, 0).sql);
  const v = await call(); const e = pe(v, FUT);
  expect(e.started).toBe(false);
  expect(Number(e.bp_total)).toBeCloseTo(1230, 2);
  expect(Number(e.bp_por_lancar)).toBeCloseTo(1230 - 40 - 60, 2);
  expect(Number(e.a_pagar_total)).toBeCloseTo(110, 2);
  expect(Number(e.a_pagar_lancado)).toBeCloseTo(110, 2);
  expect(Number(e.a_pagar_sem_linha)).toBeCloseTo(50, 2);
  expect(Number(e.despesas_pagas)).toBeCloseTo(40, 2);
  sumByStage(v);
});

it("started em_fecho with cache contract, partner_paid (valid only), rateio mother, transitory; sums close by stage", async () => {
  const a = fc(ROOT, 100); const b = fc(ROOT, 200); const c = fc(ROOT, 300); const k = fc(ROOT, 500, { cache_config_id: `'${id()}'` });
  const kc = id(); const mother = tx(null, 1000, 0);
  await db.exec(a.sql + b.sql + c.sql + k.sql + `INSERT INTO cache_payment_contracts VALUES('${kc}','${C}',null);
    INSERT INTO cache_payment_contract_cities VALUES('${kc}','${k.fid}',80);
    INSERT INTO event_bp_line_reviews VALUES('${b.fid}','${C}','partner_paid',200,now()),('${c.fid}','${C}','partner_paid',1,now());`
    + tx(ROOT, 30, 10, { forecast_id: `'${a.fid}'` }).sql + mother.sql + tx(ROOT, 25, 0, { parent_transaction_id: `'${mother.tid}'` }).sql
    + tx(ROOT, 999, 0, { is_transitory: "true" }).sql + tx(SUB, 7, 0).sql);
  const v = await call(); const e = pe(v, ROOT);
  // bp: a 100 (pago 10, lançado 20, saldo 70) + c 300 (stale review -> por_rever) + k 80; b partner_paid out
  expect(Number(e.a_pagar_total)).toBeCloseTo(20 + 70 + 300 + 80 + 25, 2);
  expect(Number(e.bp_total)).toBeCloseTo(100 + 300 + 80, 2);
  expect(Number(e.bp_por_lancar)).toBeCloseTo(70 + 300 + 80, 2);
  expect(Number(e.a_pagar_sem_linha)).toBeCloseTo(25, 2);
  expect(Number(pe(v, FECH).a_pagar_total)).toBeCloseTo(7, 2);
  sumByStage(v);
});

it("historical and cancelled are out of por_evento", async () => {
  await db.exec(fc(HIST, 900).sql);
  const v = await call();
  expect(pe(v, HIST)).toBeUndefined();
  expect(v.a_pagar.por_evento.every((e: any) => ["planeamento","em_curso","em_fecho","fechado"].includes(e.estagio))).toBe(true);
});

it("everything else equals 0283 (additive only)", async () => {
  const a = fc(ROOT, 100, { iva_rate: "23" });
  await db.exec(a.sql + fc(FUT, 400).sql + tx(FUT, 10, 0).sql + tx(ROOT, 50, 20, { forecast_id: `'${a.fid}'` }).sql);
  const after = strip(await call());
  await db.exec(M0283);
  const before = await call();
  await db.exec(M0284);
  expect(after).toEqual(before);
  expect(before.a_pagar.por_evento).toBeUndefined();
});

it("gate unchanged: no permission -> financial_position_permission_denied", async () => {
  await db.exec(`CREATE OR REPLACE FUNCTION has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;`);
  await expect(call()).rejects.toThrow(/financial_position_permission_denied/);
});
