// @vitest-environment node
// Custo por chegada do trafego_diario (0245): só campanhas com destino ao
// smart link entram no numerador; visualizações ficam em gasto_sem_destino.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
let db: PGlite;
const artist='10000000-0000-4000-8000-000000000001', company='10000000-0000-4000-8000-000000000002';
const connMeta='20000000-0000-4000-8000-000000000001', connTt='20000000-0000-4000-8000-000000000002';
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA crm;
 CREATE FUNCTION public.artist_access_check(uuid,text,text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN RETURN '${company}'::uuid; END $$;
 CREATE FUNCTION public.artist_ads_norm(p_text text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(lower(translate(coalesce(p_text,''),
   'áàâãäåéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
   'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn')),'[^a-z0-9]+',' ','g')) $$;
 CREATE FUNCTION public.artist_ads_campaign_key(p_text text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(regexp_replace(regexp_replace(' '||public.artist_ads_norm(p_text)||' ',
   ' (de|da|do|dos|das|e) ',' ','g'),' (de|da|do|dos|das|e) ',' ','g'),' ','') $$;
 CREATE FUNCTION public.song_link_event_canal(p_canal text,p_source text,p_medium text,p_campaign text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_medium='paid' AND lower(coalesce(p_source,'')) IN ('meta','facebook','instagram','fb','ig') THEN 'meta_ads'
    WHEN p_medium='paid' AND lower(coalesce(p_source,''))='tiktok' THEN 'tiktok_ads'
    WHEN p_medium='paid' AND lower(coalesce(p_source,''))='google' THEN 'google_ads' ELSE 'outro' END $$;
 CREATE FUNCTION public.artist_song_play_origins_compare(uuid,date,date) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"available":false}'::jsonb $$;
 CREATE TABLE crm.ad_platform_connections(id uuid,platform text,connection_scope text,artist_id uuid,company_id uuid,selected_ad_account_currency text);
 CREATE TABLE crm.meta_campaign_snapshot(connection_id uuid,external_campaign_id text,name text,market_country text);
 CREATE TABLE crm.google_campaign(connection_id uuid,external_campaign_id text,name text,market_country text);
 CREATE TABLE crm.tiktok_campaign_carreira(connection_id uuid,external_campaign_id text,name text,market_country text);
 CREATE TABLE crm.meta_ad_snapshot(connection_id uuid,external_campaign_id text,external_ad_id text,raw jsonb);
 CREATE TABLE crm.ads_insights_hourly(platform text,currency text,level text,connection_id uuid,external_campaign_id text,metric_date date,metric_hour int,spend_cents bigint,impressions bigint,clicks bigint,last_synced_at timestamptz,account_timezone text);
 CREATE TABLE crm.ads_insights_breakdown_daily(platform text,currency text,level text,connection_id uuid,external_campaign_id text,breakdown text,breakdown_value text,impressions bigint,clicks bigint,spend_cents bigint,date_start date);
 CREATE TABLE crm.meta_campaign_insights_daily(connection_id uuid,external_campaign_id text,date_start date,currency text,spend_cents bigint,actions jsonb);
 CREATE TABLE public.song_links(id uuid,canal text);
 CREATE TABLE public.song_link_events(id uuid,link_id uuid,artist_id uuid,event text,utm_source text,utm_medium text,utm_campaign text,utm_term text,country text,os text,created_at timestamptz);
 INSERT INTO crm.ad_platform_connections VALUES
  ('${connMeta}','meta','artist','${artist}','${company}','BRL'),
  ('${connTt}','tiktok','artist','${artist}','${company}','BRL');
 INSERT INTO crm.meta_campaign_snapshot VALUES
  ('${connMeta}','C1','[MP] [ROUPA DE SOLTEIRA] [Tráfego] 2026-09-25','BR'),
  ('${connMeta}','C2','[MP] LITTO IG Seguidores - Visitas ao perfil 2026-10-01','BR');
 INSERT INTO crm.tiktok_campaign_carreira VALUES
  ('${connTt}','T1','[MP] [ROUPA DE SOLTEIRA] [Tráfego Smart Link] 2026-09-26','BR'),
  ('${connTt}','T2','[MP] [ROUPA DE SOLTEIRA] [Visualizações UGC] 2026-09-25','BR');
 INSERT INTO crm.meta_ad_snapshot VALUES
  ('${connMeta}','C1','A1','{"creative":{"object_story_spec":{"link_data":{"link":"https://exemplo.com/m/abc123"}}}}'),
  ('${connMeta}','C2','A2','{"creative":{"object_story_spec":{"link_data":{"link":"https://instagram.com/perfil"}}}}');
 INSERT INTO crm.ads_insights_hourly VALUES
  ('meta','BRL','campaign','${connMeta}','C1','2026-10-19',10,5000,1000,50,'2026-10-19 12:00','UTC'),
  ('meta','BRL','campaign','${connMeta}','C2','2026-10-19',10,7000,2000,10,'2026-10-19 12:00','UTC'),
  ('tiktok','BRL','campaign','${connTt}','T1','2026-10-19',10,10000,3000,80,'2026-10-19 12:00','UTC'),
  ('tiktok','BRL','campaign','${connTt}','T2','2026-10-19',10,90000,90000,100,'2026-10-19 12:00','UTC');`);
 // 40 chegadas Meta com id de anúncio da campanha com destino; 5 com id desconhecido
 await db.exec(`INSERT INTO public.song_link_events
  SELECT gen_random_uuid(),NULL,'${artist}','arrival','meta','paid',NULL,'A1','BR','android',timestamptz '2026-10-19 10:30' FROM generate_series(1,40);
 INSERT INTO public.song_link_events
  SELECT gen_random_uuid(),NULL,'${artist}','arrival','meta','paid',NULL,'999','BR','ios',timestamptz '2026-10-19 10:30' FROM generate_series(1,5);
 INSERT INTO public.song_link_events
  SELECT gen_random_uuid(),NULL,'${artist}','arrival','tiktok','paid','mp_roupa_solteira_trafego',NULL,'BR','android',timestamptz '2026-10-19 10:30' FROM generate_series(1,40);
 INSERT INTO public.song_link_events
  SELECT gen_random_uuid(),NULL,'${artist}','arrival','tiktok','paid','campanha_misteriosa_xyz',NULL,'BR','ios',timestamptz '2026-10-19 10:30' FROM generate_series(1,5);`);
 await db.exec(readFileSync('drizzle/migrations/0245_ads_compare_custo_por_chegada_destino.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
const row=async(platform:string)=>{
 const {rows}=await db.query<{r:any}>(`SELECT artist_ads_compare($1,'2026-10-19','2026-10-19',NULL,'UTC') r`,[artist]);
 return rows[0].r.trafego_diario.find((x:any)=>x.platform===platform);
};
describe('trafego_diario com destino ao smart link (0245)',()=>{
 it('Meta: gasto com destino só da campanha com criativo /m/; custo = gasto_destino ÷ chegadas pagas',async()=>{
  const r=await row('meta');
  expect(r).toMatchObject({day:'2026-10-19',currency:'BRL',gasto:120,gasto_com_destino:50,gasto_sem_destino:70,chegadas:45,chegadas_sem_campanha:5,custo_por_chegada:1.1111});
 });
 it('TikTok: campanha de visualizações fora do numerador; chave de utm_campaign liga à campanha de tráfego',async()=>{
  const r=await row('tiktok');
  expect(r).toMatchObject({day:'2026-10-19',gasto:1000,gasto_com_destino:100,gasto_sem_destino:900,chegadas:45,chegadas_sem_campanha:5,custo_por_chegada:2.2222});
 });
 it('mantém as chaves antigas e o bloco musica_daily',async()=>{
  const {rows}=await db.query<{r:any}>(`SELECT artist_ads_compare($1,'2026-10-19','2026-10-19',NULL,'UTC') r`,[artist]);
  expect(rows[0].r.musica_daily).toEqual({available:false});
  expect(rows[0].r.serie_horaria.length).toBeGreaterThan(0);
  expect(rows[0].r.lacunas.some((t:string)=>t.includes('gasto_sem_destino'))).toBe(true);
 });
});
