ALTER TABLE public.artist_songs
  ADD COLUMN IF NOT EXISTS is_reference boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_artist_songs_is_reference
  ON public.artist_songs(is_reference) WHERE is_reference;

DROP VIEW IF EXISTS public.v_song_ugc_benchmark;

CREATE VIEW public.v_song_ugc_benchmark
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (m.song_id, m.platform, m.metric, m.source)
         m.song_id, m.platform, m.metric, m.source, m.metric_date, m.value
    FROM public.artist_song_metrics_daily m
   ORDER BY m.song_id, m.platform, m.metric, m.source, m.metric_date DESC
)
SELECT
  s.id                AS song_id,
  s.company_id,
  a.id                AS artist_id,
  a.name              AS artist_name,
  a.roster_type,
  s.is_reference,
  s.title,
  s.release_date,
  CASE WHEN s.release_date IS NOT NULL
       THEN GREATEST((CURRENT_DATE - s.release_date), 0) END          AS dias_desde_lancamento,
  COALESCE(tt.value, ttm.value)                                       AS tiktok_videos_latest,
  CASE WHEN tt.value IS NOT NULL THEN 'aggregator'
       WHEN ttm.value IS NOT NULL THEN 'manual' END                   AS tiktok_videos_source,
  COALESCE(tt.metric_date, ttm.metric_date)                           AS tiktok_videos_date,
  CASE WHEN COALESCE(tt.value, ttm.value) IS NOT NULL
        AND s.release_date IS NOT NULL
        AND (CURRENT_DATE - s.release_date) > 0
       THEN round(COALESCE(tt.value, ttm.value) / (CURRENT_DATE - s.release_date), 2) END
                                                                      AS tiktok_videos_por_dia,
  ig.value                                                            AS instagram_reels_latest,
  ig.metric_date                                                      AS instagram_reels_date,
  sp.value                                                            AS spotify_streams_latest,
  sp.metric_date                                                      AS spotify_streams_date,
  CASE WHEN sp.value IS NOT NULL
        AND s.release_date IS NOT NULL
        AND (CURRENT_DATE - s.release_date) > 0
       THEN round(sp.value / (CURRENT_DATE - s.release_date), 2) END   AS spotify_streams_por_dia
FROM public.artist_songs s
JOIN public.artists a ON a.id = s.artist_id
LEFT JOIN latest tt  ON tt.song_id  = s.id AND tt.platform  = 'tiktok'
                    AND tt.metric   = 'videos'     AND tt.source  = 'aggregator'
LEFT JOIN latest ttm ON ttm.song_id = s.id AND ttm.platform = 'tiktok'
                    AND ttm.metric  = 'ugc_videos' AND ttm.source = 'manual'
LEFT JOIN latest ig  ON ig.song_id  = s.id AND ig.platform  = 'instagram' AND ig.metric = 'reels'
LEFT JOIN latest sp  ON sp.song_id  = s.id AND sp.platform  = 'spotify'   AND sp.metric = 'streams'
WHERE COALESCE(s.tracking_status, '') <> 'arquivado';

GRANT SELECT ON public.v_song_ugc_benchmark TO authenticated;
GRANT SELECT ON public.v_song_ugc_benchmark TO service_role;