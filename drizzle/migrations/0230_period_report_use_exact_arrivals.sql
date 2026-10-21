SET LOCAL lock_timeout='5s';
CREATE FUNCTION public.song_link_report_arrivals(p_artist_id uuid,p_from date,p_to date,p_country text) RETURNS TABLE(kind text,src text,k text,canal text,n numeric,v bigint,sp numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET work_mem='64MB' SET enable_sort=off AS $h$
#variable_conflict use_column
BEGIN
IF EXISTS(SELECT 1 FROM public.song_link_report_hourly_state s WHERE s.artist_id=p_artist_id AND s.ready) AND NOT EXISTS(SELECT 1 FROM public.song_link_report_hourly_log l WHERE l.artist_id=p_artist_id AND l.kind='pending' AND l.repaired_at IS NULL) THEN
RETURN QUERY WITH counts AS MATERIALIZED(SELECT r.dim->>1 src,r.dim->>3 campaign,r.dim->>4 pais,r.dim->>5 canal,r.n,(p_country IS NULL OR upper(r.dim->>4)=upper(p_country)) pais_ok FROM public.song_link_report_hourly r WHERE r.artist_id=p_artist_id AND r.hour_utc>=p_from::timestamptz AND r.hour_utc<(p_to+1)::timestamptz AND r.n>0),
members AS MATERIALIZED(SELECT r.kind,r.dim,(r.hour_utc AT TIME ZONE 'UTC')::date dia FROM public.song_link_report_visitors_hourly r WHERE r.artist_id=p_artist_id AND r.hour_utc>=p_from::timestamptz AND r.hour_utc<(p_to+1)::timestamptz AND r.n>0 AND(p_country IS NULL OR upper(CASE r.kind WHEN 'campaign' THEN r.dim->>2 ELSE r.dim->>1 END)=upper(p_country))),
ca AS(SELECT c.src,c.campaign,sum(c.n) n FROM counts c WHERE c.pais_ok GROUP BY 1,2),
cv AS(SELECT z.src,z.campaign,count(*) v FROM(SELECT DISTINCT m.dim->>0 src,m.dim->>1 campaign,m.dia,m.dim->>3 ip_hash FROM members m WHERE m.kind='campaign')z GROUP BY 1,2),
ch AS(SELECT c.canal,coalesce(sum(c.n) FILTER(WHERE c.pais_ok),0)n,coalesce(sum(c.n) FILTER(WHERE c.pais IS NULL),0)sp FROM counts c GROUP BY 1),
hv AS(SELECT z.canal,count(*)v FROM(SELECT DISTINCT m.dim->>0 canal,m.dia,m.dim->>2 ip_hash FROM members m WHERE m.kind='channel')z GROUP BY 1)
SELECT 'campaign'::text,a.src,public.artist_ads_campaign_key(a.campaign),NULL::text,a.n,b.v,NULL::numeric FROM ca a JOIN cv b ON a.src IS NOT DISTINCT FROM b.src AND a.campaign IS NOT DISTINCT FROM b.campaign
UNION ALL SELECT 'channel',NULL,NULL,a.canal,a.n,coalesce(b.v,0),a.sp FROM ch a LEFT JOIN hv b ON b.canal=a.canal;
ELSE
RETURN QUERY WITH evd AS MATERIALIZED(SELECT e.link_id,lower(coalesce(e.utm_source,''))src,e.utm_medium,e.utm_campaign,e.country pais,e.created_at::date dia,e.ip_hash,count(*)n FROM public.song_link_events e WHERE e.artist_id=p_artist_id AND e.event='arrival' AND e.created_at>=p_from::timestamptz AND e.created_at<(p_to+1)::timestamptz GROUP BY 1,2,3,4,5,6,7),
evdl AS MATERIALIZED(SELECT d.src,d.utm_campaign,d.pais,d.dia,d.ip_hash,d.n,
CASE WHEN d.src LIKE 'teste%' THEN 'teste' WHEN nullif(btrim(coalesce(l.canal,'')),'')='instagram_bio' AND lower(btrim(coalesce(d.utm_medium,'')))='story' THEN 'instagram_story' WHEN nullif(btrim(coalesce(l.canal,'')),'') IS NOT NULL THEN nullif(btrim(coalesce(l.canal,'')),'') WHEN lower(btrim(coalesce(d.utm_campaign,'')))='ig_bio' OR lower(btrim(coalesce(d.utm_medium,'')))='bio' THEN 'instagram_bio' WHEN lower(btrim(coalesce(d.utm_medium,'')))='story' THEN 'instagram_story' WHEN d.src='tiktok' THEN 'tiktok_ads' WHEN d.src IN('google','youtube') THEN 'google_ads' WHEN d.src IN('meta','facebook','fb') THEN CASE WHEN lower(btrim(coalesce(d.utm_medium,''))) IN('social','organic') THEN 'outro' ELSE 'meta_ads' END WHEN d.src IN('ig','instagram') THEN CASE WHEN lower(btrim(coalesce(d.utm_medium,''))) IN('paid','cpc','ads','paid_social') THEN 'meta_ads' ELSE 'instagram_organico' END WHEN d.src='' THEN 'sem_origem' ELSE 'outro' END canal,(p_country IS NULL OR upper(d.pais)=upper(p_country))pais_ok FROM evd d LEFT JOIN public.song_links l ON l.id=d.link_id),
ev AS MATERIALIZED(SELECT a.src,public.artist_ads_campaign_key(a.utm_campaign)k,a.n,b.v FROM(SELECT src,utm_campaign,sum(n)n FROM evdl WHERE pais_ok GROUP BY 1,2)a JOIN(SELECT src,utm_campaign,count(*)v FROM(SELECT DISTINCT src,utm_campaign,dia,ip_hash FROM evdl WHERE pais_ok)z GROUP BY 1,2)b ON b.src IS NOT DISTINCT FROM a.src AND b.utm_campaign IS NOT DISTINCT FROM a.utm_campaign),
evc AS MATERIALIZED(SELECT a.canal,a.n,coalesce(b.v,0)v,a.sp FROM(SELECT canal,coalesce(sum(n) FILTER(WHERE pais_ok),0)n,coalesce(sum(n) FILTER(WHERE pais IS NULL),0)sp FROM evdl GROUP BY 1)a LEFT JOIN(SELECT canal,count(*)v FROM(SELECT DISTINCT canal,dia,ip_hash FROM evdl WHERE pais_ok)z GROUP BY 1)b ON b.canal=a.canal)
SELECT 'campaign'::text,e.src,e.k,NULL::text,e.n::numeric,e.v,NULL::numeric FROM ev e UNION ALL SELECT 'channel',NULL,NULL,e.canal,e.n::numeric,e.v,e.sp::numeric FROM evc e;
END IF; END $h$;
REVOKE ALL ON FUNCTION public.song_link_report_arrivals(uuid,date,date,text) FROM PUBLIC,anon,authenticated;
DO $acl$ DECLARE r record; BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname='sandbox_exec' OR rolname LIKE 'sandbox_exec_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.song_link_report_arrivals(uuid,date,date,text) FROM %I',r.rolname); END LOOP; END $acl$;
COMMENT ON FUNCTION public.song_link_report_arrivals(uuid,date,date,text) IS 'Private exact UTC whole-hour source. Full-history validation required; fallback to retained events whenever unready/pending. Daily DISTINCT tuples preserve NULL identities and cross-hour/country deduplication.';
DO $swap$ DECLARE d text;a integer;b integer; BEGIN
 d:=pg_get_functiondef('public.artist_ads_period_report(uuid,date,date,text)'::regprocedure);
 a:=position('  evd AS MATERIALIZED' IN d);b:=position('  evcn AS' IN d);
 IF a=0 OR b<=a THEN RAISE EXCEPTION 'period_report definition drift';END IF;
 d:=substring(d FROM 1 FOR a-1)||'  arrival_report AS MATERIALIZED (SELECT * FROM public.song_link_report_arrivals(p_artist_id,p_from,p_to,p_country)),
  ev AS MATERIALIZED (SELECT src,k,n,v FROM arrival_report WHERE kind=''campaign''),
  evk AS (SELECT * FROM ev WHERE length(k)>=10),
  evc AS MATERIALIZED (SELECT canal,n,v,sp FROM arrival_report WHERE kind=''channel''),
'||substring(d FROM b);
 EXECUTE d;
END $swap$;