DO $patch$
DECLARE d text:=pg_get_functiondef('public.artist_song_play_origins_compare(uuid,date,date)'::regprocedure);
 a text:=$a$sounds AS (SELECT a.song_id,a.metric_date,sum(a.video_count) total,count(*) n,count(a.video_count) known,array_agg(a.music_id ORDER BY a.music_id) ids,array_agg(a.source ORDER BY a.music_id) sources FROM public.artist_song_tiktok_sound_daily a JOIN songs s ON s.id=a.song_id WHERE a.company_id=v_company AND a.artist_id=p_artist_id$a$;
 b text:=$b$sounds AS (SELECT a.song_id,a.metric_date,sum(a.video_count) total,count(*) n,count(a.video_count) known,array_agg(a.music_id ORDER BY a.music_id) ids,array_agg(a.source ORDER BY a.music_id) sources FROM public.artist_song_tiktok_sound_daily a JOIN songs s ON s.id=a.song_id WHERE a.company_id=v_company$b$;
BEGIN
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'sounds_scope_contract_drift'; END IF;
 EXECUTE replace(d,a,b);
END $patch$;