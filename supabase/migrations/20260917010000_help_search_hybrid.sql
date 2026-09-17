-- Manual de Orientação — pesquisa híbrida com citações e gestão de lacunas.
ALTER TABLE public.help_questions
  ADD COLUMN status text NOT NULL DEFAULT 'aberta',
  ADD COLUMN resolved_note text,
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolved_by uuid REFERENCES auth.users(id),
  ADD CONSTRAINT help_questions_status_check CHECK (status IN ('aberta', 'coberta', 'ignorada'));

GRANT UPDATE ON public.help_questions TO authenticated;
CREATE POLICY "help_questions_update_admin" ON public.help_questions
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin'));

CREATE OR REPLACE FUNCTION public.help_search_chunks(
  query_embedding extensions.vector(3072), query_text text,
  match_count int DEFAULT 8, user_profile text DEFAULT NULL
)
RETURNS TABLE(chunk_id uuid, section_anchor text, section_heading text,
  article_slug text, article_title text, content text, score double precision)
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
  SELECT c.id, s.anchor_id, s.heading, a.slug, a.title, c.content,
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
IS 'Pesquisa híbrida: top 20 semântico + top 20 lexical, RRF k=60; score é a similaridade de cosseno.';

-- Pós-Publish: confirmar anon=false, authenticated=true, service_role=true.
-- SELECT has_function_privilege('anon','public.help_search_chunks(extensions.vector,text,int,text)','EXECUTE'),
-- has_function_privilege('authenticated','public.help_search_chunks(extensions.vector,text,int,text)','EXECUTE'),
-- has_function_privilege('service_role','public.help_search_chunks(extensions.vector,text,int,text)','EXECUTE');
