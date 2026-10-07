-- D-ERP186: comparação alinhada à data do comparável. Helpers partilhados com as vistas (resultados inalterados).
CREATE OR REPLACE FUNCTION public._artist_metric_pct_near(_artist uuid, _platform text, _metric text, _d date, _value numeric, _days int, _lo int, _hi int)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN p.value IS NULL OR p.value=0 THEN NULL ELSE round((_value-p.value)/p.value*100,2) END
  FROM public.artist_metrics_daily p
  WHERE p.artist_id=_artist AND p.platform=_platform AND p.metric=_metric AND p.metric_date BETWEEN _d-_hi AND _d-_lo
  ORDER BY abs(p.metric_date-(_d-_days)), CASE p.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public._artist_metric_momentum(_d7 numeric, _d30 numeric, _d90 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _d7 IS NULL OR _d30 IS NULL OR _d90 IS NULL THEN NULL ELSE round(_d7*0.5 + _d30*0.3 + _d90*0.2, 2) END
$$;

CREATE OR REPLACE FUNCTION public._artist_metric_precisao(_artist uuid, _platform text, _metric text, _d date, _value numeric, _source_ref text)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT coalesce(substring(_source_ref from 'precis[ãa]o:\s*([0-9]+)')::numeric,
    (SELECT CASE WHEN count(*)>0 AND count(q.pr)=count(*) AND _value % min(q.pr) = 0 THEN min(q.pr) END FROM (
      SELECT substring(z.source_ref from 'precis[ãa]o:\s*([0-9]+)')::numeric pr FROM public.artist_metrics_daily z
      WHERE z.artist_id=_artist AND z.platform=_platform AND z.metric=_metric AND z.source='aggregator'
        AND z.metric_date<=_d AND z.metric_date>_d-30 ORDER BY z.metric_date DESC LIMIT 7) q))
$$;

REVOKE ALL ON FUNCTION public._artist_metric_pct_near(uuid,text,text,date,numeric,int,int,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._artist_metric_precisao(uuid,text,text,date,numeric,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.artist_momentum_rows()
 RETURNS TABLE(company_id uuid, artist_id uuid, artist_name text, roster_type text, platform text, metric text, latest_date date, latest_value numeric, d7_pct numeric, d30_pct numeric, d90_pct numeric, momentum_index numeric, precisao numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH comp AS (SELECT c.id FROM public.companies c WHERE public.user_has_company_access(c.id)),
mains(platform, metric) AS (VALUES ('spotify','monthly_listeners'),('instagram','followers'),('tiktok','followers'),('youtube','subscribers')),
lat AS (
  SELECT DISTINCT ON (m.artist_id, m.platform, m.metric) m.company_id, m.artist_id, m.platform, m.metric, m.metric_date, m.value, m.source_ref
  FROM public.artist_metrics_daily m JOIN comp ON comp.id = m.company_id JOIN mains mm ON mm.platform=m.platform AND mm.metric=m.metric
  ORDER BY m.artist_id, m.platform, m.metric, m.metric_date DESC,
    CASE m.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END, m.captured_at DESC NULLS LAST
), g AS (
  SELECT l.*, a.name AS artist_name, a.roster_type,
    public._artist_metric_pct_near(l.artist_id, l.platform, l.metric, l.metric_date, l.value, 7, 2, 12) d7,
    public._artist_metric_pct_near(l.artist_id, l.platform, l.metric, l.metric_date, l.value, 30, 25, 35) d30,
    public._artist_metric_pct_near(l.artist_id, l.platform, l.metric, l.metric_date, l.value, 90, 85, 95) d90
  FROM lat l JOIN public.artists a ON a.id = l.artist_id
)
SELECT company_id, artist_id, artist_name, roster_type, platform, metric, metric_date AS latest_date, value AS latest_value,
  d7 AS d7_pct, d30 AS d30_pct, d90 AS d90_pct,
  public._artist_metric_momentum(d7, d30, d90) AS momentum_index,
  public._artist_metric_precisao(g.artist_id, g.platform, g.metric, g.metric_date, g.value, g.source_ref) AS precisao
FROM g
$function$;

CREATE OR REPLACE FUNCTION public.artist_metric_compare_aligned(p_company_id uuid, p_base_artist_id uuid, p_artist_ids uuid[], p_platform text, p_metric text)
RETURNS TABLE(artist_id uuid, data_d date, source text, valor_comparavel numeric, precisao numeric, momentum_index numeric,
  valor_base numeric, source_base text, source_base_fallback boolean, d30_pct_base numeric, momentum_index_base numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH ok AS (SELECT public.user_has_company_access(p_company_id) AS v),
base AS (SELECT a.id FROM public.artists a, ok WHERE ok.v AND a.id = p_base_artist_id AND a.company_id = p_company_id),
cmp AS (
  SELECT DISTINCT ON (m.artist_id) m.artist_id, m.metric_date d, m.source src, m.value, m.source_ref
  FROM public.artist_metrics_daily m JOIN public.artists a ON a.id = m.artist_id, ok
  WHERE ok.v AND a.company_id = p_company_id AND m.company_id = p_company_id
    AND m.artist_id = ANY(p_artist_ids) AND m.platform = p_platform AND m.metric = p_metric
  ORDER BY m.artist_id, m.metric_date DESC,
    CASE m.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END, m.captured_at DESC NULLS LAST
)
SELECT c.artist_id, c.d, c.src, c.value,
  public._artist_metric_precisao(c.artist_id, p_platform, p_metric, c.d, c.value, c.source_ref),
  public._artist_metric_momentum(
    public._artist_metric_pct_near(c.artist_id, p_platform, p_metric, c.d, c.value, 7, 2, 12),
    public._artist_metric_pct_near(c.artist_id, p_platform, p_metric, c.d, c.value, 30, 25, 35),
    public._artist_metric_pct_near(c.artist_id, p_platform, p_metric, c.d, c.value, 90, 85, 95)),
  b.value, b.source, CASE WHEN b.source IS NOT NULL THEN b.source <> c.src END,
  public._artist_metric_pct_near(p_base_artist_id, p_platform, p_metric, c.d, b.value, 30, 25, 35),
  public._artist_metric_momentum(
    public._artist_metric_pct_near(p_base_artist_id, p_platform, p_metric, c.d, b.value, 7, 2, 12),
    public._artist_metric_pct_near(p_base_artist_id, p_platform, p_metric, c.d, b.value, 30, 25, 35),
    public._artist_metric_pct_near(p_base_artist_id, p_platform, p_metric, c.d, b.value, 90, 85, 95))
FROM cmp c
LEFT JOIN LATERAL (
  SELECT m.value, m.source FROM public.artist_metrics_daily m JOIN base ON base.id = m.artist_id
  WHERE m.company_id = p_company_id AND m.platform = p_platform AND m.metric = p_metric AND m.metric_date = c.d
  ORDER BY (m.source = c.src) DESC,
    CASE m.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END, m.captured_at DESC NULLS LAST
  LIMIT 1) b ON true
WHERE c.artist_id <> p_base_artist_id
$function$;

REVOKE ALL ON FUNCTION public.artist_metric_compare_aligned(uuid,uuid,uuid[],text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_metric_compare_aligned(uuid,uuid,uuid[],text,text) TO authenticated;