CREATE OR REPLACE FUNCTION public.artist_song_play_origins_compare(p_artist_id uuid,p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_company uuid; v_result jsonb;
BEGIN
 v_company:=public.artist_access_check(p_artist_id,'read','songs');
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>61 THEN RAISE EXCEPTION 'periodo_invalido'; END IF;
 WITH songs AS (SELECT id,title,release_date FROM public.artist_songs WHERE artist_id=p_artist_id AND company_id=v_company AND tracking_status='ativo'),
 dates AS (SELECT s.*,(SELECT max(m.metric_date) FROM public.artist_song_metrics_daily m WHERE m.song_id=s.id AND m.artist_id=p_artist_id AND m.company_id=v_company AND m.metric='s4a_streams_day' AND m.source='s4a_api') s4a_until FROM songs s),
 days AS (SELECT s.*,d::date AS metric_day FROM dates s CROSS JOIN LATERAL generate_series(greatest(p_from,p_to-13)::timestamp,p_to::timestamp,interval '1 day') d),
 metrics AS (SELECT m.song_id,m.metric_date,m.metric,m.value,row_number() OVER(PARTITION BY m.song_id,m.metric_date,m.metric ORDER BY m.captured_at DESC,m.id DESC) rn FROM public.artist_song_metrics_daily m JOIN songs s ON s.id=m.song_id WHERE m.company_id=v_company AND m.artist_id=p_artist_id AND m.platform='spotify' AND m.source='s4a_api' AND m.metric_date BETWEEN greatest(p_from,p_to-13) AND p_to AND (m.metric='s4a_streams_day' OR m.metric LIKE 's4a_source_%_day')),
 pl AS (SELECT p.song_id,p.snapshot_date,count(*) n,count(p.streams) known,
 coalesce(sum(p.streams) FILTER(WHERE p.made_by='spotify' AND (p.playlist_uri='spotify:playlist:radio' OR lower(trim(p.playlist_name))='radio')),0) radio,
 coalesce(sum(p.streams) FILTER(WHERE p.made_by='spotify' AND NOT(coalesce(p.playlist_uri,'')='spotify:playlist:radio' OR lower(trim(p.playlist_name))='radio')),0) other_spotify,
 coalesce(sum(p.streams) FILTER(WHERE p.made_by='user'),0) listeners
 FROM public.artist_song_playlist_streams p JOIN songs s ON s.id=p.song_id WHERE p.company_id=v_company AND p.artist_id=p_artist_id AND p.source='s4a_api' AND p.period_days=1 AND p.snapshot_date BETWEEN greatest(p_from,p_to-13) AND p_to GROUP BY 1,2),
 sounds AS (SELECT a.song_id,a.metric_date,sum(a.video_count) total,count(*) n,count(a.video_count) known,array_agg(a.music_id ORDER BY a.music_id) ids,array_agg(a.source ORDER BY a.music_id) sources FROM public.artist_song_tiktok_sound_daily a JOIN songs s ON s.id=a.song_id WHERE a.company_id=v_company AND a.metric_date BETWEEN greatest(p_from,p_to-13)-1 AND p_to GROUP BY 1,2),
 result_rows AS (SELECT d.id song_id,d.title,d.metric_day AS day,d.s4a_until,CASE WHEN d.metric_day<=d.s4a_until THEN m.value END spotify_total,
 CASE WHEN p.n=p.known THEN p.radio END radio,CASE WHEN p.n=p.known THEN p.other_spotify END other_spotify,CASE WHEN p.n=p.known THEN p.listeners END listener_playlists,
 CASE WHEN p.n=p.known AND m.value>=p.radio+p.other_spotify+p.listeners THEN m.value-p.radio-p.other_spotify-p.listeners END rest,
 CASE WHEN m.value>0 AND p.n=p.known THEN round(p.radio/m.value*100,4) END radio_pct,
 (SELECT coalesce(jsonb_object_agg(x.metric,x.value),'{}'::jsonb) FROM metrics x WHERE x.song_id=d.id AND x.metric_date=d.metric_day AND x.rn=1 AND x.metric LIKE 's4a_source_%_day') source_categories,
 CASE WHEN p.n IS NOT NULL THEN 's4a_top100_1day' ELSE 'unavailable' END playlist_coverage,
 CASE WHEN a.n=a.known THEN a.total END ugc_total,a.n sound_count,CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total-prev.total END ugc_new,
 CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total<prev.total ELSE false END ugc_drop,
 CASE WHEN a.ids IS NOT NULL AND prev.ids IS NOT NULL THEN a.ids=prev.ids END same_sounds,CASE WHEN a.ids=prev.ids THEN a.sources=prev.sources END same_sources
 FROM days d LEFT JOIN metrics m ON m.song_id=d.id AND m.metric_date=d.metric_day AND m.metric='s4a_streams_day' AND m.rn=1 LEFT JOIN pl p ON p.song_id=d.id AND p.snapshot_date=d.metric_day LEFT JOIN sounds a ON a.song_id=d.id AND a.metric_date=d.metric_day LEFT JOIN sounds prev ON prev.song_id=d.id AND prev.metric_date=d.metric_day-1)
 SELECT jsonb_build_object('available',true,'source_origin_capture_enabled',false,'scope','global_song_not_ad_country','playlist_note','Top 100 observado; resto inclui playlists não listadas e outras origens. Não é a divisão completa por origem.','estimated',false,'days',coalesce(jsonb_agg(to_jsonb(result_rows) ORDER BY day,song_id),'[]'::jsonb)) INTO v_result FROM result_rows;
 RETURN v_result;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.artist_song_play_origins_compare(uuid,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.artist_song_play_origins_compare(uuid,date,date) TO authenticated,service_role;
DO $patch$
DECLARE d text:=pg_get_functiondef('public.artist_ads_compare(uuid,date,date,text,text)'::regprocedure);
 a text:=$a$'lacunas', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM lac)$a$;
 b text:=$b$'trafego_diario', (SELECT coalesce(jsonb_agg(jsonb_build_object('day',metric_day,'platform',platform,'currency',cur,'gasto',round(g,2),'chegadas',n,'custo_por_chegada',CASE WHEN n>0 AND g IS NOT NULL THEN round(g/n,4) END) ORDER BY metric_day,platform,cur),'[]'::jsonb) FROM (SELECT ts::date AS metric_day,platform,cur,sum(g) g,sum(n) n FROM sho GROUP BY 1,2,3) t),
 'lacunas', (SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM lac)$b$;
 ret text:=$r$  RETURN r;$r$;
 replacement text:=$r$  BEGIN
    r := r || jsonb_build_object('musica_daily',public.artist_song_play_origins_compare(p_artist_id,p_from,p_to));
  EXCEPTION WHEN insufficient_privilege THEN
    r := r || jsonb_build_object('musica_daily',jsonb_build_object('available',false,'reason','songs_access_required'));
  END;
  RETURN r;$r$;
BEGIN
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 OR (length(d)-length(replace(d,ret,'')))/length(ret)<>1 THEN RAISE EXCEPTION 's4a_compare_contract_drift'; END IF;
 EXECUTE replace(replace(d,a,b),ret,replacement);
END $patch$;