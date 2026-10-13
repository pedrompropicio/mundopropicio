-- D-ERP259 adenda: v_content_latest sem varrimento total de artist_content_metrics_daily.
-- Antes: DISTINCT ON sobre toda a tabela => RLS avaliada em ~73k linhas (timeout para externos).
-- Agora: LATERAL por conteúdo visível, leitura por índice (content_id, metric, metric_date, source).
-- Mesmas colunas; v_song_content depende desta vista e beneficia automaticamente.
CREATE OR REPLACE VIEW public.v_content_latest
WITH (security_invoker = true) AS
SELECT c.id AS content_id,
    c.company_id,
    c.artist_id,
    c.platform,
    c.source,
    c.song_id,
    c.song_link_status,
    c.song_link_reason,
    s.title AS song_title,
    COALESCE(c.title, c.caption_excerpt) AS title,
    c.content_type,
    c.published_at,
    c.permalink,
    c.thumbnail_url,
    c.sound_name,
    c.author_handle,
    c.duration_seconds,
    ld.metric_date AS last_metric_date,
    mv.value AS views,
    ml.value AS likes,
    mc.value AS comments,
    ms.value AS shares
FROM public.artist_content c
LEFT JOIN public.artist_songs s ON s.id = c.song_id
LEFT JOIN LATERAL (
  SELECT m.metric_date FROM public.artist_content_metrics_daily m
  WHERE m.content_id = c.id ORDER BY m.metric_date DESC LIMIT 1) ld ON true
LEFT JOIN LATERAL (
  SELECT m.value FROM public.artist_content_metrics_daily m
  WHERE m.content_id = c.id AND m.metric = 'views'
  ORDER BY m.metric_date DESC, m.value DESC LIMIT 1) mv ON true
LEFT JOIN LATERAL (
  SELECT m.value FROM public.artist_content_metrics_daily m
  WHERE m.content_id = c.id AND m.metric = 'likes'
  ORDER BY m.metric_date DESC, m.value DESC LIMIT 1) ml ON true
LEFT JOIN LATERAL (
  SELECT m.value FROM public.artist_content_metrics_daily m
  WHERE m.content_id = c.id AND m.metric = 'comments'
  ORDER BY m.metric_date DESC, m.value DESC LIMIT 1) mc ON true
LEFT JOIN LATERAL (
  SELECT m.value FROM public.artist_content_metrics_daily m
  WHERE m.content_id = c.id AND m.metric = 'shares'
  ORDER BY m.metric_date DESC, m.value DESC LIMIT 1) ms ON true;