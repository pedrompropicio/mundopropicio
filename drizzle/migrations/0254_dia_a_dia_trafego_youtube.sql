CREATE OR REPLACE FUNCTION public.artist_song_play_origins_compare(p_artist_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_company uuid; v_result jsonb;
BEGIN
 v_company:=public.artist_access_check(p_artist_id,'read','songs');
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>61 THEN RAISE EXCEPTION 'periodo_invalido'; END IF;
 WITH songs AS (SELECT id,title,release_date FROM public.artist_songs WHERE artist_id=p_artist_id AND company_id=v_company AND tracking_status='ativo'),
 dates AS (SELECT s.*,(SELECT max(m.metric_date) FROM public.artist_song_metrics_daily m WHERE m.song_id=s.id AND m.artist_id=p_artist_id AND m.company_id=v_company AND m.metric='s4a_streams_day' AND m.source='s4a_api') s4a_until FROM songs s),
 days AS (SELECT s.*,d::date AS metric_day FROM dates s CROSS JOIN LATERAL generate_series(greatest(p_from,p_to-13)::timestamp,p_to::timestamp,interval '1 day') d),
 metrics AS (SELECT m.song_id,m.metric_date,m.metric,m.value,row_number() OVER(PARTITION BY m.song_id,m.metric_date,m.metric ORDER BY m.captured_at DESC,m.id DESC) rn FROM public.artist_song_metrics_daily m JOIN songs s ON s.id=m.song_id WHERE m.company_id=v_company AND m.artist_id=p_artist_id AND m.platform='spotify' AND m.source='s4a_api' AND m.metric_date BETWEEN greatest(p_from,p_to-13) AND p_to AND (m.metric IN ('s4a_streams_day','s4a_streams_day_br','s4a_streams_day_pt') OR m.metric LIKE 's4a_source_%_day')),
 pl_real AS (SELECT p.song_id,p.snapshot_date,count(*) n,count(p.streams) known,
  count(*) FILTER(WHERE p.playlist_kind IS NULL) unclassified,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_uri='spotify:playlist:radio' OR lower(trim(p.playlist_name))='radio'),0) radio,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_kind='algorithmic' AND NOT (p.playlist_uri='spotify:playlist:radio' OR lower(trim(p.playlist_name))='radio')),0) other_algorithmic,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_kind='editorial'),0) editorial,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_kind='algotorial'),0) algotorial,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_kind='editorial' OR p.playlist_kind='algotorial'),0) other_spotify,
  coalesce(sum(p.streams) FILTER(WHERE p.playlist_kind='listener'),0) listeners,
  coalesce(sum(p.streams),0) total_top100
  FROM public.artist_song_playlist_streams p JOIN songs s ON s.id=p.song_id
  WHERE p.company_id=v_company AND p.artist_id=p_artist_id AND p.source='s4a_api' AND p.period_days=1
    AND p.snapshot_date BETWEEN greatest(p_from,p_to-13) AND p_to GROUP BY 1,2),
 pl_est AS (SELECT p.song_id,p.day snapshot_date,count(*) n,count(p.streams_day) known,bool_or(p.estimated) estimated,
  CASE WHEN count(*) FILTER(WHERE p.category='radio')=count(p.streams_day) FILTER(WHERE p.category='radio') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.category='radio'),0) END radio,
  CASE WHEN count(*) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio')=count(p.streams_day) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio'),0) END other_algorithmic,
  CASE WHEN count(*) FILTER(WHERE p.playlist_kind='editorial')=count(p.streams_day) FILTER(WHERE p.playlist_kind='editorial') AND count(*) FILTER(WHERE p.playlist_kind IS NULL)=0 THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='editorial'),0) END editorial,
  CASE WHEN count(*) FILTER(WHERE p.playlist_kind='algotorial')=count(p.streams_day) FILTER(WHERE p.playlist_kind='algotorial') AND count(*) FILTER(WHERE p.playlist_kind IS NULL)=0 THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='algotorial'),0) END algotorial,
  CASE WHEN count(*) FILTER(WHERE p.playlist_kind='listener')=count(p.streams_day) FILTER(WHERE p.playlist_kind='listener') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='listener'),0) END listeners,
  CASE WHEN count(*) FILTER(WHERE p.made_by='spotify' AND p.category<>'radio')=count(p.streams_day) FILTER(WHERE p.made_by='spotify' AND p.category<>'radio') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.made_by='spotify' AND p.category<>'radio'),0) END other_spotify,
  jsonb_build_object('radio',bool_or(p.estimated) FILTER(WHERE p.category='radio'),'other_algorithmic',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio'),'editorial',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='editorial'),'algotorial',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='algotorial'),'listener_playlists',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='listener')) estimates
  FROM public.artist_song_playlist_daily p JOIN songs s ON s.id=p.song_id WHERE p.company_id=v_company AND p.artist_id=p_artist_id AND p.day BETWEEN greatest(p_from,p_to-13) AND p_to GROUP BY 1,2),
 pl AS (
  SELECT r.song_id,r.snapshot_date,r.radio,r.other_algorithmic,r.editorial,r.algotorial,r.other_spotify,r.listeners,
   r.total_top100 rest_total,false estimated,'{}'::jsonb estimates,
   CASE WHEN r.unclassified>0 THEN 's4a_top100_1day_unclassified' ELSE 's4a_top100_1day' END cov
  FROM pl_real r WHERE r.n=r.known
  UNION ALL
  SELECT e.song_id,e.snapshot_date,e.radio,e.other_algorithmic,e.editorial,e.algotorial,e.other_spotify,e.listeners,
   e.radio+e.other_spotify+e.listeners,e.estimated,e.estimates,
   CASE WHEN e.n<>e.known THEN 'incomplete_missing_seed_or_snapshot' WHEN e.estimated THEN 's4a_top100_estimated_28day' ELSE 's4a_top100_1day' END
  FROM pl_est e WHERE NOT EXISTS(SELECT 1 FROM pl_real r WHERE r.song_id=e.song_id AND r.snapshot_date=e.snapshot_date AND r.n=r.known)),
 sounds AS (SELECT a.song_id,a.metric_date,sum(a.video_count) total,count(*) n,count(a.video_count) known,array_agg(a.music_id ORDER BY a.music_id) ids,array_agg(a.source ORDER BY a.music_id) sources FROM public.artist_song_tiktok_sound_daily a JOIN songs s ON s.id=a.song_id WHERE a.company_id=v_company AND a.metric_date BETWEEN greatest(p_from,p_to-13)-1 AND p_to GROUP BY 1,2),
 ios_raw AS (SELECT m.song_id,m.metric_date,m.value,row_number() OVER(PARTITION BY m.song_id,m.metric_date ORDER BY m.captured_at DESC,m.id DESC) rn FROM public.artist_song_metrics_daily m JOIN songs s ON s.id=m.song_id WHERE m.company_id=v_company AND m.artist_id=p_artist_id AND m.platform='tiktok' AND m.metric='ugc_videos' AND m.source='ios_shortcut' AND m.value>=0 AND m.metric_date<=p_to),
 ios AS (SELECT song_id,metric_date,value,lag(value) OVER(PARTITION BY song_id ORDER BY metric_date) previous_value,lag(metric_date) OVER(PARTITION BY song_id ORDER BY metric_date) previous_day FROM ios_raw WHERE rn=1),
 traffic AS (SELECT e.song_id,(e.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS metric_day,
   count(*) FILTER(WHERE e.event='app_open') aberturas_android,
   count(*) FILTER(WHERE e.event='choice' AND e.os='ios') toques_ios,
   count(*) FILTER(WHERE e.utm_source='meta') aberturas_meta,
   count(*) FILTER(WHERE e.utm_source='tiktok') aberturas_tiktok,
   count(DISTINCT e.ip_hash) pessoas_trafego
  FROM public.song_link_events e JOIN songs s ON s.id=e.song_id
  WHERE e.company_id=v_company AND e.artist_id=p_artist_id
    AND (e.utm_medium='paid' OR e.fbclid IS NOT NULL OR e.ttclid IS NOT NULL)
    AND (e.utm_content IS NULL OR e.utm_content NOT LIKE 'teste_%')
    AND e.event IN ('app_open','choice')
    AND (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN greatest(p_from,p_to-13) AND p_to
  GROUP BY 1,2),
 yt_paid AS (SELECT s.id AS song_id,g.date_start AS metric_day,
   sum(coalesce(nullif(g.video_metrics->>'video_views','')::bigint,0)) youtube_views_pagas
  FROM crm.google_campaign_insights_daily g JOIN songs s
    ON position(regexp_replace(lower(unaccent(s.title)),'[^a-z0-9]','','g')
       in regexp_replace(lower(unaccent(g.campaign_name)),'[^a-z0-9]','','g'))>0
  WHERE g.company_id=v_company
    AND g.date_start BETWEEN greatest(p_from,p_to-13) AND p_to
  GROUP BY 1,2),
 yt_pub_raw AS (SELECT m.song_id,m.metric_date,m.value,row_number() OVER(PARTITION BY m.song_id,m.metric_date ORDER BY m.captured_at DESC,m.id DESC) rn
  FROM public.artist_song_metrics_daily m JOIN songs s ON s.id=m.song_id
  WHERE m.company_id=v_company AND m.artist_id=p_artist_id AND m.metric='youtube_views' AND m.source='youtube_public'
    AND m.metric_date BETWEEN greatest(p_from,p_to-13)-1 AND p_to),
 yt_pub AS (SELECT song_id,metric_date,value,lag(value) OVER(PARTITION BY song_id ORDER BY metric_date) previous_value
  FROM yt_pub_raw WHERE rn=1),
 result_rows AS (SELECT d.id song_id,d.title,d.metric_day AS day,d.s4a_until,CASE WHEN d.metric_day<=d.s4a_until THEN m.value END spotify_total,CASE WHEN d.metric_day<=d.s4a_until THEN mbr.value END spotify_br,CASE WHEN d.metric_day<=d.s4a_until THEN mpt.value END spotify_pt,
  p.radio,p.other_spotify,p.other_algorithmic,p.editorial,p.algotorial,p.listeners listener_playlists,p.estimated,coalesce(p.estimates,'{}'::jsonb) estimated_fields,
  CASE WHEN p.rest_total IS NOT NULL AND m.value>=p.rest_total THEN m.value-p.rest_total END rest,
  CASE WHEN m.value>0 THEN round(p.radio/m.value*100,4) END radio_pct,
  (SELECT coalesce(jsonb_object_agg(x.metric,x.value),'{}'::jsonb) FROM metrics x WHERE x.song_id=d.id AND x.metric_date=d.metric_day AND x.rn=1 AND x.metric LIKE 's4a_source_%_day') source_categories,
  CASE WHEN p.song_id IS NULL THEN 'unavailable' ELSE p.cov END playlist_coverage,
  i.value ugc_total,i.value-i.previous_value ugc_new,i.metric_date-i.previous_day ugc_days_covered,i.previous_day ugc_previous_capture_day,
  'ios_shortcut'::text ugc_source,'centena'::text ugc_precision,(i.metric_date IS NULL) ugc_capture_missing,coalesce(i.value<i.previous_value,false) ugc_drop,
  CASE WHEN a.n=a.known THEN a.total END apify_total,a.n sound_count,CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total-prev.total END apify_new,
  CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total<prev.total ELSE false END apify_drop,
  CASE WHEN a.ids IS NOT NULL AND prev.ids IS NOT NULL THEN a.ids=prev.ids END same_sounds,CASE WHEN a.ids=prev.ids THEN a.sources=prev.sources END same_sources,
  CASE WHEN d.metric_day>='2026-10-25'::date THEN t.aberturas_android END aberturas_android,
  t.toques_ios,
  CASE WHEN d.metric_day>='2026-10-25'::date THEN coalesce(t.aberturas_android,0)+coalesce(t.toques_ios,0) ELSE t.toques_ios END aberturas_trafego,
  t.aberturas_meta,t.aberturas_tiktok,t.pessoas_trafego,
  yp.youtube_views_pagas,
  CASE WHEN y.value IS NOT NULL AND y.previous_value IS NOT NULL THEN y.value-y.previous_value END youtube_views_dia,
  true youtube_views_dia_aprox,
  CASE WHEN y.value IS NOT NULL AND y.previous_value IS NOT NULL AND yp.youtube_views_pagas IS NOT NULL THEN y.value-y.previous_value-yp.youtube_views_pagas END youtube_views_alem_pagas
  FROM days d LEFT JOIN ios i ON i.song_id=d.id AND i.metric_date=d.metric_day LEFT JOIN metrics m ON m.song_id=d.id AND m.metric_date=d.metric_day AND m.metric='s4a_streams_day' AND m.rn=1 LEFT JOIN metrics mbr ON mbr.song_id=d.id AND mbr.metric_date=d.metric_day AND mbr.metric='s4a_streams_day_br' AND mbr.rn=1 LEFT JOIN metrics mpt ON mpt.song_id=d.id AND mpt.metric_date=d.metric_day AND mpt.metric='s4a_streams_day_pt' AND mpt.rn=1 LEFT JOIN pl p ON p.song_id=d.id AND p.snapshot_date=d.metric_day LEFT JOIN sounds a ON a.song_id=d.id AND a.metric_date=d.metric_day LEFT JOIN sounds prev ON prev.song_id=d.id AND prev.metric_date=d.metric_day-1
  LEFT JOIN traffic t ON t.song_id=d.id AND t.metric_day=d.metric_day
  LEFT JOIN yt_paid yp ON yp.song_id=d.id AND yp.metric_day=d.metric_day
  LEFT JOIN yt_pub y ON y.song_id=d.id AND y.metric_date=d.metric_day)
 SELECT jsonb_build_object('available',true,'source_origin_capture_enabled',false,'scope','global_song_not_ad_country','playlist_note','Top 100 observado; resto inclui playlists não listadas e outras origens. Não é a divisão completa por origem.','estimated',coalesce(bool_or(estimated),false),'days',coalesce(jsonb_agg(to_jsonb(result_rows) ORDER BY day,song_id),'[]'::jsonb)) INTO v_result FROM result_rows;
 RETURN v_result;
END $function$;