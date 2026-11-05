// @vitest-environment node
// Inerte: PostgreSQL WASM em memória, sem credenciais, ligações externas ou crons.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const original = read('supabase/manual/0331_issue647_song_link_retencao.sql');
const migrationPath = 'drizzle/migrations/0336_issue647_retencao_sem_lock.sql';
const migration = read(migrationPath);
const manualPath = 'supabase/manual/0336_issue647_retencao_sem_lock.sql';
const rollback = read('supabase/manual/rollback_0336_issue647_retencao_sem_lock_comentado.sql');
const restored = rollback.split('\n').map(line => line.startsWith('-- ') ? line.slice(3) : line).join('\n');
const functions = [
  ['song_link_ident_daily_refresh', 'date,date'],
  ['purge_song_link_events', 'integer,integer'],
] as const;
const lock = ' LOCK TABLE public.song_link_events IN SHARE ROW EXCLUSIVE MODE;\n';
const oldComment = ' -- O mesmo lock do backfill impede cruzar refresh com anonimização/captura.\n';
const newComment = ` -- O refresh só reescreve dias de p_from a p_to e > hoje-30, em cada fuso.
 -- A anonimização (0331/0333) só toca linhas com mais de 30 dias: não há cruzamento.
 -- A SLE só insere linhas de hoje; um UPDATE tardio de uma chegada de ontem
 -- (janelas <= 2 h) entra no refresh do dia seguinte: cada dia é recalculado
 -- em 3 dias seguidos (hoje-3 .. hoje-1).
`;
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
function metadata(sql: string, name: string) {
  return sql.split('\n').filter(line => new RegExp(`^(REVOKE|GRANT|COMMENT).*FUNCTION public\\.${name}\\(`).test(line));
}
function topLevel(sql: string) {
  return sql.replace(/^CREATE (?:OR REPLACE )?FUNCTION .*?AS (\$\w*\$).*?\1;/gms, '')
    .replace(/^--.*$/gm, '').trim();
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
const aggregates = ['song_link_ident_daily_stats', 'song_link_ident_daily_origins',
  'song_link_report_hourly', 'song_link_report_visitors_hourly',
  'song_link_report_visitor_refs_daily', 'song_link_report_visitor_totals_daily', 'song_link_arrivals_hourly'];
let db: PGlite;
async function scalar<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<{r: T}>(sql, params)).rows[0].r;
}
async function snapshot(tables = aggregates) {
  const result: Record<string, unknown> = {};
  for (const table of tables) result[table] = await scalar(`SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') r FROM public.${table} x`);
  return result;
}
async function compareVersions<T>(operation: () => Promise<T>) {
  // A mesma transação fixa now(); o savepoint restaura dados, definições e locks.
  await db.exec('SAVEPOINT original_0331');
  const before = await operation();
  await db.exec('ROLLBACK TO SAVEPOINT original_0331');
  await db.exec(migration);
  const after = await operation();
  expect(after).toEqual(before);
  return after;
}
const refresh = () => scalar<number>(`SELECT public.song_link_ident_daily_refresh(
  (now() AT TIME ZONE 'Europe/Lisbon')::date-3,
  (now() AT TIME ZONE 'Europe/Lisbon')::date-1) r`);
const sleLocks = () => db.query<{mode: string; granted: boolean}>(`SELECT mode,granted FROM pg_locks
  WHERE locktype='relation' AND relation='public.song_link_events'::regclass AND pid=pg_backend_pid() ORDER BY mode`);
async function catalog() {
  return (await db.query(`SELECT p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,
    p.prosecdef,p.proconfig,p.proacl::text,obj_description(p.oid,'pg_proc') comment
    FROM pg_proc p WHERE p.oid IN ('public.song_link_ident_daily_refresh(date,date)'::regprocedure,
      'public.purge_song_link_events(integer,integer)'::regprocedure) ORDER BY 1`)).rows;
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
  await db.exec(`CREATE TEMP TABLE fixture_times AS
    SELECT (date_trunc('day',now() AT TIME ZONE 'UTC')-make_interval(days=>d)+h) AT TIME ZONE 'UTC' ts
      FROM (VALUES(1),(2),(3),(4),(29),(30),(31),(40)) days(d)
      CROSS JOIN (VALUES(interval '2 hours 47 minutes'),(interval '3 hours 17 minutes'),
        (interval '22 hours 17 minutes'),(interval '23 hours 47 minutes')) hours(h)
    UNION ALL SELECT now()-interval '14 months'
    UNION ALL SELECT now()-interval '13 months 1 minute'
    UNION ALL SELECT now()-interval '13 months'
    UNION ALL SELECT now()-interval '13 months'+interval '1 minute';
    INSERT INTO public.song_link_events(link_id,company_id,artist_id,song_id,event,opened,destination,
      event_id,arrival_event_id,utm_source,utm_medium,utm_campaign,utm_content,fbclid,ttclid,
      ip_hash,capi_fbp,capi_fbc,capi_external_id,os,country,created_at)
    SELECT l.id,'${company}','${artist}','${song}',e.event,e.opened,'spotify',gen_random_uuid()::text,
      CASE WHEN e.event<>'arrival' THEN gen_random_uuid()::text END,
      e.source,e.medium,'campaign',e.content,e.fb,e.tt,'same-person','fbp','fbc','external','ios','BR',t.ts
    FROM fixture_times t CROSS JOIN (VALUES('${link}'::uuid),('${link2}'::uuid)) l(id)
    CROSS JOIN (VALUES
      ('arrival','app','meta','paid',NULL::text,NULL::text,NULL::text),
      ('choice','web','unknown','organic',NULL,'fb-click',NULL),
      ('app_open','app','unknown','organic',NULL,NULL,'tt-click'),
      ('choice','app','meta','paid','teste_excluded',NULL,NULL),
      ('choice','web','tiktok','paid','different_content',NULL,NULL)
    ) e(event,opened,source,medium,content,fb,tt);
    INSERT INTO public.song_link_events(link_id,company_id,artist_id,song_id,event,event_id,ip_hash,utm_medium,fbclid,os,country,created_at)
    SELECT '${otherLink}','${otherCompany}','${otherArtist}','${otherSong}','choice',gen_random_uuid()::text,
      'other-person','paid','other-fb','ios','PT',ts FROM fixture_times;`);
  // Instala a 0331 integral, incluindo os triggers reais e o backfill, só em memória.
  await db.exec(original);
}, 30000);
beforeEach(async () => { await db.exec('BEGIN'); });
afterEach(async () => { await db.exec('ROLLBACK'); });
afterAll(async () => { await db?.close(); });

describe('0336 #647 E2b — âmbito e fidelidade à 0331', () => {
  it('C1: cópia byte a byte e só duas substituições, sem transação ou SQL adicional', () => {
    expect(readFileSync(migrationPath).equals(readFileSync(manualPath))).toBe(true);
    expect(migration).toContain('Classe R2 — PREPARADA, NÃO APLICADA');
    expect(migration).toContain('Autorização 6642205078');
    expect(migration).toContain('depois da 0331 (e da 0333, se já aplicada), antes de instalar os crons');
    expect([...migration.matchAll(/^CREATE OR REPLACE FUNCTION public\.(\w+)\(/gm)].map(m => m[1]))
      .toEqual(functions.map(([name]) => name));
    expect(topLevel(migration).split('\n').filter(line => line.trim()))
      .toEqual(functions.flatMap(([name]) => metadata(original, name)));
  });
  it.each(functions)('C1: %s igual à 0331 excepto a linha do LOCK e a justificação', name => {
    const oldDefinition = definition(original, name);
    expect(oldDefinition.split(lock)).toHaveLength(2);
    let expected = oldDefinition.replace(lock, '');
    if (name === 'song_link_ident_daily_refresh') {
      expect(expected).toContain(oldComment);
      expected = expected.replace(oldComment, newComment);
    }
    expect(definition(migration, name)).toBe(expected);
    expect(metadata(migration, name)).toHaveLength(3);
    expect(metadata(migration, name)).toEqual(metadata(original, name));
  });
  it('C1: rollback todo comentado repõe integralmente as duas definições, ACLs e comentários', () => {
    expect(rollback.split('\n').filter(Boolean).every(line => line.startsWith('-- '))).toBe(true);
    for (const [name] of functions) {
      expect(definition(restored, name)).toBe(definition(original, name));
      expect(metadata(restored, name)).toEqual(metadata(original, name));
    }
    expect([...restored.matchAll(/^CREATE OR REPLACE FUNCTION public\.(\w+)\(/gm)].map(m => m[1]))
      .toEqual(functions.map(([name]) => name));
    // As três linhas de cabeçalho também são comentários após descomentar o pacote.
    expect(topLevel(restored.split('\n').slice(4).join('\n')).split('\n').filter(line => line.trim()))
      .toEqual(functions.flatMap(([name]) => metadata(original, name)));
  });
});

describe('0336 #647 E2b — PostgreSQL local, 0331 seguida da 0336', () => {
  it('C2: refresh dá contagens e snapshots iguais, com dois fusos, links e empresas', async () => {
    // Obriga o refresh a reconstruir resultados diferentes dos do backfill inicial.
    await db.exec(`INSERT INTO public.song_link_events(link_id,company_id,artist_id,song_id,event,
      opened,destination,arrival_event_id,ip_hash,utm_source,utm_medium,os,created_at)
      VALUES('${link}','${company}','${artist}','${song}','app_open','app','spotify',
        gen_random_uuid()::text,'late-person','meta','paid','android',now()-interval '2 days');`);
    const before = await snapshot();
    const result = await compareVersions(async () => ({rows: await refresh(), aggregates: await snapshot()}));
    expect(result.rows).toBeGreaterThan(0);
    expect(result.aggregates.song_link_ident_daily_stats).not.toEqual(before.song_link_ident_daily_stats);
    expect(result.aggregates.song_link_ident_daily_origins).not.toEqual(before.song_link_ident_daily_origins);
    for (const table of aggregates.slice(2)) expect(result.aggregates[table]).toEqual(before[table]);
    expect(await scalar(`SELECT count(*)>0 r FROM song_link_ident_daily_stats WHERE company_id=$1`, [otherCompany])).toBe(true);
    expect(await scalar(`SELECT count(*)>0 r FROM fixture_times WHERE
      (ts AT TIME ZONE 'Europe/Lisbon')::date<>(ts AT TIME ZONE 'America/Sao_Paulo')::date`)).toBe(true);
  });
  it('C2: refresh amplo preserva exactamente os dias congelados e os limites de p_from/p_to', async () => {
    await compareVersions(async () => {
      const frozen = async () => ({
        stats: await scalar(`SELECT jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text) r FROM song_link_ident_daily_stats x
          WHERE dia <= (now() AT TIME ZONE 'Europe/Lisbon')::date-30`),
        origins: await scalar(`SELECT jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text) r FROM song_link_ident_daily_origins x
          WHERE metric_day <= (now() AT TIME ZONE 'America/Sao_Paulo')::date-30`),
      });
      const before = await frozen();
      expect(before.stats).not.toBeNull();
      expect(before.origins).not.toBeNull();
      const rows = await scalar(`SELECT song_link_ident_daily_refresh('2020-01-01','2099-01-01') r`);
      expect(await frozen()).toEqual(before);
      return {rows, aggregates: await snapshot()};
    });
  });
  it('C2: purga em lotes dá as mesmas contagens, linhas sobreviventes e sete agregados', async () => {
    // Fronteira calculada nesta transação, sem depender do relógio do beforeAll.
    await db.exec(`INSERT INTO public.song_link_events(link_id,company_id,artist_id,song_id,event,created_at)
      SELECT '${link}','${company}','${artist}','${song}','arrival',now()-interval '13 months'+offset_age
      FROM (VALUES(-interval '1 minute'),(interval '0'),(interval '1 minute')) age(offset_age);`);
    const before = await snapshot();
    const eligible = Number(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at<now()-interval '13 months'`));
    expect(eligible).toBeGreaterThan(3);
    const result = await compareVersions(async () => {
      const batches: number[] = [];
      for (let calls = 0; calls < 100; calls++) {
        const n = Number(await scalar('SELECT public.purge_song_link_events(13,3) r'));
        expect(n).toBeLessThanOrEqual(3);
        batches.push(n);
        if (n === 0) return {batches, aggregates: await snapshot(), events: await snapshot(['song_link_events'])};
      }
      throw new Error('Synthetic purge failed to terminate');
    });
    expect(result.batches.reduce((a, b) => a + b, 0)).toBe(eligible);
    expect(result.batches[result.batches.length - 1]).toBe(0);
    expect(result.aggregates).toEqual(before);
    expect(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at<now()-interval '13 months'`)).toBe(0);
    expect(Number(await scalar(`SELECT count(*) r FROM song_link_events WHERE created_at=now()-interval '13 months'`))).toBeGreaterThan(0);
  });
  it.each(functions)('C2: pg_get_functiondef de %s não contém LOCK TABLE após 0336', async (name, signature) => {
    await db.exec(migration);
    const actual = await scalar<string>('SELECT pg_get_functiondef($1::regprocedure) r', [`public.${name}(${signature})`]);
    expect(actual).not.toMatch(/\bLOCK\s+TABLE\b/i);
  });
  it.each(['refresh', 'purge', 'refresh+purge'])('C2: pg_locks prova a remoção de ShareRowExclusiveLock em %s', async operation => {
    // PGlite usa uma única ligação/backend: prova pelo catálogo, sem simular concorrência.
    const run = async () => {
      if (operation.includes('refresh')) await refresh();
      if (operation.includes('purge')) expect(Number(await scalar('SELECT purge_song_link_events(13,1) r'))).toBe(1);
    };
    expect((await sleLocks()).rows).toEqual([]);
    await db.exec('SAVEPOINT before_cron');
    await run();
    expect((await sleLocks()).rows).toContainEqual({mode: 'ShareRowExclusiveLock', granted: true});
    await db.exec('ROLLBACK TO SAVEPOINT before_cron');
    await db.exec(migration);
    await run();
    const modes = (await sleLocks()).rows;
    expect(modes).not.toContainEqual({mode: 'ShareRowExclusiveLock', granted: true});
    expect(modes).toContainEqual({mode: operation.includes('purge') ? 'RowExclusiveLock' : 'AccessShareLock', granted: true});
    expect(modes.some(row => ['ShareLock', 'ShareRowExclusiveLock', 'ExclusiveLock', 'AccessExclusiveLock'].includes(row.mode))).toBe(false);
    // Ainda dentro da mesma transação, após refresh/purga, o INSERT real alimenta os triggers.
    const inserted = await scalar<string>(`INSERT INTO public.song_link_events(link_id,company_id,artist_id,song_id,
      event,event_id,ip_hash,os,created_at) VALUES('${link}','${company}','${artist}','${song}',
      'arrival','insert-after-maintenance','new-person','android',now()) RETURNING id::text r`);
    expect(await scalar('SELECT count(*) r FROM song_link_events WHERE id=$1', [inserted])).toBe(1);
  });
  it('C2: ACL, SECDEF, configuração e comentários mantidos; anonimização permanece intacta', async () => {
    const before = await catalog();
    const anonymize = await scalar(`SELECT pg_get_functiondef('public.anonymize_song_link_events(integer,integer)'::regprocedure) r`);
    await db.exec(migration);
    expect((await catalog()).map(({definition: _definition, ...row}) => row))
      .toEqual(before.map(({definition: _definition, ...row}) => row));
    expect(await scalar(`SELECT pg_get_functiondef('public.anonymize_song_link_events(integer,integer)'::regprocedure) r`)).toBe(anonymize);
    for (const [name, signature] of functions) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        expect(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\') r', [role, `public.${name}(${signature})`])).toBe(role === 'service_role');
      }
    }
  });
  it('C1/C2: rollback descomentado em memória restaura as funções e o lock original', async () => {
    const before = await catalog();
    await db.exec(migration);
    // Só as definições e metadados comentados: o cabeçalho não é SQL.
    await db.exec(restored.split('\n').slice(4).join('\n'));
    expect(await catalog()).toEqual(before);
    await refresh();
    expect((await sleLocks()).rows).toContainEqual({mode: 'ShareRowExclusiveLock', granted: true});
  });
});
