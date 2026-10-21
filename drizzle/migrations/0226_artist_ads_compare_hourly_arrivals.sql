SET LOCAL lock_timeout = '5s';
DO $patch$
DECLARE d text:=pg_get_functiondef('public.artist_ads_compare(uuid,date,date,text,text)'::regprocedure);
a text:=$old$  ev AS MATERIALIZED (
    -- agrega antes de classificar o canal (a função por linha custava ~3 s em 30 dias)
    SELECT CASE public.song_link_event_canal(g.canal, g.utm_source, g.utm_medium, g.utm_campaign)
             WHEN 'meta_ads' THEN 'meta' WHEN 'tiktok_ads' THEN 'tiktok' WHEN 'google_ads' THEN 'google' END platform,
      g.country, g.osn, g.ts, sum(g.n) n
    FROM (
      -- hora truncada em UTC e só depois convertida para p_tz (exato para fusos de hora inteira)
      SELECT l.canal, x.utm_source, x.utm_medium, x.utm_campaign, x.country,
        CASE lower(coalesce(x.os,'')) WHEN 'android' THEN 'android' WHEN 'ios' THEN 'ios' ELSE 'outro' END osn,
        date_trunc('hour', x.hu AT TIME ZONE p_tz) ts, sum(x.n) n
      FROM (SELECT e.link_id, e.utm_source, e.utm_medium, e.utm_campaign, e.country, e.os,
                   date_trunc('hour', e.created_at) hu, count(*) n
      FROM public.song_link_events e
      WHERE e.artist_id = p_artist_id AND e.event = 'arrival'
        AND e.created_at >= (least(v_from_ts, (v_today-1)::timestamp) AT TIME ZONE p_tz)
        AND e.created_at <  (greatest(v_to_ts, (v_today+1)::timestamp) AT TIME ZONE p_tz)
      GROUP BY 1,2,3,4,5,6,7) x LEFT JOIN public.song_links l ON l.id = x.link_id
      GROUP BY 1,2,3,4,5,6,7) g
    GROUP BY 1,2,3,4
  ),
$old$;
b text:=$new$  ev AS MATERIALIZED (
    -- Canonical UTC hourly counts; exact for whole-hour timezones, not distinct visitors.
    SELECT CASE e.canal WHEN 'meta_ads' THEN 'meta' WHEN 'tiktok_ads' THEN 'tiktok' WHEN 'google_ads' THEN 'google' END platform,
      nullif(e.country,'?') country, e.os osn,
      date_trunc('hour',e.hour_utc AT TIME ZONE p_tz) ts, sum(e.n) n
    FROM public.song_link_arrivals_hourly e
    WHERE e.artist_id=p_artist_id AND e.company_id=v_company AND e.canal<>'teste'
      AND e.hour_utc >= (least(v_from_ts,(v_today-1)::timestamp) AT TIME ZONE p_tz)
      AND e.hour_utc < (greatest(v_to_ts,(v_today+1)::timestamp) AT TIME ZONE p_tz)
    GROUP BY 1,2,3,4
  ),
$new$;
BEGIN
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'compare arrivals anchor drift'; END IF;
 EXECUTE replace(d,a,b);
END $patch$;
COMMENT ON FUNCTION public.artist_ads_compare(uuid,date,date,text,text) IS 'Arrivals from canonical hourly UTC aggregate, excluding teste. UTC hour conversion is exact for whole-hour timezones. Raw arrivals, not distinct ip_hash visitors. Other JSON and authorization unchanged.';