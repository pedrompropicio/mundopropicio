SET LOCAL lock_timeout = '5s';
DO $patch$
DECLARE
  d text := pg_get_functiondef('public.artist_ads_compare(uuid,date,date,text,text)'::regprocedure);
  a1 text := $a$      SELECT l.canal, e.utm_source, e.utm_medium, e.utm_campaign, e.country,
        CASE lower(coalesce(e.os,'')) WHEN 'android' THEN 'android' WHEN 'ios' THEN 'ios' ELSE 'outro' END osn,
        date_trunc('hour', e.created_at AT TIME ZONE p_tz) ts, count(*) n
      FROM public.song_link_events e LEFT JOIN public.song_links l ON l.id = e.link_id$a$;
  b1 text := $b$      -- hora truncada em UTC e só depois convertida para p_tz (exato para fusos de hora inteira)
      SELECT l.canal, x.utm_source, x.utm_medium, x.utm_campaign, x.country,
        CASE lower(coalesce(x.os,'')) WHEN 'android' THEN 'android' WHEN 'ios' THEN 'ios' ELSE 'outro' END osn,
        date_trunc('hour', x.hu AT TIME ZONE p_tz) ts, sum(x.n) n
      FROM (SELECT e.link_id, e.utm_source, e.utm_medium, e.utm_campaign, e.country, e.os,
                   date_trunc('hour', e.created_at) hu, count(*) n
      FROM public.song_link_events e$b$;
  a2 text := $a$        AND e.created_at <  (greatest(v_to_ts, (v_today+1)::timestamp) AT TIME ZONE p_tz)
      GROUP BY 1,2,3,4,5,6,7) g$a$;
  b2 text := $b$        AND e.created_at <  (greatest(v_to_ts, (v_today+1)::timestamp) AT TIME ZONE p_tz)
      GROUP BY 1,2,3,4,5,6,7) x LEFT JOIN public.song_links l ON l.id = x.link_id
      GROUP BY 1,2,3,4,5,6,7) g$b$;
BEGIN
  IF (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 THEN RAISE EXCEPTION 'guard: âncora 1'; END IF;
  IF (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 THEN RAISE EXCEPTION 'guard: âncora 2'; END IF;
  EXECUTE replace(replace(d, a1, b1), a2, b2);
END
$patch$;
ALTER FUNCTION public.artist_ads_compare(uuid, date, date, text, text) SET work_mem = '32MB';
ALTER FUNCTION public.artist_ads_compare(uuid, date, date, text, text) SET enable_sort = off;