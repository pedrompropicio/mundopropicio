-- AGUARDA PEDRO — NÃO APLICADO. v_artist_momentum rápida sob RLS + coluna precisao.
-- Acesso à company verificado UMA vez (companies × user_has_company_access) numa função
-- SECURITY DEFINER; mesmas colunas e semântica (janelas ±5 dias de 7/30/90, prioridade de fonte).
CREATE OR REPLACE FUNCTION public.artist_momentum_rows()
RETURNS TABLE(company_id uuid, artist_id uuid, artist_name text, roster_type text, platform text, metric text,
  latest_date date, latest_value numeric, d7_pct numeric, d30_pct numeric, d90_pct numeric, momentum_index numeric, precisao numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
WITH comp AS (SELECT c.id FROM public.companies c WHERE public.user_has_company_access(c.id)),
mains(platform, metric) AS (VALUES ('spotify','monthly_listeners'),('instagram','followers'),('tiktok','followers'),('youtube','subscribers')),
lat AS (
  SELECT DISTINCT ON (m.artist_id, m.platform, m.metric) m.company_id, m.artist_id, m.platform, m.metric, m.metric_date, m.value, m.source_ref
  FROM public.artist_metrics_daily m JOIN comp ON comp.id = m.company_id JOIN mains mm ON mm.platform=m.platform AND mm.metric=m.metric
  ORDER BY m.artist_id, m.platform, m.metric, m.metric_date DESC,
    CASE m.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END, m.captured_at DESC NULLS LAST
), g AS (
  SELECT l.*, a.name AS artist_name, a.roster_type,
    (SELECT CASE WHEN p.value IS NULL OR p.value=0 THEN NULL ELSE round((l.value-p.value)/p.value*100,2) END FROM public.artist_metrics_daily p
      WHERE p.artist_id=l.artist_id AND p.platform=l.platform AND p.metric=l.metric AND p.metric_date BETWEEN l.metric_date-12 AND l.metric_date-2
      ORDER BY abs(p.metric_date-(l.metric_date-7)), CASE p.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END LIMIT 1) d7,
    (SELECT CASE WHEN p.value IS NULL OR p.value=0 THEN NULL ELSE round((l.value-p.value)/p.value*100,2) END FROM public.artist_metrics_daily p
      WHERE p.artist_id=l.artist_id AND p.platform=l.platform AND p.metric=l.metric AND p.metric_date BETWEEN l.metric_date-35 AND l.metric_date-25
      ORDER BY abs(p.metric_date-(l.metric_date-30)), CASE p.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END LIMIT 1) d30,
    (SELECT CASE WHEN p.value IS NULL OR p.value=0 THEN NULL ELSE round((l.value-p.value)/p.value*100,2) END FROM public.artist_metrics_daily p
      WHERE p.artist_id=l.artist_id AND p.platform=l.platform AND p.metric=l.metric AND p.metric_date BETWEEN l.metric_date-95 AND l.metric_date-85
      ORDER BY abs(p.metric_date-(l.metric_date-90)), CASE p.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END LIMIT 1) d90
  FROM lat l JOIN public.artists a ON a.id = l.artist_id
)
SELECT company_id, artist_id, artist_name, roster_type, platform, metric, metric_date AS latest_date, value AS latest_value,
  d7 AS d7_pct, d30 AS d30_pct, d90 AS d90_pct,
  CASE WHEN d7 IS NULL OR d30 IS NULL OR d90 IS NULL THEN NULL ELSE round(d7*0.5 + d30*0.3 + d90*0.2, 2) END AS momentum_index,
  substring(source_ref from 'precis[ãa]o:\s*([0-9]+)')::numeric AS precisao
FROM g
$f$;
REVOKE ALL ON FUNCTION public.artist_momentum_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_momentum_rows() TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_artist_momentum WITH (security_invoker = true) AS
SELECT * FROM public.artist_momentum_rows();

-- v_artist_growth_summary: só acrescenta a coluna precisao no fim (resto igual à definição em vigor).
CREATE OR REPLACE VIEW public.v_artist_growth_summary WITH (security_invoker = true) AS
 WITH latest AS (
         SELECT DISTINCT ON (m.artist_id, m.platform, m.metric) m.company_id,
            m.artist_id,
            m.platform,
            m.metric,
            m.metric_date AS latest_date,
            m.value AS latest_value
           FROM artist_metrics_daily m
          ORDER BY m.artist_id, m.platform, m.metric, m.metric_date DESC, (
                CASE m.source
                    WHEN 'aggregator'::text THEN 1
                    WHEN 'platform_api'::text THEN 2
                    WHEN 'public_page'::text THEN 3
                    ELSE 4
                END)
        ), pts AS (
         SELECT l.company_id,
            l.artist_id,
            l.platform,
            l.metric,
            l.latest_date,
            l.latest_value,
            a.name AS artist_name,
            p7.value AS v7,
            p7.metric_date AS d7_date,
            p30.value AS v30,
            p30.metric_date AS d30_date,
            p60.value AS v60,
            p60.metric_date AS d60_date,
            p90.value AS v90,
            p90.metric_date AS d90_date
           FROM latest l
             JOIN artists a ON a.id = l.artist_id
             LEFT JOIN LATERAL ( SELECT s.metric_date,
                    s.value
                   FROM artist_metrics_daily s
                  WHERE s.artist_id = l.artist_id AND s.platform = l.platform AND s.metric = l.metric AND s.metric_date >= (l.latest_date - 12) AND s.metric_date <= (l.latest_date - 2)
                  ORDER BY (abs(s.metric_date - (l.latest_date - 7)))
                 LIMIT 1) p7 ON true
             LEFT JOIN LATERAL ( SELECT s.metric_date,
                    s.value
                   FROM artist_metrics_daily s
                  WHERE s.artist_id = l.artist_id AND s.platform = l.platform AND s.metric = l.metric AND s.metric_date >= (l.latest_date - 35) AND s.metric_date <= (l.latest_date - 25)
                  ORDER BY (abs(s.metric_date - (l.latest_date - 30)))
                 LIMIT 1) p30 ON true
             LEFT JOIN LATERAL ( SELECT s.metric_date,
                    s.value
                   FROM artist_metrics_daily s
                  WHERE s.artist_id = l.artist_id AND s.platform = l.platform AND s.metric = l.metric AND s.metric_date >= (l.latest_date - 65) AND s.metric_date <= (l.latest_date - 55)
                  ORDER BY (abs(s.metric_date - (l.latest_date - 60)))
                 LIMIT 1) p60 ON true
             LEFT JOIN LATERAL ( SELECT s.metric_date,
                    s.value
                   FROM artist_metrics_daily s
                  WHERE s.artist_id = l.artist_id AND s.platform = l.platform AND s.metric = l.metric AND s.metric_date >= (l.latest_date - 95) AND s.metric_date <= (l.latest_date - 85)
                  ORDER BY (abs(s.metric_date - (l.latest_date - 90)))
                 LIMIT 1) p90 ON true
        ), extremes AS (
         SELECT p_1.artist_id,
            p_1.platform,
            p_1.metric,
            ( SELECT s.metric_date
                   FROM artist_metrics_daily s
                  WHERE s.artist_id = p_1.artist_id AND s.platform = p_1.platform AND s.metric = p_1.metric AND s.metric_date > (p_1.latest_date - 365)
                  ORDER BY s.value DESC, s.metric_date
                 LIMIT 1) AS best_date,
            ( SELECT max(s.value) AS max
                   FROM artist_metrics_daily s
                  WHERE s.artist_id = p_1.artist_id AND s.platform = p_1.platform AND s.metric = p_1.metric AND s.metric_date > (p_1.latest_date - 365)) AS best_value,
            ( SELECT s.metric_date
                   FROM artist_metrics_daily s
                  WHERE s.artist_id = p_1.artist_id AND s.platform = p_1.platform AND s.metric = p_1.metric AND s.metric_date > (p_1.latest_date - 365)
                  ORDER BY s.value, s.metric_date
                 LIMIT 1) AS worst_date,
            ( SELECT min(s.value) AS min
                   FROM artist_metrics_daily s
                  WHERE s.artist_id = p_1.artist_id AND s.platform = p_1.platform AND s.metric = p_1.metric AND s.metric_date > (p_1.latest_date - 365)) AS worst_value
           FROM pts p_1
        )
 SELECT p.company_id,
    p.artist_id,
    p.artist_name,
    p.platform,
    p.metric,
    p.latest_date,
    p.latest_value,
    p.d7_date AS d7_base_date,
        CASE
            WHEN p.v7 IS NULL THEN NULL::numeric
            ELSE p.latest_value - p.v7
        END AS d7_delta,
        CASE
            WHEN p.v7 IS NULL OR p.v7 = 0::numeric THEN NULL::numeric
            ELSE round((p.latest_value - p.v7) / p.v7 * 100::numeric, 2)
        END AS d7_pct,
    p.d30_date AS d30_base_date,
        CASE
            WHEN p.v30 IS NULL THEN NULL::numeric
            ELSE p.latest_value - p.v30
        END AS d30_delta,
        CASE
            WHEN p.v30 IS NULL OR p.v30 = 0::numeric THEN NULL::numeric
            ELSE round((p.latest_value - p.v30) / p.v30 * 100::numeric, 2)
        END AS d30_pct,
    p.d90_date AS d90_base_date,
        CASE
            WHEN p.v90 IS NULL THEN NULL::numeric
            ELSE p.latest_value - p.v90
        END AS d90_delta,
        CASE
            WHEN p.v90 IS NULL OR p.v90 = 0::numeric THEN NULL::numeric
            ELSE round((p.latest_value - p.v90) / p.v90 * 100::numeric, 2)
        END AS d90_pct,
        CASE
            WHEN p.v30 IS NULL OR p.v60 IS NULL OR p.v30 = 0::numeric OR p.v60 = 0::numeric THEN NULL::numeric
            ELSE round((p.latest_value - p.v30) / p.v30 * 100::numeric - (p.v30 - p.v60) / p.v60 * 100::numeric, 2)
        END AS accel_pct,
    e.best_date,
    e.best_value,
    e.worst_date,
    e.worst_value,
    ( SELECT substring(s.source_ref from 'precis[ãa]o:\s*([0-9]+)')::numeric
        FROM artist_metrics_daily s
       WHERE s.artist_id = p.artist_id AND s.platform = p.platform AND s.metric = p.metric AND s.metric_date = p.latest_date
       ORDER BY CASE s.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END
       LIMIT 1) AS precisao
   FROM pts p
     JOIN extremes e ON e.artist_id = p.artist_id AND e.platform = p.platform AND e.metric = p.metric;
