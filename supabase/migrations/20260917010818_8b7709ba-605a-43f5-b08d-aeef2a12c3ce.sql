-- Manual de Orientação — vocabulário da equipa (campo `termos` do bloco ```ajuda).
-- Os termos NÃO aparecem no artigo: servem para a pesquisa (search_text + embedding)
-- e para o prompt do help-search interpretar o calão da equipa.
--
-- ORDEM: aplicar DEPOIS de 20260917010000_help_search_hybrid.sql.

ALTER TABLE public.help_sections
  ADD COLUMN IF NOT EXISTS terms text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.help_sections.terms IS 'Vocabulário da equipa (sinónimos, calão, erros de escrita) indexado na pesquisa; nunca é mostrado no artigo.';

-- ---------------------------------------------------------------------------
-- help_sync_article: grava os termos e indexa-os no search_text dos pedaços.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.help_sync_article(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_slug text := _payload->>'slug';
  v_hash text := _payload->>'content_hash';
  v_existing record;
  v_article_id uuid;
  v_status text;
  v_section jsonb;
  v_chunk jsonb;
  v_section_id uuid;
  v_terms text[];
  v_chunks int := 0;
BEGIN
  IF v_slug IS NULL OR v_hash IS NULL THEN
    RAISE EXCEPTION 'help_sync_article: payload sem slug ou content_hash';
  END IF;

  SELECT id, content_hash INTO v_existing FROM public.help_articles WHERE slug = v_slug;

  IF v_existing.id IS NOT NULL AND v_existing.content_hash = v_hash THEN
    RETURN jsonb_build_object('slug', v_slug, 'status', 'unchanged', 'chunks', 0);
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.help_articles (slug, title, module, updated_on, profiles, routes, sources, content_md, content_hash)
    VALUES (
      v_slug,
      _payload->>'title',
      _payload->>'module',
      (_payload->>'updated_on')::date,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'profiles')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'routes')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'sources')), '{}'),
      _payload->>'content_md',
      v_hash
    ) RETURNING id INTO v_article_id;
    v_status := 'inserted';
  ELSE
    v_article_id := v_existing.id;
    UPDATE public.help_articles SET
      title = _payload->>'title',
      module = _payload->>'module',
      updated_on = (_payload->>'updated_on')::date,
      profiles = COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'profiles')), '{}'),
      routes = COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'routes')), '{}'),
      sources = COALESCE(ARRAY(SELECT jsonb_array_elements_text(_payload->'sources')), '{}'),
      content_md = _payload->>'content_md',
      content_hash = v_hash,
      synced_at = now()
    WHERE id = v_article_id;
    DELETE FROM public.help_sections WHERE article_id = v_article_id;
    v_status := 'updated';
  END IF;

  FOR v_section IN SELECT * FROM jsonb_array_elements(_payload->'sections')
  LOOP
    v_terms := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_section->'terms')), '{}');

    INSERT INTO public.help_sections (article_id, anchor_id, heading, position, tooltip, screens, profiles, sources, terms, body_md)
    VALUES (
      v_article_id,
      v_section->>'anchor_id',
      v_section->>'heading',
      (v_section->>'position')::int,
      NULLIF(v_section->>'tooltip',''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_section->'screens')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_section->'profiles')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_section->'sources')), '{}'),
      v_terms,
      COALESCE(v_section->>'body_md','')
    ) RETURNING id INTO v_section_id;

    FOR v_chunk IN SELECT * FROM jsonb_array_elements(COALESCE(v_section->'chunks','[]'::jsonb))
    LOOP
      INSERT INTO public.help_chunks (section_id, position, content, search_text, embedding)
      VALUES (
        v_section_id,
        (v_chunk->>'position')::int,
        v_chunk->>'content',
        to_tsvector(
          'portuguese',
          extensions.unaccent(
            COALESCE(v_chunk->>'content','') || ' ' || COALESCE(array_to_string(v_terms, ' '), '')
          )
        ),
        CASE WHEN v_chunk->>'embedding' IS NULL THEN NULL ELSE (v_chunk->>'embedding')::extensions.vector END
      );
      v_chunks := v_chunks + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('slug', v_slug, 'status', v_status, 'chunks', v_chunks);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.help_sync_article(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.help_sync_article(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_sync_article(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- help_search_chunks: passa a devolver os termos da secção (para o prompt).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.help_search_chunks(extensions.vector, text, int, text);

CREATE FUNCTION public.help_search_chunks(
  query_embedding extensions.vector(3072), query_text text,
  match_count int DEFAULT 8, user_profile text DEFAULT NULL
)
RETURNS TABLE(chunk_id uuid, section_anchor text, section_heading text,
  article_slug text, article_title text, content text, section_terms text[], score double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions AS $fn$
  WITH semantic AS (
    SELECT c.id,
      row_number() OVER (ORDER BY c.embedding::extensions.halfvec(3072) <=> query_embedding::extensions.halfvec(3072)) semantic_rank,
      1 - (c.embedding::extensions.halfvec(3072) <=> query_embedding::extensions.halfvec(3072)) cosine_similarity
    FROM public.help_chunks c
    JOIN public.help_sections s ON s.id = c.section_id
    WHERE c.embedding IS NOT NULL
      AND (cardinality(s.profiles) = 0 OR user_profile = ANY(s.profiles))
    ORDER BY c.embedding::extensions.halfvec(3072) <=> query_embedding::extensions.halfvec(3072)
    LIMIT 20
  ), lexical AS (
    SELECT c.id,
      row_number() OVER (ORDER BY ts_rank_cd(c.search_text, websearch_to_tsquery('portuguese', extensions.unaccent(query_text))) DESC,
        similarity(extensions.unaccent(c.content), extensions.unaccent(query_text)) DESC) lexical_rank
    FROM public.help_chunks c
    JOIN public.help_sections s ON s.id = c.section_id
    WHERE (cardinality(s.profiles) = 0 OR user_profile = ANY(s.profiles))
      AND (c.search_text @@ websearch_to_tsquery('portuguese', extensions.unaccent(query_text))
        OR similarity(extensions.unaccent(c.content), extensions.unaccent(query_text)) > 0.08)
    ORDER BY ts_rank_cd(c.search_text, websearch_to_tsquery('portuguese', extensions.unaccent(query_text))) DESC,
      similarity(extensions.unaccent(c.content), extensions.unaccent(query_text)) DESC
    LIMIT 20
  ), fused AS (
    SELECT COALESCE(s.id, l.id) id,
      COALESCE(1.0 / (60 + s.semantic_rank), 0) + COALESCE(1.0 / (60 + l.lexical_rank), 0) rrf_score,
      s.cosine_similarity
    FROM semantic s FULL OUTER JOIN lexical l USING (id)
  )
  SELECT c.id, s.anchor_id, s.heading, a.slug, a.title, c.content, s.terms,
    COALESCE(f.cosine_similarity, 0)::double precision
  FROM fused f
  JOIN public.help_chunks c ON c.id = f.id
  JOIN public.help_sections s ON s.id = c.section_id
  JOIN public.help_articles a ON a.id = s.article_id
  ORDER BY f.rrf_score DESC, f.cosine_similarity DESC NULLS LAST
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$fn$;

REVOKE EXECUTE ON FUNCTION public.help_search_chunks(extensions.vector, text, int, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.help_search_chunks(extensions.vector, text, int, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.help_search_chunks(extensions.vector, text, int, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.help_search_chunks(extensions.vector, text, int, text)
IS 'Pesquisa híbrida: top 20 semântico + top 20 lexical, RRF k=60; score é a similaridade de cosseno. Devolve os termos da secção para o prompt.';