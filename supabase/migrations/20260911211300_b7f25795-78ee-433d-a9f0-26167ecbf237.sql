-- Camada analítica da carreira artística (só leitura).
-- Regras: SECURITY INVOKER em tudo (RLS das tabelas base manda),
-- NULL em vez de zero quando não há ponto na janela, sempre com company_id exposto.

-- ============================================================
-- 1) Último ponto por (artista, plataforma, métrica)
-- Desempate por data desc e, em caso de empate de data entre origens,
-- prioridade explícita: aggregator > platform_api > public_page > outras.
-- ============================================================
CREATE OR REPLACE VIEW public.v_artist_metric_latest
WITH (security_invoker = true) AS
SELECT DISTINCT ON (m.artist_id, m.platform, m.metric)
  m.company_id,
  m.artist_id,
  a.name AS artist_name,
  m.platform,
  m.metric,
  m.metric_date,
  m.value,
  m.source
FROM public.artist_metrics_daily m
JOIN public.artists a ON a.id = m.artist_id
ORDER BY
  m.artist_id, m.platform, m.metric,
  m.metric_date DESC,
  CASE m.source
    WHEN 'aggregator'   THEN 1
    WHEN 'platform_api' THEN 2
    WHEN 'public_page'  THEN 3
    ELSE 4
  END,
  m.captured_at DESC NULLS LAST;

COMMENT ON VIEW public.v_artist_metric_latest IS
  'Último ponto por (artist_id, platform, metric). Empate de data resolvido por prioridade de origem: aggregator > platform_api > public_page.';

-- ============================================================
-- 2) Crescimento a N dias para um artista
-- base = ponto mais próximo de (latest_date - _days), tolerância ±5 dias.
-- Sem ponto na janela => base/delta/delta_pct = NULL (série não cobre o período).
-- days_span = dias reais entre base_date e latest_date.
-- ============================================================
CREATE OR REPLACE FUNCTION public.artist_metric_growth(_artist_id uuid, _days int)
RETURNS TABLE (
  company_id   uuid,
  platform     text,
  metric       text,
  base_date    date,
  base_value   numeric,
  latest_date  date,
  latest_value numeric,
  delta        numeric,
  delta_pct    numeric,
  days_span    int
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (m.platform, m.metric)
      m.company_id, m.platform, m.metric, m.metric_date, m.value
    FROM public.artist_metrics_daily m
    WHERE m.artist_id = _artist_id
    ORDER BY m.platform, m.metric, m.metric_date DESC,
      CASE m.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END
  )
  SELECT
    l.company_id,
    l.platform,
    l.metric,
    b.metric_date,
    b.value,
    l.metric_date,
    l.value,
    CASE WHEN b.value IS NULL THEN NULL ELSE l.value - b.value END,
    -- delta_pct: NULL se não houver base ou se base = 0 (divisão impossível)
    CASE WHEN b.value IS NULL OR b.value = 0 THEN NULL
         ELSE round((l.value - b.value) / b.value * 100, 2) END,
    CASE WHEN b.metric_date IS NULL THEN NULL ELSE (l.metric_date - b.metric_date) END
  FROM latest l
  LEFT JOIN LATERAL (
    SELECT p.metric_date, p.value
    FROM public.artist_metrics_daily p
    WHERE p.artist_id = _artist_id
      AND p.platform = l.platform
      AND p.metric = l.metric
      AND p.metric_date BETWEEN (l.metric_date - _days - 5) AND (l.metric_date - _days + 5)
    ORDER BY abs(p.metric_date - (l.metric_date - _days)),
      CASE p.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END
    LIMIT 1
  ) b ON true;
$$;

COMMENT ON FUNCTION public.artist_metric_growth(uuid, int) IS
  'Crescimento por (platform, metric) a N dias. Base = ponto mais próximo de latest_date - N, tolerância ±5 dias; NULL se a série não cobrir. delta_pct NULL se base_value = 0.';

-- ============================================================
-- 3) Resumo de crescimento: 7/30/90 dias + aceleração + melhor/pior 365 dias
-- Mesma tolerância de ±5 dias na escolha dos pontos históricos.
-- accel_pct = pct(latest-30 → latest) - pct(latest-60 → latest-30); NULL se faltar ponto.
-- ============================================================
CREATE OR REPLACE VIEW public.v_artist_growth_summary
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (m.artist_id, m.platform, m.metric)
    m.company_id, m.artist_id, m.platform, m.metric,
    m.metric_date AS latest_date, m.value AS latest_value
  FROM public.artist_metrics_daily m
  ORDER BY m.artist_id, m.platform, m.metric, m.metric_date DESC,
    CASE m.source WHEN 'aggregator' THEN 1 WHEN 'platform_api' THEN 2 WHEN 'public_page' THEN 3 ELSE 4 END
),
pts AS (
  SELECT
    l.*,
    a.name AS artist_name,
    p7.value  AS v7,  p7.metric_date  AS d7_date,
    p30.value AS v30, p30.metric_date AS d30_date,
    p60.value AS v60, p60.metric_date AS d60_date,
    p90.value AS v90, p90.metric_date AS d90_date
  FROM latest l
  JOIN public.artists a ON a.id = l.artist_id
  LEFT JOIN LATERAL (
    SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id = l.artist_id AND s.platform = l.platform AND s.metric = l.metric
      AND s.metric_date BETWEEN l.latest_date - 12 AND l.latest_date - 2
    ORDER BY abs(s.metric_date - (l.latest_date - 7)) LIMIT 1
  ) p7 ON true
  LEFT JOIN LATERAL (
    SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id = l.artist_id AND s.platform = l.platform AND s.metric = l.metric
      AND s.metric_date BETWEEN l.latest_date - 35 AND l.latest_date - 25
    ORDER BY abs(s.metric_date - (l.latest_date - 30)) LIMIT 1
  ) p30 ON true
  LEFT JOIN LATERAL (
    SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id = l.artist_id AND s.platform = l.platform AND s.metric = l.metric
      AND s.metric_date BETWEEN l.latest_date - 65 AND l.latest_date - 55
    ORDER BY abs(s.metric_date - (l.latest_date - 60)) LIMIT 1
  ) p60 ON true
  LEFT JOIN LATERAL (
    SELECT s.metric_date, s.value FROM public.artist_metrics_daily s
    WHERE s.artist_id = l.artist_id AND s.platform = l.platform AND s.metric = l.metric
      AND s.metric_date BETWEEN l.latest_date - 95 AND l.latest_date - 85
    ORDER BY abs(s.metric_date - (l.latest_date - 90)) LIMIT 1
  ) p90 ON true
),
extremes AS (
  -- Máximo e mínimo da série nos últimos 365 dias (relativo ao último ponto de cada série)
  SELECT
    p.artist_id, p.platform, p.metric,
    (SELECT s.metric_date FROM public.artist_metrics_daily s
      WHERE s.artist_id = p.artist_id AND s.platform = p.platform AND s.metric = p.metric
        AND s.metric_date > p.latest_date - 365
      ORDER BY s.value DESC, s.metric_date ASC LIMIT 1) AS best_date,
    (SELECT max(s.value) FROM public.artist_metrics_daily s
      WHERE s.artist_id = p.artist_id AND s.platform = p.platform AND s.metric = p.metric
        AND s.metric_date > p.latest_date - 365) AS best_value,
    (SELECT s.metric_date FROM public.artist_metrics_daily s
      WHERE s.artist_id = p.artist_id AND s.platform = p.platform AND s.metric = p.metric
        AND s.metric_date > p.latest_date - 365
      ORDER BY s.value ASC, s.metric_date ASC LIMIT 1) AS worst_date,
    (SELECT min(s.value) FROM public.artist_metrics_daily s
      WHERE s.artist_id = p.artist_id AND s.platform = p.platform AND s.metric = p.metric
        AND s.metric_date > p.latest_date - 365) AS worst_value
  FROM pts p
)
SELECT
  p.company_id,
  p.artist_id,
  p.artist_name,
  p.platform,
  p.metric,
  p.latest_date,
  p.latest_value,
  p.d7_date  AS d7_base_date,
  CASE WHEN p.v7  IS NULL THEN NULL ELSE p.latest_value - p.v7  END AS d7_delta,
  CASE WHEN p.v7  IS NULL OR p.v7  = 0 THEN NULL ELSE round((p.latest_value - p.v7)  / p.v7  * 100, 2) END AS d7_pct,
  p.d30_date AS d30_base_date,
  CASE WHEN p.v30 IS NULL THEN NULL ELSE p.latest_value - p.v30 END AS d30_delta,
  CASE WHEN p.v30 IS NULL OR p.v30 = 0 THEN NULL ELSE round((p.latest_value - p.v30) / p.v30 * 100, 2) END AS d30_pct,
  p.d90_date AS d90_base_date,
  CASE WHEN p.v90 IS NULL THEN NULL ELSE p.latest_value - p.v90 END AS d90_delta,
  CASE WHEN p.v90 IS NULL OR p.v90 = 0 THEN NULL ELSE round((p.latest_value - p.v90) / p.v90 * 100, 2) END AS d90_pct,
  -- aceleração: variação % dos últimos 30 dias menos a dos 30 dias anteriores
  CASE
    WHEN p.v30 IS NULL OR p.v60 IS NULL OR p.v30 = 0 OR p.v60 = 0 THEN NULL
    ELSE round(((p.latest_value - p.v30) / p.v30 * 100) - ((p.v30 - p.v60) / p.v60 * 100), 2)
  END AS accel_pct,
  e.best_date, e.best_value, e.worst_date, e.worst_value
FROM pts p
JOIN extremes e
  ON e.artist_id = p.artist_id AND e.platform = p.platform AND e.metric = p.metric;

COMMENT ON VIEW public.v_artist_growth_summary IS
  'Resumo por (artist_id, platform, metric): deltas 7/30/90 dias (tolerância ±5), aceleração (pct 30d - pct 30d anteriores) e máximo/mínimo dos últimos 365 dias. NULL quando falta ponto.';

-- ============================================================
-- 4) Série indexada a base 100 (últimos 365 dias)
-- indexed = value / primeiro_valor_da_janela * 100; NULL se o primeiro valor for 0.
-- ============================================================
CREATE OR REPLACE VIEW public.v_artist_metric_indexed
WITH (security_invoker = true) AS
WITH win AS (
  SELECT m.company_id, m.artist_id, m.platform, m.metric, m.metric_date, m.value,
         first_value(m.value) OVER (
           PARTITION BY m.artist_id, m.platform, m.metric
           ORDER BY m.metric_date ASC
         ) AS base_value
  FROM public.artist_metrics_daily m
  WHERE m.metric_date > (CURRENT_DATE - 365)
)
SELECT
  w.company_id, w.artist_id, a.name AS artist_name,
  w.platform, w.metric, w.metric_date, w.value,
  CASE WHEN w.base_value IS NULL OR w.base_value = 0 THEN NULL
       ELSE round(w.value / w.base_value * 100, 2) END AS indexed
FROM win w
JOIN public.artists a ON a.id = w.artist_id;

COMMENT ON VIEW public.v_artist_metric_indexed IS
  'Série dos últimos 365 dias em base 100 (primeiro valor da janela = 100), para comparar artistas de tamanhos diferentes. indexed NULL se o primeiro valor for 0.';

-- ============================================================
-- 5) Desempenho por lançamento
-- ATENÇÃO: as métricas são CONTADORES ACUMULADOS. Se a primeira leitura for
-- muito posterior à publicação, first_value já vem alto e não representa o arranque —
-- ver tracking_started_days_after_release.
-- d7_value/d30_value: contador na data mais próxima de release_date+7 / +30, tolerância ±3 dias.
-- ============================================================
CREATE OR REPLACE VIEW public.v_artist_release_performance
WITH (security_invoker = true) AS
WITH agg AS (
  SELECT
    rm.company_id, rm.artist_id, rm.release_id, rm.platform, rm.metric,
    min(rm.metric_date) AS first_date,
    max(rm.metric_date) AS latest_date
  FROM public.artist_release_metrics_daily rm
  GROUP BY 1,2,3,4,5
)
SELECT
  g.company_id,
  g.artist_id,
  a.name AS artist_name,
  g.release_id,
  r.title,
  g.platform,
  r.published_at,
  r.published_at::date AS release_date,
  g.metric,
  g.first_date,
  fv.value AS first_value,
  g.latest_date,
  lv.value AS latest_value,
  p7.value  AS d7_value,
  p30.value AS d30_value,
  (lv.value - fv.value) AS total_gain,
  (g.latest_date - g.first_date) AS days_tracked,
  round((lv.value - fv.value) / NULLIF((g.latest_date - g.first_date), 0), 2) AS avg_daily_gain,
  -- dias entre a publicação e a nossa primeira leitura: se for alto, a comparação não é justa
  (g.first_date - r.published_at::date) AS tracking_started_days_after_release
FROM agg g
JOIN public.artist_releases r ON r.id = g.release_id
JOIN public.artists a ON a.id = g.artist_id
LEFT JOIN LATERAL (
  SELECT s.value FROM public.artist_release_metrics_daily s
  WHERE s.release_id = g.release_id AND s.platform = g.platform AND s.metric = g.metric
    AND s.metric_date = g.first_date
  ORDER BY s.captured_at DESC NULLS LAST LIMIT 1
) fv ON true
LEFT JOIN LATERAL (
  SELECT s.value FROM public.artist_release_metrics_daily s
  WHERE s.release_id = g.release_id AND s.platform = g.platform AND s.metric = g.metric
    AND s.metric_date = g.latest_date
  ORDER BY s.captured_at DESC NULLS LAST LIMIT 1
) lv ON true
LEFT JOIN LATERAL (
  SELECT s.value FROM public.artist_release_metrics_daily s
  WHERE s.release_id = g.release_id AND s.platform = g.platform AND s.metric = g.metric
    AND s.metric_date BETWEEN (r.published_at::date + 4) AND (r.published_at::date + 10)
  ORDER BY abs(s.metric_date - (r.published_at::date + 7)) LIMIT 1
) p7 ON true
LEFT JOIN LATERAL (
  SELECT s.value FROM public.artist_release_metrics_daily s
  WHERE s.release_id = g.release_id AND s.platform = g.platform AND s.metric = g.metric
    AND s.metric_date BETWEEN (r.published_at::date + 27) AND (r.published_at::date + 33)
  ORDER BY abs(s.metric_date - (r.published_at::date + 30)) LIMIT 1
) p30 ON true;

COMMENT ON VIEW public.v_artist_release_performance IS
  'Desempenho por lançamento (contadores acumulados). d7/d30 com tolerância ±3 dias; NULL se não houver leitura. tracking_started_days_after_release indica quando a comparação é justa.';

-- ============================================================
-- 6) Ranking de lançamentos por artista/plataforma
-- rank por avg_daily_gain desc + mediana do avg_daily_gain do mesmo artista/plataforma.
-- ============================================================
CREATE OR REPLACE VIEW public.v_artist_release_ranking
WITH (security_invoker = true) AS
WITH med AS (
  SELECT artist_id, platform, metric,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY avg_daily_gain) AS median_avg_daily_gain
  FROM public.v_artist_release_performance
  WHERE avg_daily_gain IS NOT NULL
  GROUP BY 1,2,3
)
SELECT
  p.company_id, p.artist_id, p.artist_name, p.platform, p.metric,
  p.release_id, p.title, p.release_date,
  p.first_value, p.latest_value, p.total_gain, p.days_tracked, p.avg_daily_gain,
  p.tracking_started_days_after_release,
  rank() OVER (PARTITION BY p.artist_id, p.platform, p.metric
               ORDER BY p.avg_daily_gain DESC NULLS LAST) AS rank,
  m.median_avg_daily_gain,
  CASE WHEN p.avg_daily_gain IS NULL OR m.median_avg_daily_gain IS NULL THEN NULL
       ELSE (p.avg_daily_gain >= m.median_avg_daily_gain) END AS above_median
FROM public.v_artist_release_performance p
LEFT JOIN med m ON m.artist_id = p.artist_id AND m.platform = p.platform AND m.metric = p.metric;

COMMENT ON VIEW public.v_artist_release_ranking IS
  'Ranking de lançamentos por artista/plataforma/métrica segundo avg_daily_gain, com mediana do mesmo grupo para identificar acima/abaixo do habitual.';

-- ============================================================
-- 7) Grants
-- ============================================================
GRANT SELECT ON public.v_artist_metric_latest TO authenticated, service_role;
GRANT SELECT ON public.v_artist_growth_summary TO authenticated, service_role;
GRANT SELECT ON public.v_artist_metric_indexed TO authenticated, service_role;
GRANT SELECT ON public.v_artist_release_performance TO authenticated, service_role;
GRANT SELECT ON public.v_artist_release_ranking TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_metric_growth(uuid, int) TO authenticated, service_role;