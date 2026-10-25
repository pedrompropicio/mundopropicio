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
 await db.exec(`INSERT INTO artist_song_playlist_streams SELECT '10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','radio',d,28,least((d-'2026-09-02'::date)+1,28)*10,'s4a_api','Radio','spotify:playlist:radio','spotify','algorithmic' FROM generate_series('2026-09-02'::date,'2026-10-01'::date,'1 day') d;
 INSERT INTO artist_song_playlist_streams VALUES('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','radio','2026-10-01',1,12,'s4a_api','Radio','spotify:playlist:radio','spotify','algorithmic');`);
},30000);
afterAll(async()=>{await db?.close();});
it('derives release boundary and D-28 then prefers actual daily',async()=>{
 const r=(await db.query(`SELECT day,streams_day,estimated FROM artist_song_playlist_daily WHERE day IN('2026-09-02','2026-09-30','2026-10-01') ORDER BY day`)).rows;
 expect(r).toEqual([{day:'2026-09-02',streams_day:'10',estimated:true},{day:'2026-09-30',streams_day:'10',estimated:true},{day:'2026-10-01',streams_day:'12',estimated:false}]);
});
it('missing predecessor stays null and cannot invent a seed',async()=>{
 await db.exec("DELETE FROM artist_song_playlist_streams WHERE snapshot_date='2026-09-03'");
 expect((await db.query(`SELECT streams_day FROM artist_song_playlist_daily WHERE day='2026-09-04'`)).rows[0].streams_day).toBeNull();
});
it('only grants read access to the view',async()=>{
 expect((await db.query(`SELECT has_table_privilege('anon','artist_song_playlist_daily','SELECT') anon,has_table_privilege('authenticated','artist_song_playlist_daily','SELECT') read,has_table_privilege('authenticated','artist_song_playlist_daily','INSERT') write`)).rows[0]).toEqual({anon:false,read:true,write:false});
});