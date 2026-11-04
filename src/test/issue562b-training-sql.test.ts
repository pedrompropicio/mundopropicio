// @vitest-environment node
// Synthetic PGlite only. No credentials, URLs or production rows.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const migrationPath = 'drizzle/migrations/0327_issue562_training_companies.sql';
const sql = readFileSync(migrationPath, 'utf8');
const integrations = [
  'public.ticketline_sync_config', 'public.bol_sync_config', 'public.fever_sync_config',
  'public.coala_sync_config', 'public.camarim_integrations', 'public.card_integrations',
  'public.data_entry_gmail_connections', 'public.artist_channel_connections',
  'crm.ad_platform_connections', 'public.email_campaigns', 'public.portal_sites',
  'public.song_links', 'public.ugc_watchdog_config', 'public.meta_custom_audiences',
  'public.event_trackers','crm.ad_platform_account_links','crm.oauth_states','public.artist_oauth_states','public.data_entry_gmail_pending',
];
const real = '10000000-0000-0000-0000-000000000001';
const train = '10000000-0000-0000-0000-000000000002';
const uid = '10000000-0000-0000-0000-000000000003';
let db: PGlite;
let baselineCounts: unknown;
const families = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(_run_invariant_checks_\w+)\(\)/g)].map(m=>m[1]).filter(n=>!n.endsWith("_training"));
const union = families.map(n=>`SELECT * FROM public.${n}()`).join(" UNION ALL ");
const counts = async () => (await db.query(`SELECT name,current_count FROM (${union}) r ORDER BY name`)).rows;
const one = async (q: string) => (await db.query<Record<string, any>>(q)).rows[0];
const definition = (source: string, name: string) => {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(\\)[\\s\\S]*?\\$function\\$;`, 'i'));
  if (!match) throw new Error(`missing source ${name}`);
  return match[0];
};

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
  // Only tables referenced by the prepared families and guards are needed.
  const tables = new Set([...sql.matchAll(/(?:FROM|JOIN|ON|TABLE) public\.(\w+)/g)].filter(m => sql[m.index! + m[0].length] !== '(').map(m => m[1]));
  tables.add('system_invariants');
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
    ALTER TABLE email_send_log ADD CONSTRAINT email_send_log_status_check CHECK(status IN('pending','sent','suppressed','failed','bounced','complained','dlq'));
    CREATE FUNCTION public._account_true_balance_raw(uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;
    CREATE FUNCTION public._account_true_balance_asof_raw(uuid,date) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;
    CREATE FUNCTION public._camarim_fund_move_legs(uuid) RETURNS TABLE(bank_tx uuid,session_tx uuid) LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::uuid WHERE false $$;
    CREATE FUNCTION public.cache_max_contracts() RETURNS bigint LANGUAGE sql AS $$ SELECT 2::bigint $$;
    CREATE FUNCTION public._cache_free_advances_x(uuid,uuid,uuid) RETURNS TABLE(event_id uuid,amount numeric) LANGUAGE sql AS $$ SELECT NULL::uuid,0::numeric WHERE false $$;
    CREATE FUNCTION public.issue335_invariant_counts() RETURNS TABLE(name text,current_count bigint) LANGUAGE sql AS $$ SELECT ''::text,0::bigint WHERE false $$;
    INSERT INTO companies(id,status) VALUES('${real}','active');
  `);
  // Actual unchanged runner, to prove that real logging/reminder behavior survives.
  await db.exec(definition(readFileSync('supabase/migrations/20260917222206_cc918411-1854-44d9-bca2-265a9418485a.sql', 'utf8'), 'run_invariant_checks_and_log'));
  const names = new Set([...sql.matchAll(/i\.name\s*=\s*'([^']+)'|\('([^']+)', c\d+, s\d+\)/g)].map(m => m[1] ?? m[2]));
  for (const name of ['documento_sem_ficheiro_por_tabela','backup_manifesto_cobre_todos_os_buckets','backup_offsite_em_falta','backup_global_running_2h','backup_global_sem_ok_30h']) names.add(name);
  for (const name of names) await db.query(`INSERT INTO system_invariants(name,description,severity,scope,reference_count) VALUES($1,$1,'error','empresa',0)`, [name]);
  for (const m of sql.matchAll(/-- Base mais recente: ([^:]+):(\d+);/g)) {
    const source=readFileSync(m[1],'utf8').split('\n').slice(Number(m[2])-1).join('\n');
    const end=source.indexOf('$function$;',source.indexOf('$function$')+10)+11;
    await db.exec(source.slice(0,end));
  }
  baselineCounts = await counts();
  await db.exec(sql);
}, 60000);
afterAll(async () => { await db?.close(); });

describe.sequential('0327 preparation — actual SQL in synthetic PGlite', () => {
  it('manual is byte identical, top-level has no DML or transaction wrapper; rollback is entirely commented', () => {
    expect(readFileSync('supabase/manual/0327_issue562_training_companies.sql')).toEqual(readFileSync(migrationPath));
    const topLevel = sql.replace(/\$function\$[\s\S]*?\$function\$/g, '').replace(/^--.*$/gm, '');
    expect(topLevel).not.toMatch(/\b(INSERT|UPDATE|DELETE)\s+(INTO|FROM|public\.)/i);
    expect(topLevel).not.toMatch(/\b(BEGIN|COMMIT)\s*;/i);
    const rollback = readFileSync('supabase/manual/rollback_0327_issue562_training_companies_comentado.sql','utf8');
    expect(rollback.split('\n').every(line => !line.trim() || line.startsWith('--'))).toBe(true);
  });
  it('all 18 available real families retain their original counts before any training data', async () => {
    expect(await counts()).toEqual(baselineCounts);
  });
  it('column default false, RPC ACL, flag authorization on INSERT and UPDATE', async () => {
    expect((await one(`SELECT is_training FROM companies WHERE id='${real}'`)).is_training).toBe(false);
    await db.exec(`SET test.uid='${uid}'; SET test.admin='false'`);
    await expect(db.exec(`UPDATE companies SET is_training=true WHERE id='${real}'`)).rejects.toThrow('training_company_platform_admin_only');
    await expect(db.exec(`INSERT INTO companies(id,status,is_training) VALUES('${train}','active',true)`)).rejects.toThrow('training_company_platform_admin_only');
    await db.exec(`SET test.admin='true'; INSERT INTO companies(id,status,is_training) VALUES('${train}','active',true)`);
    expect(await one(`SELECT is_training_company('${train}') t,is_training_company('${real}') r,is_training_company(NULL) g`)).toEqual({t:true,r:false,g:false});
    expect(await one(`SELECT has_function_privilege('anon','is_training_company(uuid)','EXECUTE') a,has_function_privilege('authenticated','is_training_company(uuid)','EXECUTE') b,has_function_privilege('service_role','is_training_company(uuid)','EXECUTE') c`)).toEqual({a:false,b:true,c:true});
    await db.exec(`SET test.uid=''; UPDATE companies SET is_training=false WHERE id='${train}'; UPDATE companies SET is_training=true WHERE id='${train}'`);
  });
  it.each(integrations)('barrier 1: %s rejects training INSERT/UPDATE and accepts real; data pins both directions', async table => {
    await expect(db.exec(`INSERT INTO ${table}(company_id) VALUES('${train}')`)).rejects.toThrow('training_company_no_integrations');
    await db.exec(`INSERT INTO ${table}(company_id) VALUES('${real}')`);
    await expect(db.exec(`UPDATE ${table} SET company_id='${train}' WHERE company_id='${real}'`)).rejects.toThrow('training_company_no_integrations');
    await expect(db.exec(`UPDATE companies SET is_training=true WHERE id='${real}'`)).rejects.toThrow('training_company_has_data');
    await db.exec(`DELETE FROM ${table}`);
  });
  it.each(['transactions','events','suppliers'])('data in %s pins flag in both directions', async table => {
    for (const company of [real,train]) {
      await db.exec(`INSERT INTO ${table}(id,company_id) VALUES(gen_random_uuid(),'${company}')`);
      await expect(db.exec(`UPDATE companies SET is_training=NOT is_training WHERE id='${company}'`)).rejects.toThrow('training_company_has_data');
      await db.exec(`DELETE FROM ${table}`);
    }
  });
  it('barrier 2 preserves real/global values and suppresses training outputs using existing CHECK', async () => {
    for (const company of [real,train,null]) {
      const origin = company ? `'${company}'` : 'NULL';
      const isTraining = company === train;
      const n = await one(`INSERT INTO notification_queue(company_id,status,last_error) VALUES(${origin},'queued','original') RETURNING status,last_error`);
      expect(n).toEqual({status:isTraining?'skipped':'queued',last_error:isTraining?'suppressed_training':'original'});
      const r = await one(`INSERT INTO system_reminders(company_id,is_active) VALUES(${origin},true) RETURNING is_active,completed_at IS NOT NULL completed`);
      expect(r).toEqual({is_active:!isTraining,completed:isTraining});
      const e = await one(`INSERT INTO email_send_log(company_id,status) VALUES(${origin},'pending') RETURNING status`);
      expect(e.status).toBe(isTraining?'suppressed':'pending');
    }
  });
  it('barrier 4 resolves SEPA parent and rejects accounting history, real rows accepted', async () => {
    for (const company of [real,train]) {
      await db.exec(`INSERT INTO payment_lists(id,company_id) VALUES('${company}','${company}')`);
      const sepa = `INSERT INTO payment_list_sepa_exports(payment_list_id) VALUES('${company}')`;
      const accounting = `INSERT INTO accounting_exports(company_id) VALUES('${company}')`;
      if (company === train) {
        await expect(db.exec(sepa)).rejects.toThrow('training_company_no_export');
        await expect(db.exec(accounting)).rejects.toThrow('training_company_no_export');
      } else { await db.exec(sepa); await db.exec(accounting); }
    }
  });
  it('barrier 3 known families: synthetic training violations do not change real counts, including backup', async () => {
    const before = await counts();
    await db.exec(`INSERT INTO transactions(id,company_id,type,event_id,paid_amount,amount,iva_rate) VALUES('${train}','${train}','invalid','${train}',100,1,0);
      INSERT INTO backup_runs(company_id,scope,status,started_at) VALUES('${train}','global','running',now()-interval '3 hours');
      INSERT INTO portal_error_log(company_id,created_at,message) VALUES('${train}',now(),'synthetic');`);
    expect(await counts()).toEqual(before);
    expect((await one(`SELECT current_count FROM _run_invariant_checks_raw_training() WHERE name='tipo_invalido'`)).current_count).toBe(1);
    // A real owner referencing a training event remains a REAL violation.
    await db.exec(`INSERT INTO events(id,company_id) VALUES('${train}','${train}');
      INSERT INTO transactions(id,company_id,type,event_id) VALUES('${real}','${real}','expense','${train}')`);
    expect((await one(`SELECT current_count FROM _run_invariant_checks_raw() WHERE name='tx_evento_outra_empresa'`)).current_count).toBe(1);
  });
  it('training run writes only its log, zero reminders; all known training families execute', async () => {
    const before = (await one('SELECT count(*) n FROM system_reminders')).n;
    await db.exec('SELECT run_training_invariant_checks_and_log()');
    expect((await one('SELECT count(*) n FROM system_reminders')).n).toBe(before);
    const log = await one('SELECT scope_training,results FROM invariant_runs');
    expect(log.scope_training).toBe(true);
    expect(log.results.find((r: any)=>r.name==='tipo_invalido').current_count).toBe(1);
    expect(log.results.every((r:any)=>r.reference_count===0)).toBe(true);
    expect(log.results.some((r:any)=>r.name==='backup_global_running_2h')).toBe(false);
  });
});

it('rollback restores every redefined source verbatim and removes the training additions',async()=>{
  const rb=readFileSync('supabase/manual/rollback_0327_issue562_training_companies_comentado.sql','utf8');
  for(const m of sql.matchAll(/-- Base mais recente: ([^:]+):(\d+);/g)) {
    const src=readFileSync(m[1],'utf8').split('\n').slice(Number(m[2])-1).join('\n');
    const original=src.slice(0,src.indexOf('$function$;',src.indexOf('$function$')+10)+11);
    expect(rb).toContain(original.split('\n').map(l=>l?'-- '+l:'--').join('\n'));
  }
  await db.exec(rb.split('\n').map(l=>l.startsWith('-- ')?l.slice(3):l==='--'?'':l).join('\n'));
  expect((await one("SELECT count(*) n FROM information_schema.columns WHERE table_schema='public' AND ((table_name='companies' AND column_name='is_training') OR (table_name='invariant_runs' AND column_name='scope_training'))")).n).toBe(0);
});
