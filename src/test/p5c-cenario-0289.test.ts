// @vitest-environment node
// P5c: 0289 cenário + planeamento cru por evento futuro, em PGlite com a migração manual.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";

let db: PGlite;
const M0285 = readFileSync("supabase/manual/0285_p6b_a_pagar_caches.sql", "utf8");
const M0289 = readFileSync("supabase/manual/0289_p5c_cenario_receita_prevista.sql", "utf8");
const C = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const OTHER = "99999999-0000-0000-0000-000000000009";
const U = "20000000-0000-0000-0000-000000000001";
const ROOT = "10000000-0000-0000-0000-000000000001"; // tour em_curso futura, sem lotes próprios
const S1 = "10000000-0000-0000-0000-000000000002";
const S2 = "10000000-0000-0000-0000-000000000003";
const DONE = "10000000-0000-0000-0000-000000000004"; // fechado
const FOREIGN = "10000000-0000-0000-0000-000000000005"; // outra empresa
let n = 0;
const id = () => `30000000-0000-0000-0000-${String(++n).padStart(12, "0")}`;
const call = async () => (await db.query<{ v: any }>(`select get_financial_position_base('${C}') v`)).rows[0].v;
const ev = (v: any, e: string) => v.a_pagar.por_evento.find((x: any) => x.evento_id === e);
const strip = (v: any) => { const c = structuredClone(v); for (const e of c.a_pagar.por_evento) delete e.planeamento; return c; };

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
  CREATE TABLE events(id uuid PRIMARY KEY, name text, date date, company_id uuid, parent_event_id uuid, st text, ticketing_baseline_net numeric);
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
  await db.exec(`CREATE TABLE role_permissions(role app_role, permission text);
  CREATE FUNCTION row_belongs_to_current_company(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT $1 = current_company_id()$$;
  CREATE TABLE event_ticket_zones(id uuid PRIMARY KEY, event_id uuid NOT NULL, company_id uuid, total_capacity integer, version_id uuid);
  CREATE TABLE event_ticket_lots(id uuid PRIMARY KEY, zone_id uuid NOT NULL, company_id uuid, quantity integer NOT NULL, price numeric NOT NULL,
    sync_generated boolean NOT NULL DEFAULT false, version_id uuid);
  GRANT USAGE ON SCHEMA public, auth TO authenticated; GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth TO authenticated;`);
  await db.exec(M0289);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`BEGIN; INSERT INTO events VALUES
   ('${ROOT}','tour','2099-01-01','${C}',null,'em_curso',null),
   ('${S1}','s1','2099-01-02','${C}','${ROOT}','em_curso',500),
   ('${S2}','s2','2099-01-03','${C}','${ROOT}','em_curso',null),
   ('${DONE}','done','2000-01-01','${C}',null,'fechado',null),
   ('${FOREIGN}','coala','2099-02-01','${OTHER}',null,'em_curso',null);`);
});
afterEach(async () => { await db.exec("ROLLBACK"); });

const zone = async (event: string, cap: number | null, lots: Array<[number, number, Partial<{ sync: boolean; ver: boolean }>?]>, zver = false) => {
  const z = id();
  let sql = `INSERT INTO event_ticket_zones VALUES('${z}','${event}','${C}',${cap ?? "null"},${zver ? `'${id()}'` : "null"});`;
  for (const [q, p, o] of lots) sql += `INSERT INTO event_ticket_lots VALUES('${id()}','${z}','${C}',${q},${p},${o?.sync ? "true" : "false"},${o?.ver ? `'${id()}'` : "null"});`;
  await db.exec(sql);
  return z;
};

it("planeamento: raiz sem lotes lista sessões com os seus lotes, sem duplicar; filtros de lote e zona", async () => {
  await zone(S1, 100, [[50, 20], [10, 30], [5, 99, { sync: true }], [7, 99, { ver: true }], [0, 10], [3, 0]]);
  await zone(S2, null, [[1000, 25]]);
  await zone(S2, 10, [[4, 1]], true); // zona de versão: fora
  const p = ev(await call(), ROOT).planeamento;
  expect(p.map((x: any) => x.event_id)).toEqual([ROOT, S1, S2].sort((a, b) => (a === ROOT ? -1 : b === ROOT ? 1 : a.localeCompare(b))));
  const r = p.find((x: any) => x.event_id === ROOT); expect(r.zonas).toEqual([]);
  const s1 = p.find((x: any) => x.event_id === S1);
  expect(Number(s1.previsto_original)).toBe(500);
  expect(s1.zonas).toHaveLength(1); expect(s1.zonas[0].total_capacity).toBe(100);
  expect(s1.zonas[0].lotes.map((l: any) => [l.quantity, Number(l.price)]).sort()).toEqual([[10, 30], [50, 20]]);
  const s2 = p.find((x: any) => x.event_id === S2);
  expect(s2.zonas).toHaveLength(1); expect(s2.zonas[0].total_capacity).toBeNull();
  expect(s2.cenario).toBeNull();
});

it("planeamento só para planeamento/em_curso; outra empresa nunca aparece", async () => {
  const v = await call();
  expect(ev(v, DONE).planeamento).toBeNull();
  expect(ev(v, FOREIGN)).toBeUndefined();
});

it("cenário: defaults, company_id/autor da base, log append-only com old/new", async () => {
  await db.exec(`INSERT INTO event_coverage_scenarios(event_id, company_id) VALUES('${S1}','${OTHER}');`);
  let row = (await db.query<any>(`select * from event_coverage_scenarios`)).rows[0];
  expect(row.company_id).toBe(C); expect(row.modo).toBe("real"); expect(Number(row.percentagem)).toBe(0);
  expect(row.updated_by).toBe(U);
  await db.exec(`UPDATE event_coverage_scenarios SET modo='previsao', percentagem=50, viragem_real_dias=14 WHERE event_id='${S1}';`);
  const c = ev(await call(), ROOT).planeamento.find((x: any) => x.event_id === S1).cenario;
  expect(c.modo).toBe("previsao"); expect(Number(c.percentagem)).toBe(50); expect(c.viragem_real_dias).toBe(14);
  const log = (await db.query<any>(`select op, old, new, changed_by from event_coverage_scenario_log order by changed_at, op`)).rows;
  expect(log.map((l: any) => l.op).sort()).toEqual(["INSERT", "UPDATE"]);
  const up = log.find((l: any) => l.op === "UPDATE");
  expect(up.old.modo).toBe("real"); expect(up.new.modo).toBe("previsao"); expect(up.changed_by).toBe(U);
});

it("cenário: checks recusam modo inválido, % fora de 0..100, valores negativos", async () => {
  for (const bad of [`modo) VALUES('${S1}','x')`, `percentagem) VALUES('${S1}',101)`, `percentagem) VALUES('${S1}',-1)`,
    `receita_manual_bruta) VALUES('${S1}',-5)`, `viragem_real_dias) VALUES('${S1}',-1)`]) {
    await db.exec("SAVEPOINT s");
    await expect(db.exec(`INSERT INTO event_coverage_scenarios(event_id, ${bad};`)).rejects.toThrow();
    await db.exec("ROLLBACK TO SAVEPOINT s");
  }
});

it("RLS: authenticated sem papel admin/manager não escreve; outra empresa invisível; log sem escrita", async () => {
  await db.exec(`INSERT INTO event_coverage_scenarios(event_id) VALUES('${S1}'),('${FOREIGN}');
    GRANT INSERT, UPDATE, DELETE ON event_coverage_scenarios TO authenticated;
    CREATE OR REPLACE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
    SET LOCAL ROLE authenticated;`);
  const seen = (await db.query<any>(`select event_id from event_coverage_scenarios`)).rows.map((r: any) => r.event_id);
  expect(seen).toEqual([S1]);
  await db.exec("SAVEPOINT s");
  await expect(db.exec(`INSERT INTO event_coverage_scenarios(event_id) VALUES('${S2}')`)).rejects.toThrow(/row-level security/);
  await db.exec("ROLLBACK TO SAVEPOINT s; SAVEPOINT t");
  await expect(db.exec(`INSERT INTO event_coverage_scenario_log(event_id, company_id, op) VALUES('${S1}','${C}','x')`)).rejects.toThrow();
  await db.exec("ROLLBACK TO SAVEPOINT t; RESET ROLE");
});

it("aditiva: sem a chave planeamento o JSON é igual ao da 0285", async () => {
  await zone(S1, 100, [[50, 20]]);
  await db.exec(`INSERT INTO event_forecasts(id,event_id,company_id,type,status,amount,iva_rate) VALUES('${id()}','${S1}','${C}','expense','approved',400,23);`);
  const after = strip(await call());
  await db.exec(M0285);
  const before = await call();
  await db.exec(M0289.slice(M0289.indexOf("CREATE OR REPLACE FUNCTION public.get_financial_position_base")));
  expect(after).toEqual(before);
  expect(before.a_pagar.por_evento.every((e: any) => !("planeamento" in e))).toBe(true);
});

it("gate inalterado", async () => {
  await db.exec(`CREATE OR REPLACE FUNCTION has_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;`);
  await expect(call()).rejects.toThrow(/financial_position_permission_denied/);
});
