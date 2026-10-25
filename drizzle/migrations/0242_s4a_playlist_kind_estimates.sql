ALTER TABLE public.artist_song_playlist_streams ADD COLUMN playlist_kind text;
ALTER TABLE public.artist_song_playlist_streams ADD CONSTRAINT artist_playlist_kind_values CHECK (playlist_kind IN ('algorithmic','algotorial','editorial','listener'));
COMMENT ON COLUMN public.artist_song_playlist_streams.playlist_kind IS 'Classification from S4A author/algorithmic/algotorial flags; NULL historical classification not proven.';
CREATE VIEW public.artist_song_playlist_daily WITH (security_invoker=true) AS
WITH RECURSIVE keys AS (
 SELECT p.company_id,p.artist_id,p.song_id,p.playlist_key,s.release_date,min(p.snapshot_date) FILTER(WHERE p.period_days=1) first_real,max(p.snapshot_date) last_day
 FROM public.artist_song_playlist_streams p JOIN public.artist_songs s ON s.id=p.song_id AND s.company_id=p.company_id
 WHERE p.source='s4a_api' AND p.period_days IN(1,28) AND s.release_date IS NOT NULL GROUP BY 1,2,3,4,5
), series AS (
 SELECT k.*,k.release_date-1 AS day,ARRAY[]::numeric[] counts,0::numeric streams_day,false estimated FROM keys k
 UNION ALL
 SELECT a.company_id,a.artist_id,a.song_id,a.playlist_key,a.release_date,a.first_real,a.last_day,a.day+1,
 a.counts || ARRAY[v.val],v.val,(r.snapshot_date IS NULL AND (a.first_real IS NULL OR a.day+1<a.first_real))
 FROM series a
 LEFT JOIN public.artist_song_playlist_streams r ON r.company_id=a.company_id AND r.artist_id=a.artist_id AND r.song_id=a.song_id AND r.playlist_key=a.playlist_key AND r.snapshot_date=a.day+1 AND r.period_days=1 AND r.source='s4a_api'
 LEFT JOIN public.artist_song_playlist_streams w ON w.company_id=a.company_id AND w.artist_id=a.artist_id AND w.song_id=a.song_id AND w.playlist_key=a.playlist_key AND w.snapshot_date=a.day+1 AND w.period_days=28 AND w.source='s4a_api'
 LEFT JOIN public.artist_song_playlist_streams prev ON prev.company_id=a.company_id AND prev.artist_id=a.artist_id AND prev.song_id=a.song_id AND prev.playlist_key=a.playlist_key AND prev.snapshot_date=a.day AND prev.period_days=28 AND prev.source='s4a_api'
 CROSS JOIN LATERAL (SELECT CASE WHEN r.snapshot_date IS NOT NULL THEN r.streams::numeric WHEN a.first_real IS NOT NULL AND a.day+1>=a.first_real THEN NULL
 WHEN w.streams IS NULL OR (a.day>=a.release_date AND prev.streams IS NULL) THEN NULL
 ELSE w.streams-coalesce(prev.streams,0)+CASE WHEN a.day+1-28<a.release_date THEN 0 ELSE a.counts[(a.day+1-28)-a.release_date+1] END END raw) x
 CROSS JOIN LATERAL (SELECT CASE WHEN x.raw>=0 THEN x.raw END val) v WHERE a.day<a.last_day
)
SELECT a.company_id,a.artist_id,a.song_id,a.playlist_key,a.day,a.streams_day,a.estimated,a.first_real,p.playlist_name,p.playlist_uri,p.made_by,
 coalesce(p.playlist_kind,CASE WHEN p.made_by='user' THEN 'listener' WHEN p.made_by='spotify' AND (p.playlist_uri='spotify:playlist:radio' OR lower(trim(p.playlist_name)) IN('radio','mixes','descobertas da semana','radar de novidades') OR lower(trim(p.playlist_name)) ~ '^daily mix( [0-9]+)?$') THEN 'algorithmic' END) playlist_kind,
 CASE WHEN p.made_by='spotify' AND (p.playlist_uri='spotify:playlist:radio' OR lower(trim(p.playlist_name))='radio') THEN 'radio' ELSE 'other' END category
FROM series a JOIN LATERAL (SELECT q.* FROM public.artist_song_playlist_streams q WHERE q.company_id=a.company_id AND q.artist_id=a.artist_id AND q.song_id=a.song_id AND q.playlist_key=a.playlist_key AND q.source='s4a_api' AND q.snapshot_date<=a.day ORDER BY q.snapshot_date DESC,q.period_days ASC LIMIT 1) p ON true WHERE a.day>=a.release_date;
REVOKE ALL ON public.artist_song_playlist_daily FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.artist_song_playlist_daily TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.artist_song_play_origins_compare(p_artist_id uuid,p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_company uuid; v_result jsonb;
BEGIN
 v_company:=public.artist_access_check(p_artist_id,'read','songs');
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>61 THEN RAISE EXCEPTION 'periodo_invalido'; END IF;
 WITH songs AS (SELECT id,title,release_date FROM public.artist_songs WHERE artist_id=p_artist_id AND company_id=v_company AND tracking_status='ativo'),
 dates AS (SELECT s.*,(SELECT max(m.metric_date) FROM public.artist_song_metrics_daily m WHERE m.song_id=s.id AND m.artist_id=p_artist_id AND m.company_id=v_company AND m.metric='s4a_streams_day' AND m.source='s4a_api') s4a_until FROM songs s),
 days AS (SELECT s.*,d::date AS metric_day FROM dates s CROSS JOIN LATERAL generate_series(greatest(p_from,p_to-13)::timestamp,p_to::timestamp,interval '1 day') d),
 metrics AS (SELECT m.song_id,m.metric_date,m.metric,m.value,row_number() OVER(PARTITION BY m.song_id,m.metric_date,m.metric ORDER BY m.captured_at DESC,m.id DESC) rn FROM public.artist_song_metrics_daily m JOIN songs s ON s.id=m.song_id WHERE m.company_id=v_company AND m.artist_id=p_artist_id AND m.platform='spotify' AND m.source='s4a_api' AND m.metric_date BETWEEN greatest(p_from,p_to-13) AND p_to AND (m.metric='s4a_streams_day' OR m.metric LIKE 's4a_source_%_day')),
 pl AS (SELECT p.song_id,p.day snapshot_date,count(*) n,count(p.streams_day) known,count(p.playlist_kind) classified,bool_or(p.estimated) estimated,
 CASE WHEN count(*) FILTER(WHERE p.category='radio')=count(p.streams_day) FILTER(WHERE p.category='radio') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.category='radio'),0) END radio,
 CASE WHEN count(*) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio')=count(p.streams_day) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio'),0) END other_algorithmic,
 CASE WHEN count(*) FILTER(WHERE p.playlist_kind='editorial')=count(p.streams_day) FILTER(WHERE p.playlist_kind='editorial') AND count(*) FILTER(WHERE p.playlist_kind IS NULL)=0 THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='editorial'),0) END editorial,
 CASE WHEN count(*) FILTER(WHERE p.playlist_kind='algotorial')=count(p.streams_day) FILTER(WHERE p.playlist_kind='algotorial') AND count(*) FILTER(WHERE p.playlist_kind IS NULL)=0 THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='algotorial'),0) END algotorial,
 CASE WHEN count(*) FILTER(WHERE p.playlist_kind='listener')=count(p.streams_day) FILTER(WHERE p.playlist_kind='listener') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.playlist_kind='listener'),0) END listeners,
 CASE WHEN count(*) FILTER(WHERE p.made_by='spotify' AND p.category<>'radio')=count(p.streams_day) FILTER(WHERE p.made_by='spotify' AND p.category<>'radio') THEN coalesce(sum(p.streams_day) FILTER(WHERE p.made_by='spotify' AND p.category<>'radio'),0) END other_spotify,
 jsonb_build_object('radio',bool_or(p.estimated) FILTER(WHERE p.category='radio'),'other_algorithmic',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='algorithmic' AND p.category<>'radio'),'editorial',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='editorial'),'algotorial',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='algotorial'),'listener_playlists',bool_or(p.estimated) FILTER(WHERE p.playlist_kind='listener')) estimates
 FROM public.artist_song_playlist_daily p JOIN songs s ON s.id=p.song_id WHERE p.company_id=v_company AND p.artist_id=p_artist_id AND p.day BETWEEN greatest(p_from,p_to-13) AND p_to GROUP BY 1,2),
 sounds AS (SELECT a.song_id,a.metric_date,sum(a.video_count) total,count(*) n,count(a.video_count) known,array_agg(a.music_id ORDER BY a.music_id) ids,array_agg(a.source ORDER BY a.music_id) sources FROM public.artist_song_tiktok_sound_daily a JOIN songs s ON s.id=a.song_id WHERE a.company_id=v_company AND a.metric_date BETWEEN greatest(p_from,p_to-13)-1 AND p_to GROUP BY 1,2),
 result_rows AS (SELECT d.id song_id,d.title,d.metric_day AS day,d.s4a_until,CASE WHEN d.metric_day<=d.s4a_until THEN m.value END spotify_total,
 p.radio,p.other_spotify,p.other_algorithmic,p.editorial,p.algotorial,p.listeners listener_playlists,p.estimated,coalesce(p.estimates,'{}'::jsonb) estimated_fields,
 CASE WHEN p.n=p.known AND m.value>=p.radio+p.other_spotify+p.listeners THEN m.value-p.radio-p.other_spotify-p.listeners END rest,
 CASE WHEN m.value>0 THEN round(p.radio/m.value*100,4) END radio_pct,
 (SELECT coalesce(jsonb_object_agg(x.metric,x.value),'{}'::jsonb) FROM metrics x WHERE x.song_id=d.id AND x.metric_date=d.metric_day AND x.rn=1 AND x.metric LIKE 's4a_source_%_day') source_categories,
 CASE WHEN p.n IS NULL THEN 'unavailable' WHEN p.n<>p.known THEN 'incomplete_missing_seed_or_snapshot' WHEN p.estimated THEN 's4a_top100_estimated_28day' ELSE 's4a_top100_1day' END playlist_coverage,
 CASE WHEN a.n=a.known THEN a.total END ugc_total,a.n sound_count,CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total-prev.total END ugc_new,
 CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total<prev.total ELSE false END ugc_drop,
 CASE WHEN a.ids IS NOT NULL AND prev.ids IS NOT NULL THEN a.ids=prev.ids END same_sounds,CASE WHEN a.ids=prev.ids THEN a.sources=prev.sources END same_sources
 FROM days d LEFT JOIN metrics m ON m.song_id=d.id AND m.metric_date=d.metric_day AND m.metric='s4a_streams_day' AND m.rn=1 LEFT JOIN pl p ON p.song_id=d.id AND p.snapshot_date=d.metric_day LEFT JOIN sounds a ON a.song_id=d.id AND a.metric_date=d.metric_day LEFT JOIN sounds prev ON prev.song_id=d.id AND prev.metric_date=d.metric_day-1)
 SELECT jsonb_build_object('available',true,'source_origin_capture_enabled',false,'scope','global_song_not_ad_country','playlist_note','Top 100 observado; resto inclui playlists não listadas e outras origens. Não é a divisão completa por origem.','estimated',coalesce(bool_or(estimated),false),'days',coalesce(jsonb_agg(to_jsonb(result_rows) ORDER BY day,song_id),'[]'::jsonb)) INTO v_result FROM result_rows;
 RETURN v_result;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.artist_song_play_origins_compare(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.artist_song_play_origins_compare(uuid,date,date) TO authenticated,service_role;