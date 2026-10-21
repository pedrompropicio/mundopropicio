// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

// Local-only prerequisite model; no hosted writes or credentials.
const artist = 'b1a53be0-e8a8-45c0-bc32-5eea23f477ed';
const company = 'cb5b15cb-ddaa-4cf9-bd88-4c09526e6fca';
let db: PGlite;
const claim = (scheduled = false) => db.query<{result: any}>(
  'select public.artist_ads_refresh_claim($1,$2) as result', [artist, scheduled],
).then(r => r.rows[0].result);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE sandbox_exec; CREATE SCHEMA crm; CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE public.companies(id uuid PRIMARY KEY);
    CREATE TABLE public.artists(id uuid PRIMARY KEY,company_id uuid,status text);
    CREATE FUNCTION public.artist_access_check(uuid,text,text) RETURNS uuid LANGUAGE plpgsql AS $$
      BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'session required'; END IF;
      RETURN '${company}'::uuid; END $$;
    CREATE TABLE crm.ad_platform_connections(id uuid PRIMARY KEY,company_id uuid,platform text,connection_scope text,artist_id uuid,selected_ad_account_id text,status text);
    CREATE TABLE crm.ads_insights_breakdown_daily(id uuid, company_id uuid, connection_id uuid, platform text,
      external_campaign_id text, external_adset_id text, external_ad_id text, date_start date,
      breakdown_value text, impressions bigint NOT NULL, clicks bigint NOT NULL, spend_cents bigint NOT NULL,
      currency text, source text, raw jsonb, last_synced_at timestamptz,
      breakdown text CONSTRAINT ads_insights_breakdown_daily_breakdown_check CHECK(breakdown IN ('device')),
      level text CONSTRAINT ads_insights_breakdown_daily_level_check CHECK(level IN ('campaign','adset')),
      UNIQUE(connection_id,platform,level,external_campaign_id,external_adset_id,external_ad_id,date_start,breakdown,breakdown_value));
    INSERT INTO public.companies VALUES('${company}');
    INSERT INTO public.artists VALUES('${artist}','${company}','ativo');`);
  await db.exec(readFileSync('drizzle/migrations/0218_artist_ads_hourly_fase1.sql', 'utf8'));
  await db.exec(readFileSync('supabase/manual/20261021_artist_ads_refresh_write.sql', 'utf8'));
  await db.exec(`INSERT INTO crm.ad_platform_connections VALUES('${artist}','${company}','meta','artist','${artist}','123','active');`);
}, 30000);
afterAll(async () => { await db?.close(); });

describe('Traffic Fase 1 exact applied DDL, local PostgreSQL', () => {
  it('scheduled claim accepts service_role with no auth.uid', async () => {
    await db.exec("SET test.role='service_role'; SET test.uid='';");
    const r = await claim(true);
    expect(r.accepted).toBe(true);
    expect(r.company_id).toBe(company);
    expect((await db.query('select auth.uid() as uid')).rows[0]).toEqual({uid: null});
  });
  it('concurrent requests share one artist lease', async () => {
    const results = await Promise.all([claim(true), claim(true)]);
    expect(results.map(r => r.reason)).toEqual(['in_progress','in_progress']);
    expect(results.every(r => r.accepted === false)).toBe(true);
  });
  it('finish releases the matching lease and rejects stale requests', async () => {
    const row = (await db.query<{request_id:string}>('select request_id from artist_ads_refresh_control')).rows[0];
    const results = {meta:{status:'success',rows_written:0,api_calls:0}};
    const first = await db.query<{result:any}>('select artist_ads_refresh_finish($1,$2,$3) result', [artist,row.request_id,JSON.stringify(results)]);
    expect(first.rows[0].result.accepted).toBe(true);
    const stale = await db.query<{result:any}>('select artist_ads_refresh_finish($1,$2,$3) result', [artist,row.request_id,JSON.stringify(results)]);
    expect(stale.rows[0].result.reason).toBe('stale_request');
  });
  it('manual acceptance is limited to 120 seconds per artist', async () => {
    await db.exec(`SET test.role='authenticated'; SET test.uid='${artist}';`);
    expect((await claim()).accepted).toBe(true);
    await db.exec("UPDATE artist_ads_refresh_control SET lease_until=null,request_id=null;");
    const refused = await claim();
    expect(refused.accepted).toBe(false);
    expect(refused.reason).toBe('rate_limited');
    expect(refused.retry_after_seconds).toBeGreaterThanOrEqual(119);
    await db.exec("UPDATE artist_ads_refresh_control SET last_requested_at=clock_timestamp()-interval '121 seconds';");
    expect((await claim()).accepted).toBe(true);
  });
  it('manual users cannot forge the scheduled path', async () => {
    await expect(claim(true)).rejects.toThrow('sync agendado reservado ao serviço');
  });
  it('anon and sandbox have no access; authenticated only executes claim', async () => {
    const r = await db.query<{rolname:string;table_access:boolean;claim:boolean;finish:boolean}>(`SELECT rolname,
      has_table_privilege(oid,'crm.ads_insights_hourly','SELECT,INSERT,UPDATE,DELETE') table_access,
      has_function_privilege(oid,'artist_ads_refresh_claim(uuid,boolean)','EXECUTE') claim,
      has_function_privilege(oid,'artist_ads_refresh_finish(uuid,uuid,jsonb)','EXECUTE') finish
      FROM pg_roles WHERE rolname IN ('anon','authenticated','sandbox_exec') ORDER BY rolname`);
    expect(r.rows).toEqual([
      {rolname:'anon',table_access:false,claim:false,finish:false},
      {rolname:'authenticated',table_access:false,claim:true,finish:false},
      {rolname:'sandbox_exec',table_access:false,claim:false,finish:false},
    ]);
  });
  it('writer fences stale requests and preserves null rather than zero', async () => {
    await db.exec("SET test.role='service_role'; SET test.uid=''; UPDATE artist_ads_refresh_control SET lease_until=null,request_id=null;");
    const accepted = await claim(true);
    const date = (await db.query<{day:string}>("select to_char(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') day")).rows[0].day;
    const row = {level:'campaign',external_campaign_id:'456',external_adset_id:'',metric_date:date,metric_hour:0,account_timezone:'America/Sao_Paulo',currency:'BRL',impressions:null,clicks:0,spend_cents:null,raw:{}};
    const write = (request:string,rows:unknown[],device=false) => db.query<{result:any}>('select artist_ads_refresh_write($1,$2,$3,$4,$5) result',[artist,request,artist,JSON.stringify(rows),device]).then(r=>r.rows[0].result);
    expect((await write(company,[row])).reason).toBe('stale_request');
    expect((await write(accepted.request_id,[row])).rows_written).toBe(1);
    expect((await db.query('select impressions,clicks,spend_cents from crm.ads_insights_hourly')).rows).toEqual([{impressions:null,clicks:0,spend_cents:null}]);
    await expect(write(accepted.request_id,[{...row,breakdown_value:'iphone'}],true)).rejects.toThrow('device incompleto');
    expect((await write(accepted.request_id,[{...row,impressions:0,clicks:0,spend_cents:0,breakdown_value:'iphone'}],true)).rows_written).toBe(1);
    await db.exec('UPDATE artist_ads_refresh_control SET lease_until=null,request_id=null;');
    expect((await write(accepted.request_id,[row])).reason).toBe('stale_request');
  });
});