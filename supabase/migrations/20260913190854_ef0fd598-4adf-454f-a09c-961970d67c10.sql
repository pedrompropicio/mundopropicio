DROP VIEW IF EXISTS public.v_song_benchmark_aligned;

CREATE VIEW public.v_song_benchmark_aligned
WITH (security_invoker = true) AS
WITH launch AS (
  SELECT s.id            AS launch_song_id,
         s.company_id,
         s.artist_id     AS launch_artist_id,
         s.release_date  AS launch_release_date,
         GREATEST((CURRENT_DATE - s.release_date), 1) AS n
    FROM public.artist_songs s
   WHERE s.is_launch
     AND s.release_date IS NOT NULL
     AND COALESCE(s.tracking_status, '') <> 'arquivado'
),
pairs AS (
  SELECT l.launch_song_id, l.company_id, l.n, s2.id AS song_id, false AS is_self
    FROM launch l
    JOIN public.artist_comparables ac ON ac.artist_id = l.launch_artist_id
    JOIN public.artist_songs s2
      ON s2.artist_id = ac.comparable_artist_id
     AND s2.is_reference
     AND s2.release_date IS NOT NULL
     AND COALESCE(s2.tracking_status, '') <> 'arquivado'
  UNION ALL
  SELECT l.launch_song_id, l.company_id, l.n, l.launch_song_id, true
    FROM launch l
)
SELECT
  p.launch_song_id,
  p.company_id,
  p.n                                   AS idade_alinhada_dias,
  p.song_id,
  p.is_self,
  a.id                                  AS artist_id,
  a.name                                AS artist_name,
  s.title,
  s.release_date,
  (CURRENT_DATE - s.release_date)        AS dias_desde_lancamento,
  s.notes                               AS song_notes,
  spn.value                             AS spotify_streams_dia_n,
  spn.metric_date                       AS spotify_streams_dia_n_date,
  CASE WHEN spn.value IS NOT NULL
       THEN round(spn.value / p.n, 2) END AS spotify_streams_por_dia_n,
  sph.value                             AS spotify_streams_hoje,
  sph.metric_date                       AS spotify_streams_hoje_date,
  tt.value                              AS tiktok_ugc_latest,
  tt.metric_date                        AS tiktok_ugc_date,
  tt.source                             AS tiktok_ugc_source,
  CASE WHEN tt.value IS NOT NULL AND (CURRENT_DATE - s.release_date) > 0
       THEN round(tt.value / (CURRENT_DATE - s.release_date), 2) END AS tiktok_ugc_por_dia,
  ig.value                              AS instagram_reels_latest,
  ig.metric_date                        AS instagram_reels_date
FROM pairs p
JOIN public.artist_songs s ON s.id = p.song_id
JOIN public.artists a      ON a.id = s.artist_id
LEFT JOIN LATERAL (
  SELECT m.value, m.metric_date
    FROM public.artist_song_metrics_daily m
   WHERE m.song_id = p.song_id AND m.platform = 'spotify' AND m.metric = 'streams'
     AND COALESCE(m.source, '') <> 'manual'
     AND m.metric_date <= s.release_date + (p.n - 1)
   ORDER BY m.metric_date DESC
   LIMIT 1
) spn ON true
LEFT JOIN LATERAL (
  SELECT m.value, m.metric_date
    FROM public.artist_song_metrics_daily m
   WHERE m.song_id = p.song_id AND m.platform = 'spotify' AND m.metric = 'streams'
     AND COALESCE(m.source, '') <> 'manual'
   ORDER BY m.metric_date DESC
   LIMIT 1
) sph ON true
LEFT JOIN LATERAL (
  SELECT m.value, m.metric_date, m.source
    FROM public.artist_song_metrics_daily m
   WHERE m.song_id = p.song_id AND m.platform = 'tiktok'
     AND m.metric IN ('ugc_videos', 'videos')
   ORDER BY m.metric_date DESC, (m.metric = 'ugc_videos') DESC
   LIMIT 1
) tt ON true
LEFT JOIN LATERAL (
  SELECT m.value, m.metric_date
    FROM public.artist_song_metrics_daily m
   WHERE m.song_id = p.song_id AND m.platform = 'instagram' AND m.metric = 'reels'
   ORDER BY m.metric_date DESC
   LIMIT 1
) ig ON true;

GRANT SELECT ON public.v_song_benchmark_aligned TO authenticated;
GRANT SELECT ON public.v_song_benchmark_aligned TO service_role;

DROP FUNCTION IF EXISTS public.song_benchmark_aligned(uuid);

CREATE FUNCTION public.song_benchmark_aligned(p_song_id uuid)
RETURNS TABLE (
  song_id uuid,
  is_self boolean,
  artist_name text,
  title text,
  release_date date,
  dias_desde_lancamento integer,
  idade_alinhada_dias integer,
  song_notes text,
  spotify_streams_dia_n numeric,
  spotify_streams_dia_n_date date,
  spotify_streams_por_dia_n numeric,
  spotify_streams_hoje numeric,
  spotify_streams_hoje_date date,
  tiktok_ugc_latest numeric,
  tiktok_ugc_date date,
  tiktok_ugc_source text,
  tiktok_ugc_por_dia numeric,
  instagram_reels_latest numeric,
  instagram_reels_date date,
  rank_spotify_dia_n integer,
  total_spotify_dia_n integer,
  rank_spotify_por_dia_n integer,
  total_spotify_por_dia_n integer,
  rank_tiktok_ugc integer,
  total_tiktok_ugc integer,
  rank_tiktok_ugc_por_dia integer,
  total_tiktok_ugc_por_dia integer,
  rank_instagram_reels integer,
  total_instagram_reels integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH b AS (
    SELECT * FROM public.v_song_benchmark_aligned WHERE launch_song_id = p_song_id
  )
  SELECT
    b.song_id, b.is_self, b.artist_name, b.title, b.release_date,
    b.dias_desde_lancamento, b.idade_alinhada_dias, b.song_notes,
    b.spotify_streams_dia_n, b.spotify_streams_dia_n_date, b.spotify_streams_por_dia_n,
    b.spotify_streams_hoje, b.spotify_streams_hoje_date,
    b.tiktok_ugc_latest, b.tiktok_ugc_date, b.tiktok_ugc_source, b.tiktok_ugc_por_dia,
    b.instagram_reels_latest, b.instagram_reels_date,
    CASE WHEN b.spotify_streams_dia_n IS NULL THEN NULL ELSE
      rank() OVER (PARTITION BY (b.spotify_streams_dia_n IS NULL) ORDER BY b.spotify_streams_dia_n DESC)::int END,
    count(b.spotify_streams_dia_n) OVER ()::int,
    CASE WHEN b.spotify_streams_por_dia_n IS NULL THEN NULL ELSE
      rank() OVER (PARTITION BY (b.spotify_streams_por_dia_n IS NULL) ORDER BY b.spotify_streams_por_dia_n DESC)::int END,
    count(b.spotify_streams_por_dia_n) OVER ()::int,
    CASE WHEN b.tiktok_ugc_latest IS NULL THEN NULL ELSE
      rank() OVER (PARTITION BY (b.tiktok_ugc_latest IS NULL) ORDER BY b.tiktok_ugc_latest DESC)::int END,
    count(b.tiktok_ugc_latest) OVER ()::int,
    CASE WHEN b.tiktok_ugc_por_dia IS NULL THEN NULL ELSE
      rank() OVER (PARTITION BY (b.tiktok_ugc_por_dia IS NULL) ORDER BY b.tiktok_ugc_por_dia DESC)::int END,
    count(b.tiktok_ugc_por_dia) OVER ()::int,
    CASE WHEN b.instagram_reels_latest IS NULL THEN NULL ELSE
      rank() OVER (PARTITION BY (b.instagram_reels_latest IS NULL) ORDER BY b.instagram_reels_latest DESC)::int END,
    count(b.instagram_reels_latest) OVER ()::int
  FROM b
  ORDER BY b.is_self DESC, b.artist_name, b.release_date DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.song_benchmark_aligned(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.song_benchmark_aligned(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.song_benchmark_aligned(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.song_benchmark_aligned(uuid) TO service_role;

UPDATE public.artist_songs
   SET notes = 'Som oficial no TikTok tem ~580 publicacoes; o audio "som original de Henry Freitas" tem 18.300 (13/09/2026, contagem manual). O UGC concentrou-se no som original, nao no oficial.'
 WHERE id = '352cd824-cfc6-492d-93f7-a5fd05d3eb78'
   AND COALESCE(notes, '') = '';