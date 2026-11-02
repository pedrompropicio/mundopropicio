// @vitest-environment node
// Evidence about repository sources, NOT acceptance of a corrected candidate.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';

const source = (name: string) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
const tx = '00000000-0000-0000-0000-000000000001';
const companyA = '00000000-0000-0000-0000-000000000002';
const companyB = '00000000-0000-0000-0000-000000000003';
const user = '00000000-0000-0000-0000-000000000004';
const forecast = '00000000-0000-0000-0000-000000000005';
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TYPE app_role AS ENUM ('admin','manager','platform_admin');
    CREATE TABLE companies(id uuid, status text);
    CREATE TABLE profiles(id uuid, active_company_id uuid, company_id uuid);
    CREATE TABLE user_roles(id int, user_id uuid, company_id uuid, role app_role);
    CREATE FUNCTION is_platform_admin(u uuid) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT EXISTS(SELECT FROM user_roles WHERE user_id=u AND role='platform_admin') $$;
    CREATE TABLE user_permissions(user_id uuid, permission text, company_id uuid, granted boolean);
    CREATE TABLE role_permissions(role app_role, permission text);
    CREATE TABLE transactions(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), description text, type text,
      amount numeric, iva_rate numeric, event_id uuid, category_id uuid,
      supplier_id uuid, account_id uuid, specification text, date date, due_date date,
      status text, paid_amount numeric, payment_date date, is_reimbursement boolean,
      is_transitory boolean, exclude_from_result boolean, invoice_ref text,
      invoice_group_id uuid, payment_method text, payment_entity text, payment_reference text,
      operation_key text, ordering_partner_id uuid, paying_partner_id uuid,
      currency text, fx_rate numeric, fx_rate_source text, original_amount numeric,
      parent_transaction_id uuid, installment_group_id uuid, installment_number int,
      installment_total int, split_percentage numeric, split_amount numeric,
      company_id uuid, updated_at timestamptz, forecast_id uuid
    );
    CREATE TABLE transaction_payments(transaction_id uuid);
    CREATE TABLE partner_paid_expenses(transaction_id uuid);
    CREATE TABLE partner_advance_expenses(transaction_id uuid);
    CREATE TABLE events(id uuid, status text);
    CREATE TABLE transaction_audit_log(transaction_id uuid, changed_by text,
      field_name text, old_value text, new_value text);
    INSERT INTO companies VALUES ('${companyA}','active'),('${companyB}','active');
    INSERT INTO profiles VALUES ('${user}','${companyA}','${companyA}');
    INSERT INTO user_roles VALUES (1,'${user}','${companyA}','manager');
    SELECT set_config('request.jwt.claim.sub','${user}',false);
  `);
  // Actual versioned tenant/permission helpers, not a permissive RPC mock.
  await db.exec(source('20260608214750_63ab4fa3-11fd-4d1d-a0ee-54380cdf7469'));
  await db.exec(source('20260515013743_a0e44697-fa1d-4832-8287-996a3220c035'));
  const permissions = readFileSync('drizzle/migrations/0115_derp254_permissions_per_company.sql','utf8');
  await db.exec(permissions.slice(permissions.indexOf('CREATE OR REPLACE FUNCTION public.has_permission('), permissions.indexOf('CREATE OR REPLACE FUNCTION public.has_permission_in(')));
  await db.exec(source('20260912173212_851813b9-a9d0-481a-935e-be25b3f8b9ec'));
  await db.exec(`REVOKE ALL ON FUNCTION renegotiate_transaction_installments(uuid,jsonb,text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION renegotiate_transaction_installments(uuid,jsonb,text) TO authenticated;`);
});
afterAll(async () => { await db?.close(); });

async function seed() {
  await db.exec(`TRUNCATE transactions, transaction_audit_log;
    INSERT INTO transactions(id,type,amount,paid_amount,currency,original_amount,
      fx_rate,fx_rate_source,company_id,forecast_id,operation_key)
    VALUES ('${tx}','expense',3,0,'BRL',100.01,0.17,'manual','${companyB}','${forecast}','kept');`);
}
async function call() {
  const plan = Array.from({length:3}, () => ({amount:1,due_date:'2026-12-01'}));
  await db.query('SELECT renegotiate_transaction_installments($1,$2::jsonb,$3)',[tx,JSON.stringify(plan),'synthetic']);
}

it('executes latest source: 100.01 / 3 produces 100.02 and loses sibling forecast_id', async () => {
  await seed();
  await call();
  const result = await db.query<{total:string; linked:number; operation_keys:number}>(`
    SELECT sum(original_amount)::text total, count(forecast_id)::int linked,
      count(*) FILTER (WHERE operation_key='kept')::int operation_keys FROM transactions`);
  expect(result.rows).toEqual([{total:'100.02',linked:1,operation_keys:3}]);
});

it('executes direct call as non-owner: manager of A can mutate B in this source', async () => {
  await seed();
  await db.exec('SET SESSION AUTHORIZATION authenticated');
  try { await call(); } finally { await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE'); }
  const result = await db.query<{n:number}>(`SELECT count(*)::int n FROM transactions WHERE company_id='${companyB}'`);
  expect(result.rows[0].n).toBe(3);
});

it('actual SQL statement rollback restores original and audit after a sibling failure', async () => {
  await seed();
  await db.exec(`ALTER TABLE transactions ADD CONSTRAINT synthetic_sibling_failure CHECK (parent_transaction_id IS NULL)`);
  try {
    await expect(call()).rejects.toThrow('synthetic_sibling_failure');
    expect((await db.query(`SELECT amount::text,original_amount::text,installment_group_id FROM transactions`)).rows)
      .toEqual([{amount:'3',original_amount:'100.01',installment_group_id:null}]);
    expect((await db.query('SELECT * FROM transaction_audit_log')).rows).toEqual([]);
  } finally { await db.exec('ALTER TABLE transactions DROP CONSTRAINT synthetic_sibling_failure'); }
});

it('actual SQL statement rollback restores original after audit failure', async () => {
  await seed();
  await db.exec(`ALTER TABLE transaction_audit_log ADD CONSTRAINT synthetic_audit_failure CHECK (false)`);
  try {
    await expect(call()).rejects.toThrow('synthetic_audit_failure');
    expect((await db.query(`SELECT amount::text,original_amount::text,installment_group_id FROM transactions`)).rows)
      .toEqual([{amount:'3',original_amount:'100.01',installment_group_id:null}]);
    expect((await db.query('SELECT * FROM transaction_audit_log')).rows).toEqual([]);
  } finally { await db.exec('ALTER TABLE transaction_audit_log DROP CONSTRAINT synthetic_audit_failure'); }
});
