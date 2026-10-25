// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
let db: PGlite;
const artist='10000000-0000-4000-8000-000000000001', company='10000000-0000-4000-8000-000000000002', song='10000000-0000-4000-8000-000000000003';
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE FUNCTION public.artist_access_check(uuid,text,text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN IF current_setting('test.denied',true)='yes' THEN RAISE insufficient_privilege; END IF; RETURN '${company}'::uuid; END $$;
 CREATE TABLE artist_songs(id uuid,title text,release_date date,artist_id uuid,company_id uuid,tracking_status text);
 CREATE TABLE artist_song_metrics_daily(id uuid,song_id uuid,artist_id uuid,company_id uuid,platform text,metric text,metric_date date,value numeric,source text,captured_at timestamptz);
 CREATE TABLE artist_song_playlist_streams(song_id uuid,artist_id uuid,company_id uuid,snapshot_date date,period_days int,source text,streams int,made_by text,playlist_uri text,playlist_name text);
 CREATE TABLE artist_song_tiktok_sound_daily(song_id uuid,company_id uuid,metric_date date,music_id text,video_count bigint,source text);
 CREATE FUNCTION public.artist_ads_compare(p_artist_id uuid,p_from date,p_to date,p_country text,p_tz text) RETURNS jsonb LANGUAGE plpgsql AS $$
 DECLARE r jsonb; BEGIN
 WITH sho AS (SELECT '2026-10-19'::timestamp ts,'meta'::text platform,'BRL'::text cur,60::numeric g,30::bigint n UNION ALL SELECT '2026-10-19'::timestamp,'tiktok','BRL',20,10 UNION ALL SELECT '2026-10-19'::timestamp,'meta','EUR',5,0),lac AS (SELECT 'existing'::text note)
 SELECT jsonb_build_object('old','preserved','lacunas', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM lac)) INTO r;
  RETURN r;
 END $$;
 INSERT INTO artist_songs VALUES('${song}','Synthetic song','2026-09-02','${artist}','${company}','ativo');
 INSERT INTO artist_song_metrics_daily VALUES('${song}','${song}','${artist}','${company}','spotify','s4a_streams_day','2026-10-19',100,'s4a_api',now());
 INSERT INTO artist_song_playlist_streams VALUES('${song}','${artist}','${company}','2026-10-19',1,'s4a_api',20,'spotify','spotify:playlist:radio','Radio'),('${song}','${artist}','${company}','2026-10-19',1,'s4a_api',10,'spotify','editorial','Editorial'),('${song}','${artist}','${company}','2026-10-19',1,'s4a_api',5,'user','user','Listener');
 INSERT INTO artist_song_tiktok_sound_daily VALUES('${song}','${company}','2026-10-18','synthetic-sound',100,'apify'),('${song}','${company}','2026-10-19','synthetic-sound',99,'apify');`);
 await db.exec(readFileSync('drizzle/migrations/0241_s4a_daily_compare.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
const compare=async()=> (await db.query<{r:any}>(`SELECT artist_ads_compare($1,'2026-10-18','2026-10-19','BR','America/Sao_Paulo') r`,[artist])).rows[0].r;
describe('Applied daily comparison SQL, synthetic PostgreSQL',()=>{
 it('retains old keys and calculates costs within each platform/currency',async()=>{
  const r=await compare();expect(r.old).toBe('preserved');expect(r.lacunas).toEqual([{note:'existing'}]);
  expect(r.trafego_diario.map((x:any)=>[x.platform,x.currency,x.gasto,x.chegadas,x.custo_por_chegada])).toEqual([['meta','BRL',60,30,2],['meta','EUR',5,0,null],['tiktok','BRL',20,10,2]]);
 });
 it('joins exact daily playlist data and preserves missing day nulls',async()=>{
  const {days}= (await compare()).musica_daily;
  expect(days[0]).toMatchObject({day:'2026-10-18',radio:null,rest:null,playlist_coverage:'unavailable'});
  expect(days[1]).toMatchObject({spotify_total:100,radio:20,radio_pct:20,other_spotify:10,listener_playlists:5,rest:65,ugc_total:99,ugc_new:-1,ugc_drop:true,same_sounds:true,same_sources:true});
 });
 it('closes anonymous execution and retains authorized read access',async()=>{
  expect((await db.query(`SELECT has_function_privilege('anon','artist_song_play_origins_compare(uuid,date,date)','EXECUTE') anon,has_function_privilege('authenticated','artist_song_play_origins_compare(uuid,date,date)','EXECUTE') auth`)).rows).toEqual([{anon:false,auth:true}]);
 });
 it('songs access denied hides the organic series without breaking traffic',async()=>{
  await db.exec("SET test.denied='yes'");
  const r=await compare();expect(r.musica_daily).toEqual({available:false,reason:'songs_access_required'});expect(r.trafego_diario).toHaveLength(3);
  await db.exec("SET test.denied='no'");
 });
 it('rejects invalid windows',async()=>{await expect(db.query(`SELECT artist_song_play_origins_compare($1,'2026-10-19','2026-10-18')`,[artist])).rejects.toThrow('periodo_invalido');});
});