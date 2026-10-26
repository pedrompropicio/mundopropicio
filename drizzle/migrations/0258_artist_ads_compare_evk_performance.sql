-- Performance-only: preaggregate raw arrivals before canonical classification.
DO $migration$
DECLARE f text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.artist_ads_compare(uuid,date,date,text,text)'::regprocedure) <> '9286b01c759608be38a4f41a939c1321' THEN
    RAISE EXCEPTION 'artist_ads_compare_body_changed';
  END IF;
  SELECT pg_get_functiondef('public.artist_ads_compare(uuid,date,date,text,text)'::regprocedure) INTO f;
  IF position($old$  evk AS MATERIALIZED (
    SELECT CASE public.song_link_event_canal(l.canal, e.utm_source, e.utm_medium, e.utm_campaign)
             WHEN 'meta_ads' THEN 'meta' WHEN 'tiktok_ads' THEN 'tiktok' WHEN 'google_ads' THEN 'google' END platform,
      public.artist_ads_campaign_key(e.utm_campaign) k,
      NULLIF(btrim(coalesce(e.utm_term,'')),'') ad_id,
      date_trunc('hour', e.created_at AT TIME ZONE p_tz) ts, e.country, count(*) n
    FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id = e.link_id
    WHERE e.artist_id = p_artist_id AND e.event = 'arrival'
      AND e.created_at >= (least(v_from_ts, (v_today-1)::timestamp) AT TIME ZONE p_tz)
      AND e.created_at <  (greatest(v_to_ts, (v_today+1)::timestamp) AT TIME ZONE p_tz)
    GROUP BY 1,2,3,4,5
  ),
$old$ IN f) = 0 THEN
    RAISE EXCEPTION 'artist_ads_compare_evk_not_found';
  END IF;
  EXECUTE replace(f, $old$  evk AS MATERIALIZED (
    SELECT CASE public.song_link_event_canal(l.canal, e.utm_source, e.utm_medium, e.utm_campaign)
             WHEN 'meta_ads' THEN 'meta' WHEN 'tiktok_ads' THEN 'tiktok' WHEN 'google_ads' THEN 'google' END platform,
      public.artist_ads_campaign_key(e.utm_campaign) k,
      NULLIF(btrim(coalesce(e.utm_term,'')),'') ad_id,
      date_trunc('hour', e.created_at AT TIME ZONE p_tz) ts, e.country, count(*) n
    FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id = e.link_id
    WHERE e.artist_id = p_artist_id AND e.event = 'arrival'
      AND e.created_at >= (least(v_from_ts, (v_today-1)::timestamp) AT TIME ZONE p_tz)
      AND e.created_at <  (greatest(v_to_ts, (v_today+1)::timestamp) AT TIME ZONE p_tz)
    GROUP BY 1,2,3,4,5
  ),
$old$, $new$  evk AS MATERIALIZED (
    SELECT CASE public.song_link_event_canal(g.canal, g.utm_source, g.utm_medium, g.utm_campaign)
             WHEN 'meta_ads' THEN 'meta' WHEN 'tiktok_ads' THEN 'tiktok' WHEN 'google_ads' THEN 'google' END platform,
      public.artist_ads_campaign_key(g.utm_campaign) k,
      NULLIF(btrim(coalesce(g.utm_term,'')),'') ad_id,
      g.ts, g.country, sum(g.n) n
    FROM (
      SELECT l.canal, e.utm_source, e.utm_medium, e.utm_campaign, e.utm_term, e.country,
        date_trunc('hour', e.created_at AT TIME ZONE p_tz) ts, count(*) n
      FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id = e.link_id
      WHERE e.artist_id = p_artist_id AND e.event = 'arrival'
        AND e.created_at >= (least(v_from_ts, (v_today-1)::timestamp) AT TIME ZONE p_tz)
        AND e.created_at <  (greatest(v_to_ts, (v_today+1)::timestamp) AT TIME ZONE p_tz)
      GROUP BY 1,2,3,4,5,6,7) g
    GROUP BY 1,2,3,4,5
  ),
$new$);
END
$migration$;
