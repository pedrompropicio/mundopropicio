// @vitest-environment node
// Inerte: SQL real apenas em PostgreSQL WASM efémero, sem credenciais ou base externa.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const prior = read('drizzle/migrations/0331_issue647_song_link_retencao.sql');
const migration = read('drizzle/migrations/0333_issue647_retencao_por_zona.sql');
const manual = read('supabase/manual/0333_issue647_retencao_por_zona.sql');
const rollback = read('supabase/manual/rollback_0333_issue647_retencao_por_zona_comentado.sql');
const cron = read('supabase/manual/cron_song_link_events_retencao_live.sql');
const zoneSource = read('supabase/functions/_shared/protected-zone.ts');
const eligibleByZone = `e.created_at < now()-make_interval(days=>CASE WHEN public.song_link_is_protected_zone(e.country) THEN 30 ELSE 90 END)`;
const source = {
  stats: read('drizzle/migrations/0299_issue350_song_link_stats_aberturas.sql'),
  origins: read('drizzle/migrations/0257_dia_a_dia_traffic_platform_fix.sql'),
  report: read('drizzle/migrations/0229_period_report_exact_hourly.sql'),
  arrivals: read('drizzle/migrations/0225_song_link_arrivals_hourly.sql'),
  daily: read('drizzle/migrations/0233_period_report_exact_daily_visitors.sql'),
};
function definition(sql: string, name: string) {
  const match = sql.match(new RegExp(`^CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(.*?AS (\\$\\w*\\$).*?\\1;`, 'ms'));
  if (!match) throw new Error(`Missing real definition: ${name}`);
  return match[0];
}
const company = '10000000-0000-4000-8000-000000000001';
const artist = '10000000-0000-4000-8000-000000000002';
const song = '10000000-0000-4000-8000-000000000003';
const link = '10000000-0000-4000-8000-000000000004';
const link2 = '10000000-0000-4000-8000-000000000005';
const otherCompany = '20000000-0000-4000-8000-000000000001';
const otherArtist = '20000000-0000-4000-8000-000000000002';
const otherSong = '20000000-0000-4000-8000-000000000003';
const otherLink = '20000000-0000-4000-8000-000000000004';
const identifiers = ['ip_hash', 'fbclid', 'ttclid', 'capi_fbp', 'capi_fbc', 'capi_external_id', 'event_id', 'arrival_event_id'];
const hasIds = identifiers.map(c => `${c} IS NOT NULL`).join(' OR ');
const aggregates = ['song_link_report_hourly', 'song_link_report_visitors_hourly',
  'song_link_report_visitor_refs_daily', 'song_link_report_visitor_totals_daily', 'song_link_arrivals_hourly'];
const newAggregates = ['song_link_ident_daily_stats', 'song_link_ident_daily_origins'];
let db: PGlite;
let windows: Record<string, {from: string; to: string}>;
let baseline: Record<string, unknown>;
let originalAcl: unknown;
async function scalar<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<{r: T}>(sql, params)).rows[0].r;
}
async function snapshot(tables = aggregates) {
  const result: Record<string, unknown> = {};
  for (const t of tables) result[t] = await scalar(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') r FROM public.${t} x`);
  return result;
}
async function reports() {
  const result: Record<string, unknown> = {};
  for (const [key, w] of Object.entries(windows)) {
    result[`${key}:0299`] = await scalar(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.dia,r.link_id,r.utm_campaign,r.utm_content,r.canal),'[]') r FROM public.artist_song_link_stats($1,$2,$3) r`, [artist, w.from, w.to]);
    result[`${key}:0257`] = await scalar('SELECT public.artist_song_play_origins_compare($1,$2,$3) r', [artist, w.from, w.to]);
  }
  return result;
}
const acl = () => scalar(`SELECT jsonb_agg(jsonb_build_object('function',p.oid::regprocedure::text,'acl',p.proacl::text) ORDER BY p.proname) r
  FROM pg_proc p WHERE p.proname IN ('artist_song_link_stats','artist_song_play_origins_compare')`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA crm; CREATE SCHEMA extensions;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE FUNCTION public.artist_access_check(uuid,text,text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('test.deny',true)='on' THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
      RETURN '${company}'::uuid; END $$;
    CREATE FUNCTION extensions.unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
    CREATE TABLE public.artists(id uuid PRIMARY KEY, company_id uuid);
    CREATE TABLE public.song_links(id uuid PRIMARY KEY,canal text,slug text,song_id uuid);
    CREATE TABLE public.artist_songs(id uuid PRIMARY KEY,title text,release_date date,artist_id uuid,company_id uuid,tracking_status text);
    CREATE TABLE public.artist_song_metrics_daily(id uuid,song_id uuid,artist_id uuid,company_id uuid,platform text,metric text,metric_date date,value numeric,source text,captured_at timestamptz);
    CREATE TABLE public.artist_song_playlist_streams(song_id uuid,artist_id uuid,company_id uuid,snapshot_date date,period_days int,source text,streams int,playlist_kind text,playlist_uri text,playlist_name text);
    CREATE TABLE public.artist_song_playlist_daily(song_id uuid,artist_id uuid,company_id uuid,day date,streams_day numeric,estimated boolean,category text,playlist_kind text,made_by text);
    CREATE TABLE public.artist_song_tiktok_sound_daily(song_id uuid,company_id uuid,metric_date date,music_id text,video_count bigint,source text);
    CREATE TABLE crm.google_campaign_insights_daily(company_id uuid,date_start date,video_metrics jsonb,campaign_name text);
    CREATE TABLE crm.ad_platform_connections(id uuid,platform text,connection_scope text,artist_id uuid,company_id uuid,selected_ad_account_currency text);
    CREATE TABLE crm.meta_campaign_snapshot(connection_id uuid,external_campaign_id text,name text,currency text,last_synced_at timestamptz);
    CREATE TABLE crm.meta_campaign_insights_daily(connection_id uuid,external_campaign_id text,date_start date,spend_cents bigint,currency text);
    INSERT INTO public.artists VALUES('${artist}','${company}'),('${otherArtist}','${otherCompany}');
    INSERT INTO public.artist_songs VALUES('${song}','Synthetic song','2024-01-01','${artist}','${company}','ativo'),('${otherSong}','Other song','2024-01-01','${otherArtist}','${otherCompany}','ativo');
    INSERT INTO public.song_links VALUES('${link}',NULL,'synthetic','${song}'),('${link2}',NULL,'synthetic-2','${song}'),('${otherLink}',NULL,'other','${otherSong}');`);
  const legacy = read('supabase/migrations/20260924202758_ed08efce-1944-4b70-b975-cd4d0996a981.sql');
  // Real table, constraints, channel classifier, identifier indexes and triggers; only unrelated dependencies above are fixtures.
  await db.exec(legacy.match(/CREATE TABLE public.song_link_events \([\s\S]*?\n\);/)![0]);
  await db.exec(`ALTER TABLE public.song_link_events ADD COLUMN capi_fbp text, ADD COLUMN capi_fbc text, ADD COLUMN capi_external_id text;`);
  const slots = read('drizzle/migrations/0209_aj19_app_open_delivery_slots.sql');
  await db.exec(slots.slice(slots.indexOf('ALTER TABLE public.song_link_events DROP CONSTRAINT song_link_events_event_check;'), slots.indexOf('CREATE TABLE IF NOT EXISTS public.song_link_delivery_slots')));
  await db.exec(read('drizzle/migrations/0080_derp234_song_link_ssr_dedup.sql').match(/CREATE UNIQUE INDEX[\s\S]*?;/)![0]);
  await db.exec(definition(read('drizzle/migrations/0028_derp185b_song_link_canal_medium.sql'), 'song_link_event_canal'));
  await db.exec(definition(legacy, 'song_link_utm_slug'));
  await db.exec(source.arrivals);
  await db.exec(source.report);
  await db.exec(source.daily);
  await db.exec(definition(source.stats, 'artist_song_link_stats'));
  await db.exec(definition(source.origins, 'artist_song_play_origins_compare'));
  await db.exec(`REVOKE ALL ON FUNCTION public.artist_song_link_stats(uuid,date,date),public.artist_song_play_origins_compare(uuid,date,date) FROM PUBLIC,anon;
    GRANT EXECUTE ON FUNCTION public.artist_song_link_stats(uuid,date,date),public.artist_song_play_origins_compare(uuid,date,date) TO authenticated,service_role;
    CREATE TEMP TABLE fixture_times AS
    SELECT (date_trunc('day',now() AT TIME ZONE 'UTC')-interval '40 days'+v.h) AT TIME ZONE 'UTC' ts
      FROM (VALUES(interval '22 hours 17 minutes'),(interval '23 hours 47 minutes'),(interval '26 hours 47 minutes'),(interval '27 hours 17 minutes')) v(h)
    UNION ALL SELECT now()-interval '14 months'
    UNION ALL SELECT now()-interval '2 days'
    UNION ALL SELECT now()-interval '30 days 1 hour 43 minutes'
    UNION ALL SELECT now()-interval '30 days'+interval '1 minute';
    INSERT INTO public.song_link_events(link_id,company_id,artist_id,song_id,event,opened,destination,event_id,arrival_event_id,utm_source,utm_medium,utm_campaign,utm_content,fbclid,ttclid,ip_hash,capi_fbp,capi_fbc,capi_external_id,os,country,created_at)
    SELECT l.id,'${company}','${artist}','${song}',e.event,e.opened,'spotify',gen_random_uuid()::text,
      CASE WHEN e.event<>'arrival' AND e.source<>'null_ids' THEN gen_random_uuid()::text END,
      e.source,e.medium,'campaign',e.content,e.fb,e.tt,
      CASE WHEN e.source<>'null_ids' THEN 'same-visitor-across-links' END,'fbp','fbc','external','ios','BR',t.ts
    FROM fixture_times t CROSS JOIN (VALUES('${link}'::uuid),('${link2}'::uuid)) l(id)
    CROSS JOIN (VALUES
      ('arrival','app','meta','paid',NULL::text,NULL::text,NULL::text),
      ('choice','web','unknown','organic',NULL,'fb-click',NULL),
      ('app_open','app','unknown','organic',NULL,NULL,'tt-click'),
      ('choice','app','meta','paid','teste_excluded',NULL,NULL),
      ('choice','app','null_ids','paid',NULL,NULL,NULL),
      ('choice','web','tiktok','paid','different_content',NULL,NULL)
    ) e(event,opened,source,medium,content,fb,tt);
    INSERT INTO public.song_link_events(link_id,company_id,artist_id,song_id,event,event_id,ip_hash,utm_medium,fbclid,os,country,created_at)
      SELECT '${otherLink}','${otherCompany}','${otherArtist}','${otherSong}','choice',gen_random_uuid()::text,'other-visitor','paid','other-fb','ios','PT',ts FROM fixture_times;
    INSERT INTO crm.ad_platform_connections VALUES('${link}','meta','artist','${artist}','${company}','BRL');
    INSERT INTO crm.meta_campaign_snapshot VALUES('${link}','campaign-id','Campaign','BRL',now());
    INSERT INTO crm.meta_campaign_insights_daily SELECT '${link}','campaign-id',(ts AT TIME ZONE 'Europe/Lisbon')::date,10000,'BRL' FROM fixture_times;
  `);
  await db.exec(`CREATE TEMP TABLE fixture_cohorts AS
    SELECT gen_random_uuid() id,country,age,
      (date_trunc('day',now() AT TIME ZONE 'UTC')-make_interval(days=>age)+interval '12 hours 17 minutes') AT TIME ZONE 'UTC' created_at
    FROM (VALUES('BR',40),('BR',95),('US',40),('US',95),('PT',40),('DE',40),(NULL,40),('',40),('???',40),('XX',40)) c(country,age);
    INSERT INTO song_link_events(id,link_id,company_id,artist_id,song_id,event,opened,destination,event_id,arrival_event_id,
      utm_source,utm_medium,utm_campaign,ip_hash,fbclid,ttclid,capi_fbp,capi_fbc,capi_external_id,os,country,created_at)
    SELECT id,'${link}','${company}','${artist}','${song}','app_open','app','spotify',gen_random_uuid()::text,gen_random_uuid()::text,
      'meta','paid','zone-cohort','person-'||id,'fb-'||id,'tt-'||id,'fbp-'||id,'fbc-'||id,'external-'||id,'ios',country,created_at
    FROM fixture_cohorts;`);
  windows = await scalar(`SELECT jsonb_build_object(
    'old',jsonb_build_object('from',(now()-interval '42 days')::date,'to',(now()-interval '37 days')::date),
    'ninety',jsonb_build_object('from',(now()-interval '97 days')::date,'to',(now()-interval '93 days')::date),
    'recent',jsonb_build_object('from',(now()-interval '4 days')::date,'to',now()::date),
    'boundary',jsonb_build_object('from',(now()-interval '32 days')::date,'to',(now()-interval '28 days')::date),
    'purged',jsonb_build_object('from',(now()-interval '14 months 2 days')::date,'to',(now()-interval '14 months'+interval '2 days')::date)) r`);
  baseline = await reports();
  originalAcl = await acl();
  await db.exec(prior);
  await db.exec(migration);
}, 30000);
beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => {
  await db.exec('ROLLBACK');
  // PGlite exige reposição explícita da identidade após os testes de ACL.
  await db.exec('SET SESSION AUTHORIZATION postgres; RESET ROLE');
});
afterAll(async () => { await db?.close(); });

describe('0333 #647 — preparação e equivalência com 0331', () => {
  it('C1: manual byte a byte igual e rollback comentado restaura definição e ACL completas', async () => {
    expect(manual).toBe(migration);
    expect(rollback.split('\n').filter(Boolean).every(line => line.startsWith('-- '))).toBe(true);
    const restored = rollback.split('\n').map(line => line.slice(3)).join('\n');
    expect(definition(restored, 'anonymize_song_link_events')).toBe(definition(prior, 'anonymize_song_link_events'));
    const aclLines = (sql: string) => sql.split('\n').filter(line => /^(REVOKE|GRANT|COMMENT).*public\.anonymize_song_link_events\(/.test(line));
    expect(aclLines(restored)).toEqual(aclLines(prior));
    expect(restored).toContain('DROP FUNCTION public.anonymize_song_link_events(integer, integer, integer);');
    expect(restored).toContain('DROP FUNCTION public.song_link_is_protected_zone(text);');
    // Só a parte SQL do rollback é executada, numa fixture efémera, para provar a assinatura restaurada.
    await db.exec(restored.slice(restored.indexOf('DROP FUNCTION')));
    expect(await scalar(`SELECT to_regprocedure('public.anonymize_song_link_events(integer,integer,integer)') IS NULL r`)).toBe(true);
    expect(await scalar(`SELECT to_regprocedure('public.song_link_is_protected_zone(text)') IS NULL r`)).toBe(true);
    expect(await scalar('SELECT public.anonymize_song_link_events(30,1) r')).toBe(1);
  });
  it('C1/C2: corpo preservado byte a byte salvo assinatura, guardas, prazo por linha e remoção do bloqueio', () => {
    const expected = definition(prior, 'anonymize_song_link_events')
      .replace('p_days integer DEFAULT 30, p_batch', 'p_days_protected integer DEFAULT 30, p_days_other integer DEFAULT 90, p_batch')
      .replace('DECLARE v_cutoff timestamptz; v_count', 'DECLARE v_count')
      .replace(" IF p_days IS NULL OR p_days<30 THEN RAISE EXCEPTION 'p_days must be >= 30'; END IF;",
        " IF p_days_protected IS NULL OR p_days_protected<30 THEN RAISE EXCEPTION 'p_days_protected must be >= 30'; END IF;\n IF p_days_other IS NULL OR p_days_other<p_days_protected THEN RAISE EXCEPTION 'p_days_other must be >= p_days_protected'; END IF;")
      .replace(' v_cutoff:=now()-make_interval(days => p_days);\n LOCK TABLE public.song_link_events IN SHARE ROW EXCLUSIVE MODE;\n', '')
      .split('e.created_at<v_cutoff').join('e.created_at < now() - make_interval(days => CASE WHEN public.song_link_is_protected_zone(e.country) THEN p_days_protected ELSE p_days_other END)');
    expect(definition(migration, 'anonymize_song_link_events')).toBe(expected);
    expect(migration).not.toMatch(/\bLOCK\s+TABLE\b/i);
    expect(migration).toContain('DROP FUNCTION public.anonymize_song_link_events(integer, integer);');
  });
  it('C4: lista SQL tem exactamente os 32 códigos protegidos do ficheiro TS e normaliza países desconhecidos', async () => {
    const tsCodes = [...zoneSource.match(/PROTECTED_ZONE = new Set\(\[([\s\S]*?)\]\)/)![1].matchAll(/"([A-Z]{2})"/g)].map(match => match[1]);
    const sqlCodes = [...definition(migration, 'song_link_is_protected_zone').match(/ANY\(ARRAY\[([^\]]+)\]/)![1].matchAll(/'([A-Z]{2})'/g)].map(match => match[1]);
    expect(tsCodes).toHaveLength(32);
    expect(sqlCodes).toHaveLength(32);
    expect([...sqlCodes].sort()).toEqual([...tsCodes].sort());
    for (const code of tsCodes) expect(await scalar('SELECT public.song_link_is_protected_zone($1) r', [` ${code.toLowerCase()} `])).toBe(true);
    for (const country of [null,'','   ','X','???','BRA','T1','XX','ZZ']) {
      expect(await scalar('SELECT public.song_link_is_protected_zone($1) r', [country])).toBe(true);
    }
    for (const country of ['BR','US',' br ','us']) expect(await scalar('SELECT public.song_link_is_protected_zone($1) r', [country])).toBe(false);
    // O inventário ISO também vem do TS; uma entrada desconhecida nunca abre o prazo de 90 dias.
    const isoCodes = [...zoneSource.match(/const ISO_COUNTRIES = new Set\(\(([\s\S]*?)\)\.split/)![1].matchAll(/"([A-Z ]+)"/g)].map(match => match[1]).join('').split(' ');
    expect(new Set(isoCodes).size).toBe(249);
    for (const code of isoCodes) expect(await scalar('SELECT public.song_link_is_protected_zone($1) r', [code])).toBe(tsCodes.includes(code));
  });
});

describe('0331 seguida da 0333 #647 — PostgreSQL em memória', () => {
  it('C2: BR/US 40 dias conservam IDs; BR/US 95 e PT/DE/NULL 40 anonimizam, sem alterar agregados/relatórios', async () => {
    const saved = await snapshot([...aggregates,...newAggregates]);
    const rows = await snapshot(['song_link_events']);
    const eligible = Number(await scalar(`SELECT count(*) r FROM song_link_events e WHERE ${eligibleByZone} AND (${hasIds})`));
    let total = 0;
    for (let calls = 0; calls < 100; calls++) {
      const count = Number(await scalar('SELECT public.anonymize_song_link_events(30,90,7) r'));
      expect(count).toBeLessThanOrEqual(7);
      total += count;
      if (count === 0) break;
      if (calls === 99) throw new Error('Synthetic retention failed to terminate');
    }
    expect(total).toBe(eligible);
    expect(await scalar(`SELECT count(*) r FROM song_link_events e WHERE ${eligibleByZone} AND (${hasIds})`)).toBe(0);
    const cohorts = (await db.query<{country: string | null; age: number; has_ids: boolean; all_ids: boolean; rounded: boolean}>(`
      SELECT c.country,c.age,(${hasIds}) has_ids,${identifiers.map(c => `${c} IS NOT NULL`).join(' AND ')} all_ids,
        e.created_at=date_trunc('hour',e.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' rounded
      FROM fixture_cohorts c JOIN song_link_events e ON e.id=c.id`)).rows;
    expect(cohorts).toHaveLength(10);
    for (const row of cohorts) {
      const retained = ['BR','US'].includes(row.country ?? '') && row.age === 40;
      expect(row.has_ids).toBe(retained);
      expect(row.all_ids).toBe(retained);
      expect(row.rounded).toBe(!retained);
    }
    const preserved = (data: Record<string, unknown>) => (data.song_link_events as Record<string, unknown>[])
      .map(({created_at: _at,...row}) => Object.fromEntries(Object.entries(row).filter(([key]) => !identifiers.includes(key))))
      .sort((a,b) => String(a.id).localeCompare(String(b.id)));
    expect(preserved(await snapshot(['song_link_events']))).toEqual(preserved(rows));
    expect(await snapshot([...aggregates,...newAggregates])).toEqual(saved);
    expect(await reports()).toEqual(baseline);
    expect(await scalar(`SELECT current_setting('song_link.retencao',true) IS DISTINCT FROM 'on' r`)).toBe(true);
  });
  it.each([
    ['BR',40,30,90,false], ['BR',95,30,90,true], ['PT',40,30,90,true],
    [null,40,30,90,true], ['BR',40,30,35,true], ['PT',40,45,90,false],
  ] as const)('C2: cobertura por zona (%s, %i dias, prazos %i/%i)', async (country, age, protectedDays, otherDays, shouldRaise) => {
    for (const [table,day,tz] of [
      ['song_link_ident_daily_stats','dia','Europe/Lisbon'],
      ['song_link_ident_daily_origins','metric_day','America/Sao_Paulo'],
    ]) {
      await db.exec('SAVEPOINT missing_coverage');
      const id = await scalar<string>('SELECT id r FROM fixture_cohorts WHERE country IS NOT DISTINCT FROM $1 AND age=$2', [country,age]);
      await db.query('DELETE FROM song_link_events WHERE id<>$1', [id]);
      await db.exec(`DELETE FROM ${table} WHERE ${day}=(SELECT (created_at AT TIME ZONE '${tz}')::date FROM song_link_events)`);
      const saved = await snapshot(['song_link_events',...aggregates,...newAggregates]);
      await db.exec('SAVEPOINT coverage_attempt');
      if (shouldRaise) await expect(scalar('SELECT public.anonymize_song_link_events($1,$2,20000) r', [protectedDays,otherDays])).rejects.toThrow('missing daily aggregate coverage');
      else expect(await scalar('SELECT public.anonymize_song_link_events($1,$2,20000) r', [protectedDays,otherDays])).toBe(0);
      await db.exec('ROLLBACK TO SAVEPOINT coverage_attempt');
      expect(await snapshot(['song_link_events',...aggregates,...newAggregates])).toEqual(saved);
      await db.exec('ROLLBACK TO SAVEPOINT missing_coverage');
    }
  });
  it.each([
    [29,90,1,'p_days_protected must be >= 30'], [null,90,1,'p_days_protected must be >= 30'],
    [30,29,1,'p_days_other must be >= p_days_protected'], [31,30,1,'p_days_other must be >= p_days_protected'],
    [30,null,1,'p_days_other must be >= p_days_protected'],
    [30,90,0,'p_batch must be positive'], [30,90,null,'p_batch must be positive'],
  ])('C2: recusa guardas inválidas (%s,%s,%s)', async (protectedDays, otherDays, batch, message) => {
    await expect(scalar('SELECT public.anonymize_song_link_events($1,$2,$3) r', [protectedDays,otherDays,batch])).rejects.toThrow(String(message));
  });
  it('C2: catálogo sem bloqueio, assinatura antiga removida, ACL fechada e execução de serviço com identidade própria', async () => {
    expect(await scalar(`SELECT pg_get_functiondef('public.anonymize_song_link_events(integer,integer,integer)'::regprocedure) r`)).not.toMatch(/\bLOCK\s+TABLE\b/i);
    expect(await scalar(`SELECT to_regprocedure('public.anonymize_song_link_events(integer,integer)') IS NULL r`)).toBe(true);
    expect(await scalar(`SELECT provolatile='i' r FROM pg_proc WHERE oid='public.song_link_is_protected_zone(text)'::regprocedure`)).toBe(true);
    expect(await acl()).toEqual(originalAcl);
    for (const role of ['anon','authenticated','service_role']) {
      expect(await scalar(`SELECT has_function_privilege($1,'public.anonymize_song_link_events(integer,integer,integer)','EXECUTE') r`,[role])).toBe(role==='service_role');
      if (role!=='service_role') expect(await scalar(`SELECT has_function_privilege($1,'public.song_link_is_protected_zone(text)','EXECUTE') r`,[role])).toBe(false);
    }
    await db.exec("SET SESSION AUTHORIZATION service_role; SET request.jwt.claim.role='service_role'");
    expect(await scalar('SELECT session_user r')).toBe('service_role');
    expect(await scalar('SELECT public.anonymize_song_link_events(30,90,1) r')).toBe(1);
    await db.exec("RESET SESSION AUTHORIZATION; SET SESSION AUTHORIZATION authenticated");
    expect(await scalar('SELECT session_user r')).toBe('authenticated');
    await db.exec('SAVEPOINT client_denied');
    await expect(scalar('SELECT public.anonymize_song_link_events(30,90,1) r')).rejects.toThrow('permission denied');
    await db.exec('ROLLBACK TO SAVEPOINT client_denied; RESET SESSION AUTHORIZATION');
  });
});

describe('0333 #647 — testes dos crons transferidos da 647-c', () => {
  it('C1: crons em minutos livres do inventário, fora de 06–09, com refresh anterior e limites', () => {
    const inventory = JSON.parse(read('docs/estudos/saas-e-desenvolvimento/gates-352/inventario.json')) as {proposals: {active: boolean; schedule: string}[]};
    const matches = (field: string, n: number, max: number) => field.split(',').some(part => {
      const [range, stepText] = part.split('/');
      const step = Number(stepText ?? 1);
      const [start, end] = range === '*' ? [0, max] : range.includes('-') ? range.split('-').map(Number) : [Number(range), Number(range)];
      return n >= start && n <= end && (n - start) % step === 0;
    });
    for (const minute of [17, 53]) {
      expect(cron).toContain(`'${minute} 4 * * *'`);
      expect(inventory.proposals.filter(j => j.active && matches(j.schedule.split(' ')[0], minute, 59) && matches(j.schedule.split(' ')[1], 4, 23))).toEqual([]);
    }
    expect(cron.indexOf('song_link_ident_daily_refresh')).toBeLessThan(cron.indexOf('anonymize_song_link_events'));
    expect(cron).toContain('v_rows=0 OR clock_timestamp()>=v_deadline');
    expect(cron).toContain('public.anonymize_song_link_events(30, 90, 20000)');
    expect(cron).toContain('public.purge_song_link_events(13)');
    expect(cron.split('\n').filter(l => l.includes('cron.unschedule')).every(l => l.startsWith('-- '))).toBe(true);
  });
  it('C1/C2: corpos reais dos crons compilam e terminam a manutenção, com refresh antes', async () => {
    await db.exec(`CREATE SCHEMA cron;
      CREATE TABLE cron.fixture_jobs(name text,schedule text,command text);
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO cron.fixture_jobs VALUES($1,$2,$3); RETURN 1; END $$;`);
    await db.exec(cron);
    const jobs = (await db.query<{command: string}>('SELECT command FROM cron.fixture_jobs ORDER BY schedule')).rows;
    expect(jobs).toHaveLength(2);
    const before = await snapshot([...aggregates,...newAggregates]);
    const retained = await scalar(`SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) r FROM song_link_events e
      WHERE e.country='BR' AND e.created_at>=now()-interval '90 days' AND e.created_at<now()-interval '30 days'`);
    expect(retained).not.toBeNull();
    for (const job of jobs) await db.exec(job.command);
    expect(await scalar(`SELECT count(*) r FROM song_link_events WHERE public.song_link_is_protected_zone(country)
      AND created_at<now()-interval '30 days' AND (${hasIds})`)).toBe(0);
    expect(await scalar(`SELECT count(*) r FROM song_link_events WHERE NOT public.song_link_is_protected_zone(country)
      AND created_at<now()-interval '90 days' AND (${hasIds})`)).toBe(0);
    expect(await scalar(`SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) r FROM song_link_events e
      WHERE e.country='BR' AND e.created_at>=now()-interval '90 days' AND e.created_at<now()-interval '30 days'`)).toEqual(retained);
    expect(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at<now()-interval '13 months'`)).toBe(0);
    expect(await snapshot([...aggregates,...newAggregates])).toEqual(before);
    expect(await reports()).toEqual(baseline);
  });
});
