DO $patch$
DECLARE d text:=pg_get_functiondef('public.artist_song_play_origins_compare(uuid,date,date)'::regprocedure);
 a text:=$a$ result_rows AS ($a$; b text:=$b$ ios_raw AS (SELECT m.song_id,m.metric_date,m.value,row_number() OVER(PARTITION BY m.song_id,m.metric_date ORDER BY m.captured_at DESC,m.id DESC) rn FROM public.artist_song_metrics_daily m JOIN songs s ON s.id=m.song_id WHERE m.company_id=v_company AND m.artist_id=p_artist_id AND m.platform='tiktok' AND m.metric='ugc_videos' AND m.source='ios_shortcut' AND m.value>=0 AND m.metric_date<=p_to),
 ios AS (SELECT song_id,metric_date,value,lag(value) OVER(PARTITION BY song_id ORDER BY metric_date) previous_value,lag(metric_date) OVER(PARTITION BY song_id ORDER BY metric_date) previous_day FROM ios_raw WHERE rn=1),
 result_rows AS ($b$;
 c text:=$c$CASE WHEN a.n=a.known THEN a.total END ugc_total,a.n sound_count,CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total-prev.total END ugc_new,
 CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total<prev.total ELSE false END ugc_drop,$c$; v text:=$v$i.value ugc_total,i.value-i.previous_value ugc_new,i.metric_date-i.previous_day ugc_days_covered,i.previous_day ugc_previous_capture_day,
 'ios_shortcut'::text ugc_source,'centena'::text ugc_precision,(i.metric_date IS NULL) ugc_capture_missing,coalesce(i.value<i.previous_value,false) ugc_drop,
 CASE WHEN a.n=a.known THEN a.total END apify_total,a.n sound_count,CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total-prev.total END apify_new,
 CASE WHEN a.n=a.known AND prev.n=prev.known THEN a.total<prev.total ELSE false END apify_drop,$v$;
 e text:=$e$ FROM days d LEFT JOIN metrics m$e$; f text:=$f$ FROM days d LEFT JOIN ios i ON i.song_id=d.id AND i.metric_date=d.metric_day LEFT JOIN metrics m$f$;
BEGIN
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 OR (length(d)-length(replace(d,c,'')))/length(c)<>1 OR (length(d)-length(replace(d,e,'')))/length(e)<>1 THEN RAISE EXCEPTION 'ugc_ios_compare_contract_drift'; END IF;
 EXECUTE replace(replace(replace(d,a,b),c,v),e,f);
END $patch$;