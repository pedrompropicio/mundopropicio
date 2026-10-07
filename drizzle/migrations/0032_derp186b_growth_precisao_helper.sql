CREATE OR REPLACE FUNCTION public.artist_growth_summary_rows()
 RETURNS TABLE(company_id uuid, artist_id uuid, artist_name text, platform text, metric text, latest_date date, latest_value numeric, d7_base_date date, d7_delta numeric, d7_pct numeric, d30_base_date date, d30_delta numeric, d30_pct numeric, d90_base_date date, d90_delta numeric, d90_pct numeric, accel_pct numeric, best_date date, best_value numeric, worst_date date, worst_value numeric, precisao numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH comp AS (SELECT c.id FROM public.companies c WHERE public.user_has_company_access(c.id)),
latest AS (
  SELECT DISTINCT ON (m.artist_id, m.platform, m.metric) m.company_id, m.artist_id, m.platform, m.metric,
    m.metric_date AS latest_date, m.value AS latest_value, m.source_ref AS latest_source_ref
  FROM public.artist_metrics_daily m JOIN comp ON comp.id = m.company_id
  ORDER BY m.artist_id, m.platform, m.metric, m.metric_date DESC,
    (CASE m.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END)
), pts AS (
  SELECT l.company_id, l.artist_id, l.platform, l.metric, l.latest_date, l.latest_value, l.latest_source_ref, a.name AS artist_name,
    p7.value AS v7, p7.metric_date AS d7_date, p30.value AS v30, p30.metric_date AS d30_date,
    p60.value AS v60, p60.metric_date AS d60_date, p90.value AS v90, p90.metric_date AS d90_date
  FROM latest l
  JOIN public.artists a ON a.id = l.artist_id
  LEFT JOIN LATERAL (SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id=l.artist_id AND s.platform=l.platform AND s.metric=l.metric AND s.metric_date >= l.latest_date-12 AND s.metric_date <= l.latest_date-2
    ORDER BY abs(s.metric_date-(l.latest_date-7)) LIMIT 1) p7 ON true
  LEFT JOIN LATERAL (SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id=l.artist_id AND s.platform=l.platform AND s.metric=l.metric AND s.metric_date >= l.latest_date-35 AND s.metric_date <= l.latest_date-25
    ORDER BY abs(s.metric_date-(l.latest_date-30)) LIMIT 1) p30 ON true
  LEFT JOIN LATERAL (SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id=l.artist_id AND s.platform=l.platform AND s.metric=l.metric AND s.metric_date >= l.latest_date-65 AND s.metric_date <= l.latest_date-55
    ORDER BY abs(s.metric_date-(l.latest_date-60)) LIMIT 1) p60 ON true
  LEFT JOIN LATERAL (SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id=l.artist_id AND s.platform=l.platform AND s.metric=l.metric AND s.metric_date >= l.latest_date-95 AND s.metric_date <= l.latest_date-85
    ORDER BY abs(s.metric_date-(l.latest_date-90)) LIMIT 1) p90 ON true
), extremes AS (
  SELECT p_1.artist_id, p_1.platform, p_1.metric,
    (SELECT s.metric_date FROM public.artist_metrics_daily s WHERE s.artist_id=p_1.artist_id AND s.platform=p_1.platform AND s.metric=p_1.metric AND s.metric_date > p_1.latest_date-365 ORDER BY s.value DESC, s.metric_date LIMIT 1) AS best_date,
    (SELECT max(s.value) FROM public.artist_metrics_daily s WHERE s.artist_id=p_1.artist_id AND s.platform=p_1.platform AND s.metric=p_1.metric AND s.metric_date > p_1.latest_date-365) AS best_value,
    (SELECT s.metric_date FROM public.artist_metrics_daily s WHERE s.artist_id=p_1.artist_id AND s.platform=p_1.platform AND s.metric=p_1.metric AND s.metric_date > p_1.latest_date-365 ORDER BY s.value, s.metric_date LIMIT 1) AS worst_date,
    (SELECT min(s.value) FROM public.artist_metrics_daily s WHERE s.artist_id=p_1.artist_id AND s.platform=p_1.platform AND s.metric=p_1.metric AND s.metric_date > p_1.latest_date-365) AS worst_value
  FROM pts p_1
)
SELECT p.company_id, p.artist_id, p.artist_name, p.platform, p.metric, p.latest_date, p.latest_value,
  p.d7_date, CASE WHEN p.v7 IS NULL THEN NULL::numeric ELSE p.latest_value-p.v7 END,
  CASE WHEN p.v7 IS NULL OR p.v7=0 THEN NULL::numeric ELSE round((p.latest_value-p.v7)/p.v7*100,2) END,
  p.d30_date, CASE WHEN p.v30 IS NULL THEN NULL::numeric ELSE p.latest_value-p.v30 END,
  CASE WHEN p.v30 IS NULL OR p.v30=0 THEN NULL::numeric ELSE round((p.latest_value-p.v30)/p.v30*100,2) END,
  p.d90_date, CASE WHEN p.v90 IS NULL THEN NULL::numeric ELSE p.latest_value-p.v90 END,
  CASE WHEN p.v90 IS NULL OR p.v90=0 THEN NULL::numeric ELSE round((p.latest_value-p.v90)/p.v90*100,2) END,
  CASE WHEN p.v30 IS NULL OR p.v60 IS NULL OR p.v30=0 OR p.v60=0 THEN NULL::numeric
       ELSE round((p.latest_value-p.v30)/p.v30*100 - (p.v30-p.v60)/p.v60*100, 2) END,
  e.best_date, e.best_value, e.worst_date, e.worst_value,
  public._artist_metric_precisao(p.artist_id, p.platform, p.metric, p.latest_date, p.latest_value, p.latest_source_ref)
FROM pts p JOIN extremes e ON e.artist_id=p.artist_id AND e.platform=p.platform AND e.metric=p.metric
$function$;