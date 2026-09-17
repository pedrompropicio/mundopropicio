ALTER TABLE public.help_questions
  ADD COLUMN IF NOT EXISTS max_cosine numeric,
  ADD COLUMN IF NOT EXISTS lexical_hits integer;

COMMENT ON COLUMN public.help_questions.max_cosine IS 'Maior similaridade de cosseno entre a pergunta e os pedacos devolvidos (diagnostico).';
COMMENT ON COLUMN public.help_questions.lexical_hits IS 'Numero de pedacos devolvidos com acerto no full-text (diagnostico).';

DROP FUNCTION IF EXISTS public.help_search_chunks(extensions.vector, text, int, text);

CREATE FUNCTION public.help_search_chunks(
  query_embedding extensions.vector(3072), query_text text,
  match_count int DEFAULT 8, user_profile text DEFAULT NULL
)
RETURNS TABLE(chunk_id uuid, section_anchor text, section_heading text,
  article_slug text, article_title text, content text, section_terms text[],
  score double precision, lexical_rank int, cosine double precision)
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
        similarity(extensions.unaccent(c.content), extensions.unaccent(query_text)) DESC)::int lexical_rank
    FROM public.help_chunks c
    JOIN public.help_sections s ON s.id = c.section_id
    WHERE (cardinality(s.profiles) = 0 OR user_profile = ANY(s.profiles))
      AND (c.search_text @@ websearch_to_tsquery('portuguese', extensions.unaccent(query_text))
        OR c.search_text @@ plainto_tsquery('portuguese', extensions.unaccent(query_text))
        OR similarity(extensions.unaccent(c.content), extensions.unaccent(query_text)) > 0.08)
    ORDER BY ts_rank_cd(c.search_text, websearch_to_tsquery('portuguese', extensions.unaccent(query_text))) DESC,
      similarity(extensions.unaccent(c.content), extensions.unaccent(query_text)) DESC
    LIMIT 20
  ), fused AS (
    SELECT COALESCE(s.id, l.id) id,
      COALESCE(1.0 / (60 + s.semantic_rank), 0) + COALESCE(1.0 / (60 + l.lexical_rank), 0) rrf_score,
      s.cosine_similarity,
      l.lexical_rank
    FROM semantic s FULL OUTER JOIN lexical l USING (id)
  )
  SELECT c.id, s.anchor_id, s.heading, a.slug, a.title, c.content, s.terms,
    f.rrf_score::double precision,
    f.lexical_rank,
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
GRANT EXECUTE ON FUNCTION public.help_search_chunks(extensions.vector, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.help_search_chunks(extensions.vector, text, int, text) TO service_role;