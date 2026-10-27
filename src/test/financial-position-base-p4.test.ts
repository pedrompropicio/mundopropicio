// @vitest-environment node
// P4 (D-ERP320): get_financial_position_base — counting rules on PGlite with the byte-identical manual migration.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";

let db: PGlite;
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
  await db.exec(readFileSync("supabase/manual/0282_p4_financial_position_base.sql", "utf8"));
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

it("IVA integer: bruto = base × 1,23 (decimal division)", async () => {
  await db.exec(fc(ROOT, 100, { iva_rate: "23" }).sql);
  const v = await call();
  expect(Number(ap(v, "em_fecho").bp)).toBeCloseTo(123, 2);
});

it("rateio mother excluded, installment chain counted", async () => {
  const mother = tx(null, 1000, 0);
  const chain = tx(FUT, 30, 0, { installment_total: "2" });
  await db.exec(mother.sql + tx(FUT, 50, 0, { parent_transaction_id: `'${mother.tid}'` }).sql + chain.sql
    + tx(FUT, 20, 0, { parent_transaction_id: `'${chain.tid}'` }).sql);
  expect(Number(ap(await call(), "em_curso").total)).toBeCloseTo(100, 2);
});

it("partner payer lines and transactions stay out of the MP payable", async () => {
  await db.exec(fc(ROOT, 500, { paying_partner_id: `'${id()}'` }).sql + tx(ROOT, 70, 0, { paying_partner_id: `'${id()}'` }).sql);
  expect(Number(ap(await call(), "em_fecho").total)).toBe(0);
});

it("payable floors at 0 per line and the excess is an alert", async () => {
  const l1 = fc(ROOT, 100); const l2 = fc(ROOT, 40);
  await db.exec(l1.sql + l2.sql + tx(ROOT, 150, 150, { forecast_id: `'${l1.fid}'` }).sql);
  const v = await call();
  expect(Number(ap(v, "em_fecho").bp)).toBeCloseTo(40, 2);
  expect(v.alertas.pago_acima_do_bp).toMatchObject({ n: 1 });
  expect(Number(v.alertas.pago_acima_do_bp.excesso)).toBeCloseTo(50, 2);
});

it("event not started counts only launched transactions", async () => {
  await db.exec(fc(FUT, 1000).sql + tx(FUT, 40, 0).sql);
  const v = ap(await call(), "em_curso");
  expect(Number(v.bp)).toBe(0);
  expect(Number(v.total)).toBeCloseTo(40, 2);
});

it("sub-event inherits the master stage", async () => {
  await db.exec(fc(SUB, 77).sql);
  const v = await call();
  expect(Number(ap(v, "fechado").bp)).toBeCloseTo(77, 2);
  expect(Number(ap(v, "em_curso").total)).toBe(0);
});

it("historical events are out of everything", async () => {
  await db.exec(fc(HIST, 900).sql + tx(HIST, 50, 0).sql + tx(HIST, 60, 0).sql.replace("'expense'", "'income'"));
  const v = await call();
  expect(Number(v.a_pagar.total)).toBe(0);
  expect(Number(v.a_receber.total)).toBe(0);
  expect(v.eventos_por_estagio.historico).toHaveLength(1);
});

it("active cache contract replaces the cache_module line (never summed)", async () => {
  const l = fc(ROOT, 100, { cache_config_id: `'${id()}'` });
  const k = id(); const k2 = id();
  await db.exec(l.sql + `INSERT INTO cache_payment_contracts VALUES('${k}','${C}',null),('${k2}','${C}',now());
    INSERT INTO cache_payment_contract_cities VALUES('${k}','${l.fid}',60),('${k}','${l.fid}',20),('${k2}','${l.fid}',999);`);
  const v = ap(await call(), "em_fecho");
  expect(Number(v.bp)).toBeCloseTo(80, 2);
  expect(v.linhas_contrato_cache).toBe(1);
});

it("review buckets: valid pending_invoice confirmed, stale review por_rever, partner_paid out of total", async () => {
  const a = fc(ROOT, 100); const b = fc(ROOT, 200); const c = fc(ROOT, 300);
  await db.exec(a.sql + b.sql + c.sql + `INSERT INTO event_bp_line_reviews VALUES
    ('${a.fid}','${C}','pending_invoice',100,now()),
    ('${b.fid}','${C}','pending_invoice',150,now()),
    ('${c.fid}','${C}','partner_paid',300,now());`);
  const v = ap(await call(), "em_fecho");
  expect(Number(v.sublinhas.confirmado)).toBeCloseTo(100, 2);
  expect(Number(v.sublinhas.por_rever)).toBeCloseTo(200, 2);
  expect(Number(v.sublinhas.partner_paid_fora_do_total)).toBeCloseTo(300, 2);
  expect(Number(v.total)).toBeCloseTo(300, 2);
});

it("cash and retained never sum; hidden ticket offices apart", async () => {
  await db.exec(`INSERT INTO financial_accounts VALUES
   ('${id()}','Banco','bank','${C}',true,false,false,true,null,1000),
   ('${id()}','Sem controlo','bank','${C}',true,false,true,true,null,-5),
   ('${id()}','Cartao','prepaid_card','${C}',true,false,false,true,null,10),
   ('${id()}','Bilh','ticket_office','${C}',true,false,false,true,null,300),
   ('${id()}','Oculta','ticket_office','${C}',true,true,false,true,null,40);`);
  const v = await call();
  expect(Number(v.posicao.caixa_e_cartoes)).toBeCloseTo(1010, 2);
  expect(Number(v.retido.total_visiveis)).toBeCloseTo(300, 2);
  expect(Number(v.retido.total_ocultas)).toBeCloseTo(40, 2);
  expect(v.posicao).not.toHaveProperty("total");
});

it("foreign company refused unless platform_admin", async () => {
  await db.exec("SAVEPOINT s");
  await expect(call(OTHER)).rejects.toThrow("company_forbidden");
  await db.exec("ROLLBACK TO SAVEPOINT s; UPDATE flags SET pa=true");
  expect((await call(OTHER)).meta.company_id).toBe(OTHER);
});

it("non admin/manager member refused", async () => {
  await db.exec("DELETE FROM user_roles");
  await expect(call()).rejects.toThrow("financial_position_permission_denied");
});
