// @vitest-environment node
// Inerte: PostgreSQL WASM em memória; nenhum cliente, credencial ou base externa.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const migration = read('drizzle/migrations/0331_issue647_song_link_retencao.sql');
const manual = read('supabase/manual/0331_issue647_song_link_retencao.sql');
const rollback = read('supabase/manual/rollback_0331_issue647_song_link_retencao_comentado.sql');
const proof = read('docs/testes/issue647/prova-janela-0331.sql');
const cron = read('supabase/manual/cron_song_link_events_retencao_live.sql');
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
async function exhaust(fn: string, batch: number) {
  let total = 0;
  for (let calls = 0; calls < 100; calls++) {
    const n = Number(await scalar(`SELECT public.${fn}($1,$2) r`, [fn === 'anonymize_song_link_events' ? 30 : 13, batch]));
    expect(n).toBeLessThanOrEqual(batch);
    total += n;
    if (n === 0) return total;
  }
  throw new Error('Synthetic retention failed to terminate');
}

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
  windows = await scalar(`SELECT jsonb_build_object(
    'old',jsonb_build_object('from',(now()-interval '42 days')::date,'to',(now()-interval '37 days')::date),
    'recent',jsonb_build_object('from',(now()-interval '4 days')::date,'to',now()::date),
    'boundary',jsonb_build_object('from',(now()-interval '32 days')::date,'to',(now()-interval '28 days')::date),
    'purged',jsonb_build_object('from',(now()-interval '14 months 2 days')::date,'to',(now()-interval '14 months'+interval '2 days')::date)) r`);
  baseline = await reports();
  originalAcl = await acl();
  await db.exec(migration);
}, 30000);
beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('ROLLBACK'); });
afterAll(async () => { await db?.close(); });

describe('0331 #647 — ficheiros inertes e corpos canónicos', () => {
  it('C1: manual idêntico, rollback integralmente comentado e prova SELECT-only', async () => {
    expect(manual).toBe(migration);
    expect(rollback.split('\n').filter(Boolean).every(line => line.startsWith('-- '))).toBe(true);
    const statements = proof.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
    expect(statements.length).toBeGreaterThanOrEqual(6);
    for (const statement of statements) expect(statement).toMatch(/^SELECT\s/i);
    expect(proof).not.toMatch(/\b(?:SELECT|PERFORM)\s+public\.(?:anonymize|purge|song_link_ident_daily_refresh|song_link_report_hourly_validate)\s*\(/i);
    // Parse/execute every proof SELECT in the inert fixture, never in Live.
    await db.exec(proof);
  });
  it('C1/C2: triggers mantêm todo o corpo anterior após remover a única saída antecipada', () => {
    for (const [name, file] of [['song_link_report_hourly_track', source.report], ['song_link_arrivals_hourly_track', source.arrivals]]) {
      const restored = definition(migration, name).replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION')
        .replace("IF current_setting('song_link.retencao', true) = 'on' THEN RETURN NULL; END IF;\n", '');
      expect(restored).toBe(definition(file, name));
    }
    const uncommented = rollback.split('\n').map(l => l.slice(3)).join('\n');
    for (const [name, file] of [['artist_song_link_stats', source.stats], ['artist_song_play_origins_compare', source.origins],
      ['song_link_report_hourly_track', source.report], ['song_link_arrivals_hourly_track', source.arrivals],
      ['song_link_report_hourly_rebuild', source.report], ['song_link_report_hourly_validate', source.report]]) {
      expect(definition(uncommented, name).replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION'))
        .toBe(definition(file, name).replace('CREATE OR REPLACE FUNCTION', 'CREATE FUNCTION'));
    }
    const topLevel = migration.replace(/^CREATE (?:OR REPLACE )?FUNCTION .*?AS (\$\w*\$).*?\1;/gms, '');
    expect(topLevel).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE)\s+public\.song_link_report_/i);
  });
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
    expect(cron).toContain('public.anonymize_song_link_events(30)');
    expect(cron).toContain('public.purge_song_link_events(13)');
    expect(cron.split('\n').filter(l => l.includes('cron.unschedule')).every(l => l.startsWith('-- '))).toBe(true);
  });
});

describe('0331 #647 — PostgreSQL real em PGlite', () => {
  it('C1/C2: corpos reais dos crons compilam e terminam a manutenção, com refresh antes', async () => {
    await db.exec(`CREATE SCHEMA cron;
      CREATE TABLE cron.fixture_jobs(name text,schedule text,command text);
      CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO cron.fixture_jobs VALUES($1,$2,$3); RETURN 1; END $$;`);
    await db.exec(cron);
    const jobs = (await db.query<{command: string}>('SELECT command FROM cron.fixture_jobs ORDER BY schedule')).rows;
    expect(jobs).toHaveLength(2);
    const before = await snapshot();
    for (const job of jobs) await db.exec(job.command);
    expect(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at<now()-interval '30 days' AND (${hasIds})`)).toBe(0);
    expect(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at<now()-interval '13 months'`)).toBe(0);
    expect(await snapshot()).toEqual(before);
    expect(await reports()).toEqual(baseline);
  });
  it('C2: backfills coincidem em cada grupo com 0299/0257 directas, com dois links e meias-noites', async () => {
    expect(await reports()).toEqual(baseline);
    expect(await acl()).toEqual(originalAcl);
    const stats = await db.query<{aberturas_spotify: number; direct: number}>(`SELECT a.dia::text,a.link_id,a.utm_campaign,a.utm_content,a.canal,a.aberturas_spotify,
      count(DISTINCT e.arrival_event_id) FILTER(WHERE e.event='app_open' AND coalesce(e.destination,'(sem)')='spotify') direct
      FROM public.song_link_ident_daily_stats a JOIN public.song_link_events e
        ON a.company_id=e.company_id AND a.artist_id=e.artist_id AND a.link_id=e.link_id
        AND a.dia=(e.created_at AT TIME ZONE 'Europe/Lisbon')::date
        AND a.utm_campaign=coalesce(e.utm_campaign,'') AND a.utm_content=coalesce(e.utm_content,'')
      JOIN public.song_links l ON l.id=e.link_id
      WHERE a.canal=public.song_link_event_canal(l.canal,e.utm_source,e.utm_medium,e.utm_campaign)
      GROUP BY 1,2,3,4,5,6`);
    expect(stats.rows.length).toBeGreaterThan(10);
    for (const row of stats.rows) expect(row.aberturas_spotify).toBe(row.direct);
    const origins = await db.query(`WITH direct AS (
      SELECT e.company_id,e.artist_id,e.song_id,(e.created_at AT TIME ZONE 'America/Sao_Paulo')::date metric_day,
        count(*) FILTER(WHERE e.event='app_open') aberturas_android,
        count(*) FILTER(WHERE e.event='choice' AND e.os='ios') toques_ios,
        count(*) FILTER(WHERE e.fbclid IS NOT NULL OR lower(e.utm_source) IN ('meta','facebook','fb','instagram','ig')) aberturas_meta,
        count(*) FILTER(WHERE e.ttclid IS NOT NULL OR lower(e.utm_source) IN ('tiktok','tt')) aberturas_tiktok,
        count(DISTINCT e.ip_hash) pessoas_trafego
      FROM public.song_link_events e
      WHERE (e.utm_medium='paid' OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL)
        AND (e.utm_content IS NULL OR e.utm_content NOT LIKE 'teste_%') AND e.event IN ('app_open','choice')
      GROUP BY 1,2,3,4)
      SELECT * FROM direct EXCEPT SELECT * FROM public.song_link_ident_daily_origins`);
    expect(origins.rows).toEqual([]);
    expect(Number(await scalar(`SELECT max(pessoas_trafego) r FROM public.song_link_ident_daily_origins WHERE artist_id='${artist}'`))).toBe(1);
    const midnight = await db.query<{lisbon: string; brazil: string}>(`SELECT (ts AT TIME ZONE 'Europe/Lisbon')::date::text lisbon,(ts AT TIME ZONE 'America/Sao_Paulo')::date::text brazil FROM fixture_times WHERE extract(hour from ts AT TIME ZONE 'UTC') IN(22,23,2,3)`);
    expect(midnight.rows.some(r => r.lisbon !== r.brazil)).toBe(true);
    // Lisbon 23:47 and São Paulo 02:47 lie on different function-days: never sum Lisbon uniques for Brazil.
    expect(await scalar(`SELECT count(DISTINCT metric_day)>1 r FROM public.song_link_ident_daily_origins WHERE artist_id='${artist}'`)).toBe(true);
  });
  it('C2: anonimização mantém resultados antigos/recentes e todas as linhas dos cinco agregados', async () => {
    const before = await snapshot();
    const saved = await snapshot(newAggregates);
    const eligible = Number(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at<now()-interval '30 days' AND (${hasIds})`));
    expect(eligible).toBeGreaterThan(0);
    expect(await exhaust('anonymize_song_link_events', 7)).toBe(eligible);
    expect(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at<now()-interval '30 days' AND (${hasIds})`)).toBe(0);
    expect(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at<now()-interval '30 days' AND created_at<>date_trunc('hour',created_at)`)).toBe(0);
    expect(Number(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at>=now()-interval '30 days' AND (${hasIds})`))).toBeGreaterThan(0);
    expect(await reports()).toEqual(baseline);
    expect(await snapshot()).toEqual(before);
    expect(await snapshot(newAggregates)).toEqual(saved);
    expect(await scalar(`SELECT count(*) r FROM song_link_report_hourly_log WHERE kind='pending'`)).toBe(0);
    expect(await scalar(`SELECT count(*) r FROM song_link_arrivals_hourly_log WHERE kind='pending'`)).toBe(0);
  });
  it('C2/C3: purga só >13 meses, em lotes, preserva agregados e relatórios mesmo após remover linhas', async () => {
    const before = await snapshot();
    const saved = await snapshot(newAggregates);
    await exhaust('anonymize_song_link_events', 19);
    const eligible = Number(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at<now()-interval '13 months'`));
    expect(eligible).toBeGreaterThan(0);
    expect(await exhaust('purge_song_link_events', 3)).toBe(eligible);
    expect(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at<now()-interval '13 months'`)).toBe(0);
    expect(await reports()).toEqual(baseline);
    expect(await snapshot()).toEqual(before);
    expect(await snapshot(newAggregates)).toEqual(saved);
  });
  it('C2: sem marca INSERT/UPDATE/DELETE continuam a alimentar os cinco agregados', async () => {
    await scalar('SELECT anonymize_song_link_events(30,1) r');
    const before = await snapshot();
    const id = await scalar<string>(`INSERT INTO public.song_link_events(link_id,company_id,artist_id,event,ip_hash,os,created_at)
      VALUES('${link}','${company}','${artist}','arrival','new-visitor','android',now()) RETURNING id r`);
    const inserted = await snapshot();
    for (const table of aggregates) expect(inserted[table]).not.toEqual(before[table]);
    await db.query('UPDATE public.song_link_events SET ip_hash=$1,os=$2 WHERE id=$3', ['changed-visitor','ios',id]);
    const updated = await snapshot();
    expect(updated.song_link_report_visitors_hourly).not.toEqual(inserted.song_link_report_visitors_hourly);
    expect(updated.song_link_arrivals_hourly).not.toEqual(inserted.song_link_arrivals_hourly);
    await db.query('DELETE FROM public.song_link_events WHERE id=$1', [id]);
    expect(await scalar(`SELECT count(*) r FROM song_link_report_hourly_log WHERE kind='pending'`)).toBe(0);
    for (const [table, col] of aggregates.map(t => [t, t.endsWith('totals_daily') ? 'v' : 'n'])) {
      // Zero membership rows are retained by the canonical triggers, compare positive totals.
      expect(Number(await scalar(`SELECT coalesce(sum(${col}),0) r FROM ${table}`))).toBe(
        (before[table] as Record<string, number>[]).reduce((n,r) => n+Number(r[col]), 0));
    }
  });
  it('C2: refresh recalcula os recentes sem reescrever os dois históricos congelados', async () => {
    const saved = await snapshot(newAggregates);
    await exhaust('anonymize_song_link_events', 37);
    await scalar(`SELECT song_link_ident_daily_refresh('2020-01-01','2099-01-01') r`);
    expect(await snapshot(newAggregates)).toEqual(saved);
    await db.exec(`INSERT INTO song_link_events(link_id,company_id,artist_id,song_id,event,utm_medium,ip_hash,os,created_at)
      VALUES('${link}','${company}','${artist}','${song}','choice','paid','fresh-person','ios',now()-interval '2 days');`);
    await scalar(`SELECT song_link_ident_daily_refresh((now() AT TIME ZONE 'Europe/Lisbon')::date-3,(now() AT TIME ZONE 'Europe/Lisbon')::date-1) r`);
    expect(await snapshot(newAggregates)).not.toEqual(saved);
    expect(Number(await scalar(`SELECT sum(pessoas_trafego) r FROM song_link_ident_daily_origins WHERE metric_day=((now()-interval '2 days') AT TIME ZONE 'America/Sao_Paulo')::date AND artist_id='${artist}'`))).toBe(2);
  });
  it('C2: falta de qualquer agregado no dia mais recente elegível recusa anonimização', async () => {
    for (const [table, day, tz] of [['song_link_ident_daily_stats','dia','Europe/Lisbon'],['song_link_ident_daily_origins','metric_day','America/Sao_Paulo']]) {
      await db.exec('SAVEPOINT missing_day');
      const rows = await snapshot(['song_link_events']);
      await db.exec(`DELETE FROM ${table} WHERE ${day}=(SELECT max((created_at AT TIME ZONE '${tz}')::date) FROM song_link_events WHERE created_at<now()-interval '30 days')`);
      await expect(scalar('SELECT anonymize_song_link_events(30) r')).rejects.toThrow('missing daily aggregate coverage');
      await db.exec('ROLLBACK TO SAVEPOINT missing_day');
      expect(await snapshot(['song_link_events'])).toEqual(rows);
    }
  });
  it('C2: rebuild recusa horas antigas', async () => {
    await exhaust('anonymize_song_link_events', 500);
    await exhaust('purge_song_link_events', 500);
    await expect(db.query(`SELECT song_link_report_hourly_rebuild($1,date_trunc('hour',now()-interval '40 days'),date_trunc('hour',now()-interval '40 days')+interval '1 hour')`, [artist])).rejects.toThrow('cannot rebuild hours older than 30 days');
  });
  it('C2: validate/rebuild recentes continuam exactos depois da retenção', async () => {
    await exhaust('anonymize_song_link_events', 500);
    await exhaust('purge_song_link_events', 500);
    const before = await snapshot();
    const validation = await scalar<{divergent_rows: number; ready: boolean}>('SELECT song_link_report_hourly_validate($1) r', [artist]);
    expect(validation).toMatchObject({divergent_rows:0,ready:true});
    expect(await scalar(`SELECT song_link_report_hourly_rebuild($1,date_trunc('hour',now()-interval '2 days'),date_trunc('hour',now()-interval '2 days')+interval '1 hour')->>'divergent_rows' r`, [artist])).toBe('0');
    const countsAndDimensions = (s: Record<string, unknown>) => Object.fromEntries(Object.entries(s).map(([t, rows]) =>
      [t,(rows as Record<string, unknown>[]).map(({updated_at: _updatedAt,...r}) => r)]));
    expect(countsAndDimensions(await snapshot())).toEqual(countsAndDimensions(before));
  });
  it.each([['anonymize_song_link_events',29],['purge_song_link_events',12]])('C3: %s recusa duração abaixo do mínimo', async (fn, days) => {
    await expect(scalar(`SELECT ${fn}($1) r`, [days])).rejects.toThrow('must be >=');
  });
  it.each(['anonymize_song_link_events','purge_song_link_events'])('C3: %s recusa lote zero e NULL', async fn => {
    for (const batch of [0,null]) {
      await db.exec('SAVEPOINT invalid_batch');
      await expect(scalar(`SELECT ${fn}($1,$2) r`, [fn.startsWith('anonymize') ? 30 : 13,batch])).rejects.toThrow('p_batch must be positive');
      await db.exec('ROLLBACK TO SAVEPOINT invalid_batch');
    }
  });
  it('C2: ACL/RLS fechadas, SECDEF, serviço autorizado e acesso canónico dos relatórios mantido', async () => {
    expect(await acl()).toEqual(originalAcl);
    for (const table of newAggregates) {
      expect(await scalar(`SELECT relrowsecurity r FROM pg_class WHERE oid='public.${table}'::regclass`)).toBe(true);
      for (const role of ['anon','authenticated']) expect(await scalar(`SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') r`,[role,table])).toBe(false);
    }
    for (const fn of ['song_link_ident_daily_refresh(date,date)','anonymize_song_link_events(integer,integer)','purge_song_link_events(integer,integer)',
      'song_link_report_hourly_track()','song_link_arrivals_hourly_track()','song_link_report_hourly_rebuild(uuid,timestamptz,timestamptz)','song_link_report_hourly_validate(uuid)']) {
      for (const role of ['anon','authenticated','service_role']) expect(await scalar(`SELECT has_function_privilege($1,$2,'EXECUTE') r`,[role,fn])).toBe(role==='service_role');
      expect(await scalar(`SELECT prosecdef AND obj_description(oid,'pg_proc') IS NOT NULL r FROM pg_proc WHERE oid=$1::regprocedure`,[fn])).toBe(true);
    }
    await db.exec("SET test.deny='on'");
    await expect(scalar('SELECT artist_song_link_stats($1,$2,$3) r',[artist,windows.old.from,windows.old.to])).rejects.toThrow('access denied');
  });
  it('C2: serviço executa com identidade de sessão própria; cliente sem EXECUTE é recusado', async () => {
    await db.exec("SET SESSION AUTHORIZATION service_role; SET request.jwt.claim.role='service_role'");
    expect(await scalar('SELECT anonymize_song_link_events(30,1) r')).toBe(1);
    await db.exec("RESET SESSION AUTHORIZATION; SET SESSION AUTHORIZATION authenticated");
    await db.exec('SAVEPOINT no_execute');
    await expect(scalar('SELECT anonymize_song_link_events(30,1) r')).rejects.toThrow('permission denied');
    await db.exec('ROLLBACK TO SAVEPOINT no_execute');
    await db.exec('RESET SESSION AUTHORIZATION');
  });
  it('C2: fronteira 6636691739 inclui hoje−30 em ambos os fusos e a hora não muda o dia', async () => {
    const result = await db.query(`SELECT tz,(event_at AT TIME ZONE tz)::date::text AS day,
      event_at<n-make_interval(days=>30) eligible,
      (event_at AT TIME ZONE tz)::date=(n AT TIME ZONE tz)::date-30 boundary,
      (date_trunc('hour',event_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AT TIME ZONE tz)::date=(event_at AT TIME ZONE tz)::date same_day
      FROM (VALUES(timestamptz '2026-11-04 12:00 UTC',timestamptz '2026-10-05 10:17 UTC')) x(n,event_at)
      CROSS JOIN (VALUES('Europe/Lisbon'),('America/Sao_Paulo')) z(tz)`);
    expect(result.rows).toEqual([{tz:'Europe/Lisbon',day:'2026-10-05',eligible:true,boundary:true,same_day:true},
      {tz:'America/Sao_Paulo',day:'2026-10-05',eligible:true,boundary:true,same_day:true}]);
    // Exhaust every UTC hour around the cutoff across all seasons, including Lisbon DST,
    // for both the fixed review clock and the actual maintenance clock.
    expect(await scalar(`SELECT count(*) r FROM (VALUES(timestamptz '2026-11-04 12:00 UTC'),(now())) n(t)
      CROSS JOIN LATERAL generate_series(n.t-interval '400 days',n.t-interval '30 days',interval '1 hour') e(t)
      CROSS JOIN (VALUES('Europe/Lisbon'),('America/Sao_Paulo')) z(tz)
      WHERE e.t<n.t-make_interval(days=>30) AND (
        (e.t AT TIME ZONE tz)::date>(n.t AT TIME ZONE tz)::date-30 OR
        (date_trunc('hour',e.t AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AT TIME ZONE tz)::date<>(e.t AT TIME ZONE tz)::date)`)).toBe(0);
  });
});
