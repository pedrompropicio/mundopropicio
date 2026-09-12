-- Fase B do módulo Carreira Artística: vídeos (shorts) por artista, ligados à obra.
-- artist_content passa a servir duas origens: 'platform_api' (Instagram oficial,
-- já existente) e 'aggregator' (Soundcharts). Sem alterar dados existentes.

ALTER TABLE public.artist_content
  ADD COLUMN IF NOT EXISTS song_id uuid NULL REFERENCES public.artist_songs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text NULL,
  ADD COLUMN IF NOT EXISTS duration_seconds integer NULL,
  ADD COLUMN IF NOT EXISTS sound_name text NULL,
  ADD COLUMN IF NOT EXISTS sound_external_id text NULL,
  ADD COLUMN IF NOT EXISTS author_handle text NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'platform_api';

CREATE INDEX IF NOT EXISTS idx_artist_content_artist_platform_published
  ON public.artist_content (artist_id, platform, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_artist_content_song
  ON public.artist_content (song_id);

-- artist_content_metrics_daily: a unique (content_id, metric, metric_date, source)
-- já existe (uq_artist_content_metrics_daily); nada a criar.

-- ---------------------------------------------------------------- views

DROP VIEW IF EXISTS public.v_artist_content_ranking;
DROP VIEW IF EXISTS public.v_song_content;
DROP VIEW IF EXISTS public.v_content_growth;
DROP VIEW IF EXISTS public.v_content_latest;

CREATE VIEW public.v_content_latest
WITH (security_invoker = on) AS
WITH latest AS (
  SELECT DISTINCT ON (m.content_id, m.metric)
    m.content_id, m.metric, m.metric_date, m.value
  FROM public.artist_content_metrics_daily m
  ORDER BY m.content_id, m.metric, m.metric_date DESC
)
SELECT
  c.id AS content_id,
  c.company_id,
  c.artist_id,
  c.platform,
  c.source,
  c.song_id,
  s.title AS song_title,
  COALESCE(c.title, c.caption_excerpt) AS title,
  c.content_type,
  c.published_at,
  c.permalink,
  c.thumbnail_url,
  c.sound_name,
  c.author_handle,
  c.duration_seconds,
  MAX(l.metric_date) AS last_metric_date,
  MAX(CASE WHEN l.metric = 'views' THEN l.value END) AS views,
  MAX(CASE WHEN l.metric = 'likes' THEN l.value END) AS likes,
  MAX(CASE WHEN l.metric = 'comments' THEN l.value END) AS comments,
  MAX(CASE WHEN l.metric = 'shares' THEN l.value END) AS shares
FROM public.artist_content c
LEFT JOIN latest l ON l.content_id = c.id
LEFT JOIN public.artist_songs s ON s.id = c.song_id
GROUP BY c.id, s.title;

CREATE VIEW public.v_content_growth
WITH (security_invoker = on) AS
WITH base AS (
  SELECT content_id, company_id, artist_id, platform, metric, metric_date, value
  FROM public.artist_content_metrics_daily
  WHERE metric IN ('views', 'likes')
), last_pt AS (
  SELECT DISTINCT ON (content_id, metric) *
  FROM base
  ORDER BY content_id, metric, metric_date DESC
)
SELECT
  l.content_id,
  l.company_id,
  l.artist_id,
  l.platform,
  l.metric,
  l.metric_date AS last_metric_date,
  l.value AS value_latest,
  l.value - (
    SELECT b.value FROM base b
    WHERE b.content_id = l.content_id AND b.metric = l.metric
      AND b.metric_date <= l.metric_date - 1
    ORDER BY b.metric_date DESC LIMIT 1
  ) AS delta_1d,
  l.value - (
    SELECT b.value FROM base b
    WHERE b.content_id = l.content_id AND b.metric = l.metric
      AND b.metric_date <= l.metric_date - 7
    ORDER BY b.metric_date DESC LIMIT 1
  ) AS delta_7d,
  l.value - (
    SELECT b.value FROM base b
    WHERE b.content_id = l.content_id AND b.metric = l.metric
      AND b.metric_date <= l.metric_date - 30
    ORDER BY b.metric_date DESC LIMIT 1
  ) AS delta_30d
FROM last_pt l;

CREATE VIEW public.v_song_content
WITH (security_invoker = on) AS
SELECT
  s.id AS song_id,
  s.company_id,
  s.artist_id,
  s.title AS song_title,
  v.platform,
  COUNT(*) AS videos,
  SUM(COALESCE(v.views, 0)) AS total_views,
  SUM(COALESCE(v.likes, 0)) AS total_likes,
  SUM(COALESCE(v.comments, 0)) AS total_comments,
  SUM(COALESCE(v.shares, 0)) AS total_shares
FROM public.artist_songs s
JOIN public.v_content_latest v ON v.song_id = s.id
GROUP BY s.id, s.company_id, s.artist_id, s.title, v.platform;

CREATE VIEW public.v_artist_content_ranking
WITH (security_invoker = on) AS
SELECT
  v.company_id,
  v.artist_id,
  v.platform,
  v.content_id,
  v.title,
  v.song_id,
  v.song_title,
  v.published_at,
  v.permalink,
  v.thumbnail_url,
  v.sound_name,
  v.views,
  v.likes,
  v.comments,
  v.shares,
  g.delta_7d AS views_delta_7d,
  ROW_NUMBER() OVER (
    PARTITION BY v.artist_id, v.platform ORDER BY v.views DESC NULLS LAST
  ) AS rank_views,
  ROW_NUMBER() OVER (
    PARTITION BY v.artist_id, v.platform ORDER BY g.delta_7d DESC NULLS LAST
  ) AS rank_growth_7d
FROM public.v_content_latest v
LEFT JOIN public.v_content_growth g
  ON g.content_id = v.content_id AND g.metric = 'views';

GRANT SELECT ON public.v_content_latest TO authenticated;
GRANT SELECT ON public.v_content_growth TO authenticated;
GRANT SELECT ON public.v_song_content TO authenticated;
GRANT SELECT ON public.v_artist_content_ranking TO authenticated;
GRANT SELECT ON public.v_content_latest TO service_role;
GRANT SELECT ON public.v_content_growth TO service_role;
GRANT SELECT ON public.v_song_content TO service_role;
GRANT SELECT ON public.v_artist_content_ranking TO service_role;