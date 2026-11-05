// @vitest-environment node
// Actual prepared migrations, in-memory PGlite only; no application database or credentials.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';

const prior = readFileSync('drizzle/migrations/0327_issue562_training_companies.sql', 'utf8');
const sql = prior; // Fixture tables are derived from the actual 0327 references.
const migrationPath = 'drizzle/migrations/0332_issue562c_training_gaps.sql';
const real = '10000000-0000-0000-0000-000000000001';
const train = '10000000-0000-0000-0000-000000000002';
const account = '20000000-0000-0000-0000-000000000001';
const trainingAccount = '20000000-0000-0000-0000-000000000002';
let db: PGlite;
const definition = (source: string, name: string) => {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$;`, 'i'));
  if (!match) throw new Error(`missing source ${name}`);
  return match[0];
};
const one = async (q: string) => (await db.query<Record<string, any>>(q)).rows[0];
const extrato = async () => (await db.query('SELECT * FROM _run_invariant_checks_extrato()')).rows;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA crm; CREATE SCHEMA storage; CREATE SCHEMA cron;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE FUNCTION public.has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin',true),'false')='true' $$;
    CREATE TABLE storage.objects(bucket_id text,name text);
    CREATE TABLE storage.buckets(id text);
    CREATE TABLE cron.job_run_details(jobid bigint,runid bigint,status text,end_time timestamptz);
  `);
  // Schema-shaped fixture: columns from the checked-in schema, without operational data.
  // Unrelated canonical balance/legs helpers below are fixture inputs, not a claim of catalog parity.
  const schema = readFileSync('src/integrations/supabase/types.ts', 'utf8');
  const definitions = new Map<string, string>();
  for (const m of schema.matchAll(/^      (\w+): \{\n        Row: \{([\s\S]*?)\n        \}/gm)) {
    const columns: string[] = [];
    for (const c of m[2].matchAll(/^          (\w+): ([^\n]+)/gm)) {
      const [, name, type] = c;
      const sqlType = type.includes('Json') ? 'jsonb' : type.includes('boolean') ? 'boolean'
        : type.includes('number') ? (name === 'reference_count' ? 'bigint' : 'numeric')
        : /(^id$|_id$|_by$)/.test(name) && !['external_id','facebook_id','pixel_id','meta_pixel_id','tiktok_pixel_id','created_by','uploaded_by','exported_by','matched_by','ran_by'].includes(name) ? 'uuid'
        : /(_at$|^expires_at$)/.test(name) ? 'timestamptz'
        : /(^date$|_date$|^period_from$|^period_to$)/.test(name) ? 'date'
        : type.includes('[]') ? 'text[]' : 'text';
      columns.push(`"${name}" ${sqlType}`);
    }
    if (columns.length) definitions.set(m[1], columns.join(','));
  }
  // Rebuild the pre-0327 schema even when the generated types include its columns.
  const addedColumns = [...sql.matchAll(/ALTER\s+TABLE\s+public\.(\w+)\s+ADD\s+COLUMN\s+(\w+)/gi)];
  for (const [, table, column] of addedColumns) {
    const columns = definitions.get(table);
    if (columns !== undefined) {
      definitions.set(table, columns.split(',').filter(c => !c.startsWith(`"${column}" `)).join(','));
    }
  }
  expect(addedColumns.filter(([, table, column]) =>
    definitions.get(table)?.split(',').some(c => c.startsWith(`"${column}" `)),
  )).toEqual([]);
  // Only tables referenced by the prepared families and guards are needed.
  const tables = new Set([...sql.matchAll(/(?:FROM|JOIN|ON|TABLE) public\.(\w+)/g)].filter(m => sql[m.index! + m[0].length] !== '(').map(m => m[1]));
  tables.add('system_invariants');
  tables.add('lead_capture');
  for (const table of tables) {
    if (!definitions.has(table)) throw new Error(`fixture table absent: ${table}`);
    await db.exec(`CREATE TABLE public.${table}(${definitions.get(table)})`);
  }
  await db.exec(`CREATE TABLE crm.ad_platform_connections(id uuid,company_id uuid);
    CREATE TABLE crm.ad_platform_account_links(id uuid,company_id uuid);
    CREATE TABLE crm.oauth_states(id uuid,company_id uuid);
    ALTER TABLE companies ADD PRIMARY KEY(id);
    ALTER TABLE transactions ADD PRIMARY KEY(id);
    ALTER TABLE event_ticket_zones ADD PRIMARY KEY(id);
    ALTER TABLE events ADD PRIMARY KEY(id);
    ALTER TABLE system_reminders ADD UNIQUE(key);
    ALTER TABLE invariant_runs ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE invariant_runs ALTER COLUMN drift_count TYPE integer USING drift_count::integer;
    ALTER TABLE email_send_log ADD CONSTRAINT email_send_log_status_check CHECK(status IN('pending','sent','suppressed','failed','bounced','complained','dlq'));
    CREATE FUNCTION public._account_true_balance_raw(uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;
    CREATE TABLE fixture_balances(account_id uuid PRIMARY KEY, balance numeric);
    CREATE FUNCTION public._account_true_balance_asof_raw(uuid,date) RETURNS numeric LANGUAGE sql AS $$ SELECT balance FROM fixture_balances WHERE account_id=$1 $$;
    CREATE FUNCTION public._camarim_fund_move_legs(uuid) RETURNS TABLE(bank_tx uuid,session_tx uuid) LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::uuid WHERE false $$;
    CREATE FUNCTION public.cache_max_contracts() RETURNS bigint LANGUAGE sql AS $$ SELECT 2::bigint $$;
    CREATE FUNCTION public._cache_free_advances_x(uuid,uuid,uuid) RETURNS TABLE(event_id uuid,amount numeric) LANGUAGE sql AS $$ SELECT NULL::uuid,0::numeric WHERE false $$;
    CREATE FUNCTION public.issue335_invariant_counts() RETURNS TABLE(name text,current_count bigint) LANGUAGE sql AS $$ SELECT ''::text,0::bigint WHERE false $$;
    INSERT INTO companies(id,status) VALUES('${real}','active');
  `);
  await db.exec(prior);
  await db.exec(`CREATE TABLE clube_newgang_summary_cache(company_id uuid PRIMARY KEY,payload jsonb,computed_at timestamptz DEFAULT now());
    CREATE FUNCTION clube_newgang_summary_compute(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('company_id',$1) $$;
    INSERT INTO system_invariants(name,description,severity,scope,reference_count,notes)
    VALUES('saldo_conta_difere_do_extrato','Saldo / extrato','error','empresa',0,'fixture');
    INSERT INTO companies(id,status,is_training) VALUES('${train}','active',true);
  `);
  await db.exec(readFileSync(migrationPath, 'utf8'));
}, 60000);
afterAll(async () => { await db?.close(); });

const prepared = readFileSync(migrationPath, 'utf8');
const rollbackText = readFileSync('supabase/manual/rollback_0332_issue562c_training_gaps_comentado.sql', 'utf8');
const rollback = rollbackText.split('\n').map(line => line.replace(/^-- ?/, '')).join('\n');
const originalExtrato = definition(rollback, '_run_invariant_checks_extrato');
const originalRefresh = definition(readFileSync('drizzle/migrations/0304_issue450_clube_newgang_summary_cache.sql', 'utf8'), 'clube_newgang_summary_refresh');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const seedAccounts = async (training = true) => {
  await db.exec(`INSERT INTO financial_accounts(id,company_id,name,initial_balance,initial_balance_date)
    VALUES('${account}','${real}','Conta real sintética',100,'2026-01-01');
    INSERT INTO bank_statement_lines(financial_account_id,booking_date,amount)
    VALUES('${account}','2026-01-01',999),('${account}','2026-01-02',20);
    INSERT INTO fixture_balances VALUES('${account}',124);
  `);
  if (training) await db.exec(`INSERT INTO financial_accounts(id,company_id,name,initial_balance)
    VALUES('${trainingAccount}','${train}','Conta de treino sintética',0);
    INSERT INTO bank_statement_lines(financial_account_id,booking_date,amount)
    VALUES('${trainingAccount}','2026-01-02',2000);
    INSERT INTO fixture_balances VALUES('${trainingAccount}',9999);`);
};

// Each behavioral proof rolls its synthetic rows back; no operational database is used.
beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('ROLLBACK'); });

describe.sequential('0332 after the full 0327, local PGlite', () => {
  it('manual bytes match; rollback is fully commented and restores the literal bases', () => {
    expect(readFileSync('supabase/manual/0332_issue562c_training_gaps.sql')).toEqual(readFileSync(migrationPath));
    expect(rollbackText.split('\n').every(line => !line.trim() || line.startsWith('--'))).toBe(true);
    // Fixed hash of the literal extrato supplied in the dispatch, captured before generation.
    expect(hash(originalExtrato)).toBe('e334a6e6aec61be986dfd1974a790a7aad18f0fdb8610f33789c8477bc46e62e');
    expect(definition(rollback, 'clube_newgang_summary_refresh')).toBe(originalRefresh);
    expect(definition(rollback, 'run_training_invariant_checks_and_log')).toBe(definition(prior, 'run_training_invariant_checks_and_log'));
    expect(rollback).toContain('DROP FUNCTION public._run_invariant_checks_extrato_scoped(boolean);');
    const top = prepared.replace(/\$function\$[\s\S]*?\$function\$/g, '').replace(/^--.*$/gm, '');
    expect(top).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|SELECT|BEGIN|COMMIT)\b/i);
    const realBody = definition(prepared, '_run_invariant_checks_extrato');
    expect(realBody.replace('\n      JOIN public.companies co ON co.id = a.company_id AND NOT co.is_training', '')).toBe(originalExtrato);
    expect(definition(prepared, 'run_training_invariant_checks_and_log').replace('\n    UNION ALL SELECT * FROM public._run_invariant_checks_extrato_scoped(true)', '')).toBe(definition(prior, 'run_training_invariant_checks_and_log'));
    expect(definition(prepared, 'clube_newgang_summary_refresh').replace('\n AND EXISTS (SELECT 1 FROM public.companies co WHERE co.id = public.lead_capture.company_id AND NOT co.is_training)', '')).toBe(originalRefresh);
  });
  it('real extrato retains the literal result bytes with and without a divergent training account', async () => {
    await seedAccounts(false);
    await db.exec(originalExtrato.replace('public._run_invariant_checks_extrato()', 'public.fixture_extrato_original()'));
    const before = (await db.query('SELECT * FROM fixture_extrato_original()')).rows;
    expect(await extrato()).toEqual(before);
    expect(before[0]).toMatchObject({ current_count: 1, sample: [{ conta: 'Conta real sintética', ate_data: '2026-01-02', banco: 120, sistema: 124, diferenca: 4 }] });
    await db.exec(`INSERT INTO financial_accounts(id,company_id,name,initial_balance)
      VALUES('${trainingAccount}','${train}','Treino',0);
      INSERT INTO bank_statement_lines(financial_account_id,booking_date,amount) VALUES('${trainingAccount}','2026-01-02',2000);
      INSERT INTO fixture_balances VALUES('${trainingAccount}',9999);`);
    expect(JSON.stringify(await extrato())).toBe(JSON.stringify(before));
    expect((await one('SELECT current_count FROM fixture_extrato_original()')).current_count).toBe(2);
    expect((await db.query('SELECT * FROM _run_invariant_checks_extrato_scoped(false)')).rows).toEqual(before);
    expect((await one('SELECT current_count FROM _run_invariant_checks_extrato_scoped(true)')).current_count).toBe(1);
  });
  it('training runner includes extrato, uses its zero reference and creates or changes no reminders', async () => {
    await seedAccounts();
    await db.exec(`INSERT INTO system_reminders(key,title,is_active) VALUES('invariant_drift','Real untouched',true);
      UPDATE system_invariants SET reference_count=12 WHERE name='saldo_conta_difere_do_extrato';`);
    const before = (await db.query('SELECT * FROM system_reminders')).rows;
    const { id } = await one('SELECT run_training_invariant_checks_and_log() AS id');
    const run = await one(`SELECT * FROM invariant_runs WHERE id='${id}'`);
    expect(run.scope_training).toBe(true);
    expect(run.drift_count).toBe(1);
    expect(run.results).toContainEqual(expect.objectContaining({ name: 'saldo_conta_difere_do_extrato', current_count: 1, reference_count: 0, conforme: false }));
    expect((await db.query('SELECT * FROM system_reminders')).rows).toEqual(before);
    expect((await one("SELECT reference_count FROM system_invariants WHERE name='saldo_conta_difere_do_extrato'")).reference_count).toBe(12);
  });
  it('internal functions stay service-only and training execution rejects non-platform sessions', async () => {
    for (const signature of ['_run_invariant_checks_extrato()', '_run_invariant_checks_extrato_scoped(boolean)', 'clube_newgang_summary_refresh()']) {
      const result = (await db.query(`SELECT has_function_privilege('anon',$1,'EXECUTE') a,
        has_function_privilege('authenticated',$1,'EXECUTE') u,has_function_privilege('service_role',$1,'EXECUTE') s`, [signature])).rows[0];
      expect(result).toEqual({ a: false, u: false, s: true });
    }
    await db.exec(`SET test.uid='${real}'; SET test.admin='false';`);
    await expect(db.query('SELECT run_training_invariant_checks_and_log()')).rejects.toThrow('training_company_platform_admin_only');
  });
  it('refresh preserves real payloads and leaves existing training cache untouched', async () => {
    await db.exec(`INSERT INTO lead_capture(company_id,source) VALUES('${real}','clube_newgang'),('${real}','clube_newgang'),('${train}','clube_newgang'),(NULL,'clube_newgang');
      INSERT INTO clube_newgang_summary_cache VALUES('${train}','{"sentinel":true}','2026-01-01');`);
    const before = await one(`SELECT * FROM clube_newgang_summary_cache WHERE company_id='${train}'`);
    await db.exec('SELECT clube_newgang_summary_refresh()');
    expect(await one(`SELECT * FROM clube_newgang_summary_cache WHERE company_id='${train}'`)).toEqual(before);
    expect((await one(`SELECT payload FROM clube_newgang_summary_cache WHERE company_id='${real}'`)).payload).toEqual({ company_id: real });
    await db.exec(`DELETE FROM clube_newgang_summary_cache WHERE company_id='${train}'; SELECT clube_newgang_summary_refresh();`);
    expect((await one(`SELECT count(*) n FROM clube_newgang_summary_cache WHERE company_id='${train}'`)).n).toBe(0);
  });
  it('commented rollback restores both original functions and the 0327 runner', async () => {
    await db.exec(rollback.replace(/^#.*$|^Repor.*$|^Extrato.*$|^Refresh.*$/gm, ''));
    expect((await one("SELECT to_regprocedure('public._run_invariant_checks_extrato_scoped(boolean)') AS f")).f).toBeNull();
    for (const [name, expected] of [['_run_invariant_checks_extrato', originalExtrato], ['clube_newgang_summary_refresh', originalRefresh], ['run_training_invariant_checks_and_log', definition(prior, 'run_training_invariant_checks_and_log')]]) {
      const { body } = await one(`SELECT prosrc body FROM pg_proc WHERE oid='public.${name}()'::regprocedure`);
      expect(body).toBe(expected.split('$function$')[1]);
    }
  });
});
