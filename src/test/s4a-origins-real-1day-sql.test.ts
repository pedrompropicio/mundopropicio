// @vitest-environment node
// 0247/0248: dia com captura real de 1 dia usa só valores reais do top 100;
// sem captura real mantém derivação/nulos; resto negativo -> null.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
let db: PGlite;
const artist='10000000-0000-4000-8000-000000000001', company='10000000-0000-4000-8000-000000000002';
const songA='10000000-0000-4000-8000-000000000003', songB='10000000-0000-4000-8000-000000000004';
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE FUNCTION public.artist_access_check(uuid,text,text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN RETURN '${company}'::uuid; END $$;
 CREATE TABLE artist_songs(id uuid,title text,release_date date,artist_id uuid,company_id uuid,tracking_status text);
 CREATE TABLE artist_song_metrics_daily(id uuid,song_id uuid,artist_id uuid,company_id uuid,platform text,metric text,metric_date date,value numeric,source text,captured_at timestamptz);
 CREATE TABLE artist_song_playlist_streams(song_id uuid,artist_id uuid,company_id uuid,snapshot_date date,period_days int,source text,streams int,made_by text,playlist_uri text,playlist_name text);
 CREATE TABLE artist_song_tiktok_sound_daily(song_id uuid,company_id uuid,metric_date date,music_id text,video_count bigint,source text);
 CREATE FUNCTION public.artist_ads_compare(p_artist_id uuid,p_from date,p_to date,p_country text,p_tz text) RETURNS jsonb LANGUAGE plpgsql AS $$
 DECLARE r jsonb; BEGIN
 WITH sho AS (SELECT '2026-10-19'::timestamp ts,'meta'::text platform,'BRL'::text cur,60::numeric g,30::bigint n),lac AS (SELECT jsonb_build_object('note','existing') t)
 SELECT jsonb_build_object('old','preserved','lacunas', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM lac)) INTO r;
  RETURN r;
  END $$;
 INSERT INTO artist_songs VALUES
  ('${songA}','Song A','2026-09-02','${artist}','${company}','ativo'),
  ('${songB}','Song B','2026-09-02','${artist}','${company}','ativo');
 INSERT INTO artist_song_metrics_daily VALUES
  ('${songA}','${songA}','${artist}','${company}','spotify','s4a_streams_day','2026-10-23',117319,'s4a_api',now()),
  ('${songB}','${songB}','${artist}','${company}','spotify','s4a_streams_day','2026-10-23',100,'s4a_api',now());`);
 for(const f of ['0241_s4a_daily_compare','0242_s4a_playlist_kind_estimates','0243_s4a_radio_historical_identity','0244_ugc_ios_primary_compare','0247_s4a_origins_real_1day_priority','0248_s4a_origins_real_1day_keep_other_spotify'])
  await db.exec(readFileSync(`drizzle/migrations/${f}.sql`,'utf8'));
 // Song A, 23/10: captura real 1day (forma da corrida real do Litto)
 await db.exec(`INSERT INTO artist_song_playlist_streams(song_id,artist_id,company_id,snapshot_date,period_days,source,streams,made_by,playlist_uri,playlist_name,playlist_kind) VALUES
  ('${songA}','${artist}','${company}','2026-10-23',1,'s4a_api',36634,'spotify','spotify:playlist:radio','Radio','algorithmic'),
  ('${songA}','${artist}','${company}','2026-10-23',1,'s4a_api',2407,'spotify','spotify:playlist:mixes','Mixes','algorithmic'),
  ('${songA}','${artist}','${company}','2026-10-23',1,'s4a_api',460,'spotify','spotify:playlist:thisis','This Is X','editorial'),
  ('${songA}','${artist}','${company}','2026-10-23',1,'s4a_api',152,'spotify','spotify:playlist:algo','pisa e sofre','algotorial'),
  ('${songA}','${artist}','${company}','2026-10-23',1,'s4a_api',52850,'user','spotify:playlist:user1','Playlist ouvinte','listener');
 INSERT INTO artist_song_playlist_streams(song_id,artist_id,company_id,snapshot_date,period_days,source,streams,made_by,playlist_uri,playlist_name,playlist_kind) VALUES
  ('${songB}','${artist}','${company}','2026-10-23',1,'s4a_api',90,'user','spotify:playlist:u2','L1','listener'),
  ('${songB}','${artist}','${company}','2026-10-23',1,'s4a_api',60,'spotify','spotify:playlist:radio','Radio','algorithmic'),
  ('${songB}','${artist}','${company}','2026-10-23',1,'s4a_api',10,'spotify','spotify:playlist:unk','Sem classe',NULL);`);
},30000);
afterAll(async()=>{await db?.close();});
const day=async(song:string,d:string)=>{
 const {rows}=await db.query<{r:any}>(`SELECT artist_song_play_origins_compare($1,'2026-10-22','2026-10-23') r`,[artist]);
 return rows[0].r.days.find((x:any)=>x.song_id===song&&x.day===d);
};
describe('origens com captura real de 1 dia (0247/0248)',()=>{
 it('23/10 real: somas por classe do 1day e rest = total - top100',async()=>{
  const d=await day(songA,'2026-10-23');
  expect(d).toMatchObject({spotify_total:117319,radio:36634,other_algorithmic:2407,editorial:460,algotorial:152,other_spotify:612,listener_playlists:52850,rest:24816,estimated:false,playlist_coverage:'s4a_top100_1day'});
  expect(d.estimated_fields).toEqual({});
 });
 it('dia sem captura real fica indisponível/estimado, sem inventar valores',async()=>{
  const d=await day(songA,'2026-10-22');
  expect(d.playlist_coverage).toBe('unavailable');
  expect(d.listener_playlists).toBeNull();
 });
 it('resto negativo -> null; linhas sem playlist_kind não somam e marcam cobertura',async()=>{
  const d=await day(songB,'2026-10-23');
  expect(d.rest).toBeNull();
  expect(d.listener_playlists).toBe(90);
  expect(d.radio).toBe(60);
  expect(d.playlist_coverage).toBe('s4a_top100_1day_unclassified');
 });
});
