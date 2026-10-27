// @vitest-environment node
// P4b (D-ERP321): access gate of get_financial_position_base via permission view_financial_position.
// Loads the byte-identical manual 0283 on PGlite with has_permission copied from Live.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { ALL_PERMISSIONS } from "@/contexts/AuthContext";

let db: PGlite;
const C = "7c858982-6ccd-47ca-bd65-e0dd3eebf01c";
const OTHER = "99999999-0000-0000-0000-000000000009";
const U = "20000000-0000-0000-0000-000000000001";

const call = async (company = C) => {
  try {
    await db.query(`select get_financial_position_base('${company}') v`);
    return "ok";
  } catch (e: any) {
    return String(e.message);
  }
};
const asRole = (role: string) => db.exec(`INSERT INTO user_roles VALUES('${U}','${C}','${role}');`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${U}'::uuid$$;
  CREATE TYPE app_role AS ENUM ('admin','manager','platform_admin','viewer');
  CREATE TABLE flags(pa boolean); INSERT INTO flags VALUES(false);
  CREATE FUNCTION current_company_id() RETURNS uuid LANGUAGE sql AS $$SELECT '${C}'::uuid$$;
  CREATE FUNCTION is_platform_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT pa FROM flags$$;
  CREATE TABLE user_roles(user_id uuid, company_id uuid, role app_role);
  CREATE TABLE role_permissions(id uuid DEFAULT gen_random_uuid(), role app_role NOT NULL, permission text NOT NULL, created_at timestamptz DEFAULT now());
  CREATE TABLE user_permissions(id uuid DEFAULT gen_random_uuid(), user_id uuid NOT NULL, permission text NOT NULL,
    granted boolean NOT NULL DEFAULT true, created_at timestamptz DEFAULT now(), company_id uuid NOT NULL DEFAULT current_company_id());
  CREATE FUNCTION has_role(uuid,app_role) RETURNS boolean LANGUAGE sql AS $$SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role=$2)$$;
  -- Copied from Live (pg_get_functiondef, 27/10/2026).
  CREATE FUNCTION public.has_permission(_user_id uuid, _permission text) RETURNS boolean LANGUAGE sql STABLE AS $f$
    SELECT COALESCE(
      (SELECT granted FROM public.user_permissions
         WHERE user_id = _user_id AND permission = _permission
           AND company_id = public.current_company_id()
         LIMIT 1),
      public.is_platform_admin(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role = ur.role
        WHERE ur.user_id = _user_id AND rp.permission = _permission
          AND ur.company_id = public.current_company_id()))
  $f$;
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
  await db.exec(readFileSync("supabase/manual/0283_p4b_financial_position_permission.sql", "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("BEGIN"); });
afterEach(async () => { await db.exec("ROLLBACK"); });

it("catalog registers view_financial_position once with the pt-PT label", () => {
  const hits = ALL_PERMISSIONS.filter((p) => p.key === "view_financial_position");
  expect(hits).toHaveLength(1);
  expect(hits[0].label).toBe("Ver posição financeira");
});

it("seed is admin only and idempotent", async () => {
  await db.exec(readFileSync("supabase/manual/0283_p4b_financial_position_permission.sql", "utf8"));
  const r = await db.query<{ role: string }>(`select role::text from role_permissions where permission='view_financial_position'`);
  expect(r.rows.map((x) => x.role)).toEqual(["admin"]);
});

it("platform_admin passes without role", async () => {
  await db.exec("UPDATE flags SET pa = true");
  expect(await call()).toBe("ok");
});

it("admin with seed passes", async () => {
  await asRole("admin");
  expect(await call()).toBe("ok");
});

it("manager without grant is denied", async () => {
  await asRole("manager");
  expect(await call()).toContain("financial_position_permission_denied");
});

it("manager with user grant in the current company passes", async () => {
  await asRole("manager");
  await db.exec(`INSERT INTO user_permissions(user_id, permission, granted, company_id) VALUES('${U}','view_financial_position',true,'${C}')`);
  expect(await call()).toBe("ok");
});

it("manager grant registered in another company does not count", async () => {
  await asRole("manager");
  await db.exec(`INSERT INTO user_permissions(user_id, permission, granted, company_id) VALUES('${U}','view_financial_position',true,'${OTHER}')`);
  expect(await call()).toContain("financial_position_permission_denied");
});

it("admin with granted=false override is denied", async () => {
  await asRole("admin");
  await db.exec(`INSERT INTO user_permissions(user_id, permission, granted, company_id) VALUES('${U}','view_financial_position',false,'${C}')`);
  expect(await call()).toContain("financial_position_permission_denied");
});

it("viewer without grant is denied", async () => {
  await asRole("viewer");
  expect(await call()).toContain("financial_position_permission_denied");
});

it("non platform_admin with a foreign company is refused", async () => {
  await asRole("admin");
  expect(await call(OTHER)).toContain("company_forbidden");
});

it("anon has no EXECUTE, authenticated has", async () => {
  const r = await db.query<{ a: boolean; u: boolean }>(`select
    has_function_privilege('anon','get_financial_position_base(uuid,integer)','EXECUTE') a,
    has_function_privilege('authenticated','get_financial_position_base(uuid,integer)','EXECUTE') u`);
  expect(r.rows[0]).toEqual({ a: false, u: true });
});
