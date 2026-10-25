// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
let db: PGlite;
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE FUNCTION artist_access_check(uuid,text,text) RETURNS uuid LANGUAGE sql AS $$ SELECT '10000000-0000-4000-8000-000000000002'::uuid $$;
 CREATE TABLE artist_songs(id uuid,title text,release_date date,artist_id uuid,company_id uuid,tracking_status text);
 CREATE TABLE artist_song_playlist_streams(company_id uuid,artist_id uuid,song_id uuid,playlist_key text,snapshot_date date,period_days int,streams int,source text,playlist_name text,playlist_uri text,made_by text);
 CREATE TABLE artist_song_metrics_daily(id uuid,song_id uuid,artist_id uuid,company_id uuid,metric_date date,metric text,platform text,source text,value numeric,captured_at timestamptz);
 CREATE TABLE artist_song_tiktok_sound_daily(song_id uuid,company_id uuid,metric_date date,video_count bigint,music_id text,source text);
 INSERT INTO artist_songs VALUES('10000000-0000-4000-8000-000000000003','Synthetic','2026-09-02','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','ativo');`);
 await db.exec(readFileSync(process.env.S4A_ADJUST_SQL ?? 'drizzle/migrations/0242_s4a_playlist_kind_estimates.sql','utf8'));
 await db.exec(readFileSync('drizzle/migrations/0243_s4a_radio_historical_identity.sql','utf8'));
 await db.exec(readFileSync(process.env.UGC_SQL ?? 'drizzle/migrations/0244_ugc_ios_primary_compare.sql','utf8'));
 await db.exec(`INSERT INTO artist_song_playlist_streams SELECT '10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','radio',d::date,28,least((d::date-'2026-09-02'::date)+1,28)*10,'s4a_api','Radio','spotify:playlist:radio','spotify','algorithmic' FROM generate_series('2026-09-02'::date,'2026-10-01'::date,'1 day') d;
 INSERT INTO artist_song_playlist_streams VALUES('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','radio','2026-10-01',1,12,'s4a_api','Radio','spotify:playlist:radio','spotify','algorithmic');`);
},30000);
afterAll(async()=>{await db?.close();});
it('derives release boundary and D-28 then prefers actual daily',async()=>{
 const r=(await db.query(`SELECT day::text,streams_day,estimated FROM artist_song_playlist_daily WHERE day IN('2026-09-02','2026-09-30','2026-10-01') ORDER BY day`)).rows;
 expect(r).toEqual([{day:'2026-09-02',streams_day:'10',estimated:true},{day:'2026-09-30',streams_day:'10',estimated:true},{day:'2026-10-01',streams_day:'12',estimated:false}]);
});
it('missing predecessor stays null and cannot invent a seed',async()=>{
 await db.exec("DELETE FROM artist_song_playlist_streams WHERE snapshot_date='2026-09-03'");
 expect((await db.query<{streams_day:string|null}>(`SELECT streams_day FROM artist_song_playlist_daily WHERE day='2026-09-04'`)).rows[0].streams_day).toBeNull();
});
it('only grants read access to the view',async()=>{
 expect((await db.query(`SELECT has_table_privilege('anon','artist_song_playlist_daily','SELECT') anon,has_table_privilege('authenticated','artist_song_playlist_daily','SELECT') read,has_table_privilege('authenticated','artist_song_playlist_daily','INSERT') write`)).rows[0]).toEqual({anon:false,read:true,write:false});
});
it('iOS is primary with hundred precision; gaps stay empty and next delta covers all days',async()=>{
 await db.exec(`INSERT INTO artist_song_metrics_daily SELECT '10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',d,'ugc_videos','tiktok','ios_shortcut',v,now() FROM (VALUES ('2026-10-20'::date,17500),('2026-10-24'::date,19300)) x(d,v);
 INSERT INTO artist_song_tiktok_sound_daily VALUES('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','2026-10-23',6350,'synthetic','apify'),('10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','2026-10-24',6234,'synthetic','apify');`);
 const r=(await db.query<{r:{days:Record<string,unknown>[]}}>(`SELECT artist_song_play_origins_compare('10000000-0000-4000-8000-000000000001','2026-10-21','2026-10-24') r`)).rows[0].r.days;
 expect(r[0]).toMatchObject({day:'2026-10-21',ugc_total:null,ugc_new:null,ugc_capture_missing:true,ugc_drop:false});
 expect(r[3]).toMatchObject({day:'2026-10-24',ugc_total:19300,ugc_new:1800,ugc_days_covered:4,ugc_previous_capture_day:'2026-10-20',ugc_precision:'centena',ugc_source:'ios_shortcut',ugc_drop:false,apify_total:6234,apify_new:-116,apify_drop:true});
});
it('only a decrease in iOS triggers the main alert; no fallback to Apify',async()=>{
 await db.exec(`INSERT INTO artist_song_metrics_daily VALUES('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2026-10-25','ugc_videos','tiktok','ios_shortcut',19000,now());`);
 const r=(await db.query<{r:{days:Record<string,unknown>[]}}>(`SELECT artist_song_play_origins_compare('10000000-0000-4000-8000-000000000001','2026-10-25','2026-10-26') r`)).rows[0].r.days;
 expect(r[0]).toMatchObject({ugc_total:19000,ugc_new:-300,ugc_days_covered:1,ugc_drop:true});
 expect(r[1]).toMatchObject({ugc_total:null,ugc_new:null,ugc_drop:false,ugc_capture_missing:true});
});