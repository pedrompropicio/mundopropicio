CREATE TABLE public.song_link_health_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL,
  link_id uuid NOT NULL REFERENCES public.song_links(id) ON DELETE CASCADE,
  slug text, song_id uuid, company_id uuid NOT NULL,
  utm_source text, utm_campaign text, os text,
  in_app_browser text NOT NULL DEFAULT '-',
  arrivals int NOT NULL DEFAULT 0, tap_screen_arrivals int NOT NULL DEFAULT 0,
  choices int NOT NULL DEFAULT 0, choices_instagram int NOT NULL DEFAULT 0,
  redirect_app int NOT NULL DEFAULT 0, redirect_web int NOT NULL DEFAULT 0,
  choice_rate numeric, flags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_song_link_health_daily UNIQUE NULLS NOT DISTINCT (day, link_id, utm_source, utm_campaign, os, in_app_browser)
);
CREATE INDEX idx_slhd_link_day ON public.song_link_health_daily(link_id, day DESC);
GRANT SELECT ON public.song_link_health_daily TO authenticated;
GRANT ALL ON public.song_link_health_daily TO service_role;
ALTER TABLE public.song_link_health_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY song_link_health_daily_select ON public.song_link_health_daily FOR SELECT TO authenticated
  USING (public.user_has_company_access(company_id));

CREATE OR REPLACE FUNCTION public.song_link_health_run(p_day date DEFAULT ((now() AT TIME ZONE 'utc')::date - 1))
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows int; v_flags int; v_t0 timestamptz := clock_timestamp(); v_run uuid;
BEGIN
  INSERT INTO sync_runs(function_name, trigger_source, dry_run, status)
  VALUES ('song-link-health', 'cron', false, 'running') RETURNING id INTO v_run;

  DELETE FROM song_link_health_daily WHERE day = p_day;

  WITH ev AS (
    SELECT e.*, coalesce(e.in_app_browser,'-') AS iab,
           (e.created_at AT TIME ZONE 'utc')::date AS d
    FROM song_link_events e
    WHERE e.created_at >= (p_day - 7)::timestamp AT TIME ZONE 'utc'
      AND e.created_at <  (p_day + 1)::timestamp AT TIME ZONE 'utc'
  ), agg AS (
    SELECT d, link_id, utm_source, utm_campaign, os, iab,
      count(*) FILTER (WHERE event='arrival') AS arrivals,
      count(*) FILTER (WHERE event='arrival' AND opened IS NULL AND mode='redirect') AS tap,
      count(*) FILTER (WHERE event='choice' AND coalesce(lower(destination),'') <> 'instagram') AS choices,
      count(*) FILTER (WHERE event='choice' AND lower(destination)='instagram') AS ch_ig,
      count(*) FILTER (WHERE opened='app') AS r_app,
      count(*) FILTER (WHERE opened='web') AS r_web
    FROM ev GROUP BY 1,2,3,4,5,6
  ), hist AS (
    SELECT link_id, utm_source, utm_campaign, os, iab, sum(arrivals)/7.0 AS avg7
    FROM agg WHERE d < p_day GROUP BY 1,2,3,4,5
  ), today AS (
    SELECT a.*, h.avg7, CASE WHEN a.tap > 0 THEN round(a.choices::numeric / a.tap, 4) END AS rate
    FROM agg a LEFT JOIN hist h USING (link_id, utm_source, utm_campaign, os, iab)
    WHERE a.d = p_day
  ), link_hist AS (
    SELECT link_id, sum(arrivals)/7.0 AS avg7 FROM agg WHERE d < p_day GROUP BY 1
  ), ins1 AS (
    INSERT INTO song_link_health_daily(day, link_id, slug, song_id, company_id, utm_source, utm_campaign, os, in_app_browser,
      arrivals, tap_screen_arrivals, choices, choices_instagram, redirect_app, redirect_web, choice_rate, flags)
    SELECT p_day, t.link_id, l.slug, l.song_id, l.company_id, t.utm_source, t.utm_campaign, t.os, t.iab,
      t.arrivals, t.tap, t.choices, t.ch_ig, t.r_app, t.r_web, t.rate,
      array_remove(ARRAY[
        CASE WHEN t.tap >= 20 AND t.rate < 0.20 THEN 'taxa_toque_baixa' END,
        CASE WHEN t.os = 'ios' AND t.r_web >= 5 THEN 'ios_spotify_web' END,
        CASE WHEN t.avg7 >= 50 AND t.arrivals < 0.5 * t.avg7 THEN 'queda_chegadas' END
      ], NULL)
    FROM today t JOIN song_links l ON l.id = t.link_id
    RETURNING 1
  )
  INSERT INTO song_link_health_daily(day, link_id, slug, song_id, company_id, utm_source, flags)
  SELECT p_day, l.id, l.slug, l.song_id, l.company_id, '(nenhum)', ARRAY['sem_eventos_link']
  FROM song_links l JOIN link_hist h ON h.link_id = l.id
  WHERE l.active AND h.avg7 >= 50
    AND NOT EXISTS (SELECT 1 FROM today t WHERE t.link_id = l.id AND t.arrivals > 0)
    AND (SELECT count(*) FROM ins1) >= 0;

  -- chaves que desapareceram (média >= 50, zero hoje) também contam como queda
  INSERT INTO song_link_health_daily(day, link_id, slug, song_id, company_id, utm_source, utm_campaign, os, in_app_browser, flags)
  SELECT p_day, x.link_id, l.slug, l.song_id, l.company_id, x.utm_source, x.utm_campaign, x.os, x.iab, ARRAY['queda_chegadas']
  FROM (
    SELECT e.link_id, e.utm_source, e.utm_campaign, e.os, coalesce(e.in_app_browser,'-') iab, count(*)/7.0 avg7
    FROM song_link_events e
    WHERE e.event='arrival'
      AND e.created_at >= (p_day - 7)::timestamp AT TIME ZONE 'utc'
      AND e.created_at <  p_day::timestamp AT TIME ZONE 'utc'
    GROUP BY 1,2,3,4,5
  ) x JOIN song_links l ON l.id = x.link_id
  WHERE x.avg7 >= 50
  ON CONFLICT (day, link_id, utm_source, utm_campaign, os, in_app_browser) DO NOTHING;

  SELECT count(*), coalesce(sum(cardinality(flags)),0) INTO v_rows, v_flags FROM song_link_health_daily WHERE day = p_day;

  UPDATE sync_runs SET status = CASE WHEN v_rows > 0 THEN 'success' ELSE 'no_data' END,
    rows_written = v_rows, finished_at = now(),
    duration_ms = (extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int,
    details = jsonb_build_object('day', p_day, 'linhas', v_rows, 'flags', v_flags)
  WHERE id = v_run;
  RETURN jsonb_build_object('day', p_day, 'linhas', v_rows, 'flags', v_flags);
END $$;
REVOKE ALL ON FUNCTION public.song_link_health_run(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.song_link_health_run(date) TO service_role;

CREATE OR REPLACE FUNCTION public.song_link_health_get(p_link_id uuid DEFAULT NULL, p_days int DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from date := (now() AT TIME ZONE 'utc')::date - greatest(coalesce(p_days,14),1);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sem sessão'; END IF;
  RETURN jsonb_build_object(
    'linhas', coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.day DESC, h.arrivals DESC)
       FROM song_link_health_daily h
       WHERE h.day >= v_from AND (p_link_id IS NULL OR h.link_id = p_link_id)
         AND user_has_company_access(h.company_id)), '[]'::jsonb),
    'streams', coalesce((SELECT jsonb_agg(jsonb_build_object('song_id', m.song_id, 'date', m.metric_date, 'metric', m.metric, 'value', m.value) ORDER BY m.metric_date)
       FROM artist_song_metrics_daily m
       WHERE m.metric IN ('s4a_streams_day_br','s4a_streams_day_pt') AND m.metric_date >= v_from
         AND user_has_company_access(m.company_id)
         AND m.song_id IN (SELECT l.song_id FROM song_links l WHERE (p_link_id IS NULL OR l.id = p_link_id) AND user_has_company_access(l.company_id))), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.song_link_health_get(uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.song_link_health_get(uuid,int) TO authenticated, service_role;