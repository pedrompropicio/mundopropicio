-- 1) Colunas
ALTER TABLE public.artist_content
  ADD COLUMN IF NOT EXISTS song_link_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS song_link_reason text;

ALTER TABLE public.artist_content
  DROP CONSTRAINT IF EXISTS artist_content_song_link_status_check;
ALTER TABLE public.artist_content
  ADD CONSTRAINT artist_content_song_link_status_check
  CHECK (song_link_status IN ('none','estimated','confirmed','rejected'));

UPDATE public.artist_content
   SET song_link_status = 'confirmed',
       song_link_reason = COALESCE(song_link_reason, 'ligação existente antes da estimativa textual')
 WHERE song_id IS NOT NULL AND song_link_status = 'none';

-- 2) Normalizador de título
CREATE OR REPLACE FUNCTION public.artist_song_base_title(_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(extensions.unaccent(coalesce(_title, ''))), '\(.*$', '', 'g'),
        '\[.*$', '', 'g'
      ),
      '\s+-\s+.*$', '', 'g'
    )
  );
$$;

-- 3) Motor de ligação estimada
CREATE OR REPLACE FUNCTION public.artist_content_link_songs(
  p_artist_id uuid DEFAULT NULL,
  p_dry_run boolean DEFAULT true
)
RETURNS TABLE(content_id uuid, song_id uuid, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row record;
  v_match record;
  v_hits int;
  v_n int;
  v_reason text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _cand(base text, sid uuid, is_launch boolean, release_date date, how text) ON COMMIT DROP;

  FOR v_row IN
    SELECT c.id, c.artist_id, c.platform,
           lower(extensions.unaccent(coalesce(c.title, '') || ' ' || coalesce(c.caption_excerpt, ''))) AS hay
      FROM public.artist_content c
     WHERE c.song_id IS NULL
       AND c.song_link_status = 'none'
       AND (p_artist_id IS NULL OR c.artist_id = p_artist_id)
  LOOP
    DELETE FROM _cand;

    INSERT INTO _cand(base, sid, is_launch, release_date, how)
    SELECT b.base, b.id, b.is_launch, b.release_date,
           CASE WHEN position(b.base in v_row.hay) > 0 THEN 'menção' ELSE 'hashtag' END
      FROM (
        SELECT s.id, s.is_launch, s.release_date,
               public.artist_song_base_title(s.title) AS base
          FROM public.artist_songs s
         WHERE s.artist_id = v_row.artist_id
           AND coalesce(s.tracking_status, '') <> 'arquivado'
      ) b
     WHERE length(b.base) >= 4
       AND (
         position(b.base in v_row.hay) > 0
         OR position('#' || replace(b.base, ' ', '') in v_row.hay) > 0
       );

    SELECT count(DISTINCT base) INTO v_hits FROM _cand;

    IF v_hits = 0 THEN
      CONTINUE;
    ELSIF v_hits > 1 THEN
      RETURN QUERY SELECT v_row.id, NULL::uuid,
        'ambíguo: ' || (SELECT string_agg(DISTINCT base, ' | ') FROM _cand);
      CONTINUE;
    END IF;

    SELECT c.sid, c.base, c.how
      INTO v_match
      FROM _cand c
     ORDER BY c.is_launch DESC NULLS LAST, c.release_date ASC NULLS LAST
     LIMIT 1;

    SELECT count(*) INTO v_n FROM _cand;
    IF v_n > 1 THEN
      IF (SELECT count(*) FROM _cand c
           WHERE coalesce(c.is_launch,false) = (SELECT coalesce(max(is_launch::int),0)::boolean FROM _cand)
             AND c.release_date IS NOT DISTINCT FROM (
                 SELECT min(release_date) FROM _cand
                  WHERE coalesce(is_launch,false) = (SELECT coalesce(max(is_launch::int),0)::boolean FROM _cand))
         ) > 1 THEN
        RETURN QUERY SELECT v_row.id, NULL::uuid,
          'ambíguo: várias versões de "' || v_match.base || '" sem critério de desempate';
        CONTINUE;
      END IF;
    END IF;

    v_reason := v_match.how || ' ''' || v_match.base || ''' na descrição';

    IF NOT p_dry_run THEN
      UPDATE public.artist_content
         SET song_id = v_match.sid,
             song_link_status = 'estimated',
             song_link_reason = v_reason,
             updated_at = now()
       WHERE id = v_row.id;
    END IF;

    RETURN QUERY SELECT v_row.id, v_match.sid, v_reason;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.artist_content_link_songs(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_content_link_songs(uuid, boolean) TO authenticated, service_role;

-- 4) Confirmar / rejeitar / definir à mão
CREATE OR REPLACE FUNCTION public.artist_content_set_song(
  p_content_id uuid,
  p_song_id uuid DEFAULT NULL,
  p_status text DEFAULT 'confirmed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old record;
  v_song_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'admin')
           OR public.has_role(auth.uid(), 'manager')
           OR public.has_role(auth.uid(), 'marketing_manager')
           OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'sem permissão para alterar a ligação vídeo→música';
  END IF;

  IF p_status NOT IN ('none','estimated','confirmed','rejected') THEN
    RAISE EXCEPTION 'estado inválido: %', p_status;
  END IF;

  SELECT id, artist_id, song_id, song_link_status, song_link_reason
    INTO v_old
    FROM public.artist_content
   WHERE id = p_content_id;

  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'vídeo não encontrado';
  END IF;

  IF p_status IN ('rejected','none') THEN
    v_song_id := NULL;
  ELSE
    v_song_id := COALESCE(p_song_id, v_old.song_id);
    IF v_song_id IS NULL THEN
      RAISE EXCEPTION 'estado % exige uma música', p_status;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.artist_songs s
       WHERE s.id = v_song_id AND s.artist_id = v_old.artist_id
    ) THEN
      RAISE EXCEPTION 'a música não pertence a este artista';
    END IF;
  END IF;

  UPDATE public.artist_content
     SET song_id = v_song_id,
         song_link_status = p_status,
         song_link_reason = CASE
           WHEN p_status = 'confirmed' THEN 'confirmado manualmente'
           WHEN p_status = 'rejected' THEN 'rejeitado manualmente'
           WHEN p_status = 'none' THEN NULL
           ELSE song_link_reason
         END,
         updated_at = now()
   WHERE id = p_content_id;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, metadata)
  VALUES ('artist_content', p_content_id::text, 'set_song',
          COALESCE(auth.uid()::text, 'service_role'),
          jsonb_build_object(
            'old_song_id', v_old.song_id,
            'old_status', v_old.song_link_status,
            'new_song_id', v_song_id,
            'new_status', p_status
          ));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.artist_content_set_song(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_content_set_song(uuid, uuid, text) TO authenticated, service_role;

-- 5) Views (recriadas na ordem de dependência; v_artist_content_ranking reposta igual + estado)
DROP VIEW IF EXISTS public.v_song_content;
DROP VIEW IF EXISTS public.v_artist_content_ranking;
DROP VIEW IF EXISTS public.v_content_latest;

CREATE VIEW public.v_content_latest AS
 WITH latest AS (
         SELECT DISTINCT ON (m.content_id, m.metric) m.content_id,
            m.metric,
            m.metric_date,
            m.value
           FROM artist_content_metrics_daily m
          ORDER BY m.content_id, m.metric, m.metric_date DESC
        )
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
    max(CASE WHEN (l.metric = 'views'::text) THEN l.value ELSE NULL::numeric END) AS views,
    max(CASE WHEN (l.metric = 'likes'::text) THEN l.value ELSE NULL::numeric END) AS likes,
    max(CASE WHEN (l.metric = 'comments'::text) THEN l.value ELSE NULL::numeric END) AS comments,
    max(CASE WHEN (l.metric = 'shares'::text) THEN l.value ELSE NULL::numeric END) AS shares
   FROM ((artist_content c
     LEFT JOIN latest l ON ((l.content_id = c.id)))
     LEFT JOIN artist_songs s ON ((s.id = c.song_id)))
  GROUP BY c.id, s.title;

CREATE VIEW public.v_artist_content_ranking AS
 SELECT v.company_id,
    v.artist_id,
    v.platform,
    v.content_id,
    v.title,
    v.song_id,
    v.song_title,
    v.song_link_status,
    v.published_at,
    v.permalink,
    v.thumbnail_url,
    v.sound_name,
    v.views,
    v.likes,
    v.comments,
    v.shares,
    g.delta_7d AS views_delta_7d,
    row_number() OVER (PARTITION BY v.artist_id, v.platform ORDER BY v.views DESC NULLS LAST) AS rank_views,
    row_number() OVER (PARTITION BY v.artist_id, v.platform ORDER BY g.delta_7d DESC NULLS LAST) AS rank_growth_7d
   FROM (v_content_latest v
     LEFT JOIN v_content_growth g ON (((g.content_id = v.content_id) AND (g.metric = 'views'::text))));

CREATE VIEW public.v_song_content AS
 SELECT s.id AS song_id,
    s.company_id,
    s.artist_id,
    s.title AS song_title,
    v.platform,
    count(*) AS videos,
    count(*) FILTER (WHERE v.song_link_status = 'confirmed') AS videos_confirmed,
    count(*) FILTER (WHERE v.song_link_status = 'estimated') AS videos_estimated,
    sum(COALESCE(v.views, (0)::numeric)) AS total_views,
    sum(COALESCE(v.likes, (0)::numeric)) AS total_likes,
    sum(COALESCE(v.comments, (0)::numeric)) AS total_comments,
    sum(COALESCE(v.shares, (0)::numeric)) AS total_shares,
    sum(COALESCE(v.views, (0)::numeric)) FILTER (WHERE v.song_link_status = 'confirmed') AS total_views_confirmed,
    sum(COALESCE(v.views, (0)::numeric)) FILTER (WHERE v.song_link_status = 'estimated') AS total_views_estimated,
    sum(COALESCE(v.likes, (0)::numeric)) FILTER (WHERE v.song_link_status = 'confirmed') AS total_likes_confirmed,
    sum(COALESCE(v.likes, (0)::numeric)) FILTER (WHERE v.song_link_status = 'estimated') AS total_likes_estimated
   FROM (artist_songs s
     JOIN v_content_latest v ON ((v.song_id = s.id)))
  GROUP BY s.id, s.company_id, s.artist_id, s.title, v.platform;