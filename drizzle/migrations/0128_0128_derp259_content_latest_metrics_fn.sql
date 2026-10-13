-- D-ERP259 adenda: avaliar acesso uma vez por pedido (não por linha) nas métricas de conteúdos.
-- Mesmo âmbito que as políticas RESTRICTIVE (artist_scope_select + company_isolation).
CREATE OR REPLACE FUNCTION public._content_latest_metrics()
RETURNS TABLE(content_id uuid, metric text, metric_date date, value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ok_artists AS (SELECT array_agg(id) a FROM public.artist_readable_ids() id),
       ok_companies AS (
         SELECT CASE WHEN public.is_platform_admin(auth.uid()) THEN NULL
                ELSE coalesce(array_agg(DISTINCT ur.company_id), '{}') END c,
                public.is_platform_admin(auth.uid()) pa
         FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  SELECT DISTINCT ON (m.content_id, m.metric) m.content_id, m.metric, m.metric_date, m.value
  FROM public.artist_content_metrics_daily m, ok_artists oa, ok_companies oc
  WHERE auth.uid() IS NOT NULL
    AND (oc.pa OR m.company_id = ANY (oc.c))
    AND (m.artist_id IS NULL OR m.artist_id = ANY (oa.a))
  ORDER BY m.content_id, m.metric, m.metric_date DESC
$$;
REVOKE ALL ON FUNCTION public._content_latest_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._content_latest_metrics() TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_content_latest
WITH (security_invoker = true) AS
WITH latest AS (SELECT * FROM public._content_latest_metrics())
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
    max(l.metric_date) AS last_metric_date,
    max(CASE WHEN l.metric = 'views' THEN l.value END) AS views,
    max(CASE WHEN l.metric = 'likes' THEN l.value END) AS likes,
    max(CASE WHEN l.metric = 'comments' THEN l.value END) AS comments,
    max(CASE WHEN l.metric = 'shares' THEN l.value END) AS shares
FROM public.artist_content c
LEFT JOIN latest l ON l.content_id = c.id
LEFT JOIN public.artist_songs s ON s.id = c.song_id
GROUP BY c.id, s.title;