CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.help_articles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text NOT NULL UNIQUE,
  title        text NOT NULL,
  module       text NOT NULL,
  updated_on   date NOT NULL,
  profiles     text[] NOT NULL DEFAULT '{}',
  routes       text[] NOT NULL DEFAULT '{}',
  sources      text[] NOT NULL DEFAULT '{}',
  content_md   text NOT NULL,
  content_hash text NOT NULL,
  synced_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.help_articles IS 'Conteúdo do Manual de Orientação — global por desenho, sem company_id; fonte = docs/manual/*.md via manual-sync.';
GRANT SELECT ON public.help_articles TO authenticated;
GRANT ALL ON public.help_articles TO service_role;
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_articles_select" ON public.help_articles FOR SELECT TO authenticated USING (true);

CREATE TABLE public.help_sections (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.help_articles(id) ON DELETE CASCADE,
  anchor_id  text NOT NULL UNIQUE,
  heading    text NOT NULL,
  position   int NOT NULL,
  tooltip    text,
  screens    text[] NOT NULL DEFAULT '{}',
  profiles   text[] NOT NULL DEFAULT '{}',
  sources    text[] NOT NULL DEFAULT '{}',
  body_md    text NOT NULL
);
COMMENT ON TABLE public.help_sections IS 'Conteúdo do Manual de Orientação — global por desenho, sem company_id; fonte = docs/manual/*.md via manual-sync.';
CREATE INDEX help_sections_article_idx ON public.help_sections (article_id, position);
GRANT SELECT ON public.help_sections TO authenticated;
GRANT ALL ON public.help_sections TO service_role;
ALTER TABLE public.help_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_sections_select" ON public.help_sections FOR SELECT TO authenticated USING (true);

CREATE TABLE public.help_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL REFERENCES public.help_sections(id) ON DELETE CASCADE,
  position    int NOT NULL,
  content     text NOT NULL,
  search_text tsvector,
  embedding   extensions.vector(3072)
);
COMMENT ON TABLE public.help_chunks IS 'Conteúdo do Manual de Orientação — global por desenho, sem company_id; fonte = docs/manual/*.md via manual-sync.';
COMMENT ON COLUMN public.help_chunks.search_text IS 'Preenchida pela função de sync com to_tsvector(''portuguese'', unaccent(...)) — não é coluna gerada porque unaccent não é imutável.';
CREATE INDEX help_chunks_section_idx ON public.help_chunks (section_id, position);
CREATE INDEX help_chunks_search_idx ON public.help_chunks USING GIN (search_text);
CREATE INDEX help_chunks_trgm_idx ON public.help_chunks USING GIN (content public.gin_trgm_ops);
CREATE INDEX help_chunks_embedding_idx ON public.help_chunks USING hnsw ((embedding::extensions.halfvec(3072)) extensions.halfvec_cosine_ops);
GRANT SELECT ON public.help_chunks TO authenticated;
GRANT ALL ON public.help_chunks TO service_role;
ALTER TABLE public.help_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_chunks_select" ON public.help_chunks FOR SELECT TO authenticated USING (true);

CREATE TABLE public.help_questions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  user_id          uuid NOT NULL DEFAULT auth.uid(),
  question         text NOT NULL,
  route            text,
  answered         boolean NOT NULL DEFAULT false,
  confidence       text CHECK (confidence IN ('alta','media','baixa')),
  cited_anchor_ids text[] NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX help_questions_company_idx ON public.help_questions (company_id, created_at DESC);
GRANT SELECT, INSERT ON public.help_questions TO authenticated;
GRANT ALL ON public.help_questions TO service_role;
ALTER TABLE public.help_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_questions_insert_self" ON public.help_questions FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "help_questions_select_admin" ON public.help_questions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin'));
CREATE POLICY "company_isolation_help_questions" ON public.help_questions AS RESTRICTIVE FOR ALL TO authenticated USING (public.row_belongs_to_current_company(company_id)) WITH CHECK (public.row_belongs_to_current_company(company_id));
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.help_questions FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

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
    INSERT INTO public.help_sections (article_id, anchor_id, heading, position, tooltip, screens, profiles, sources, body_md)
    VALUES (
      v_article_id,
      v_section->>'anchor_id',
      v_section->>'heading',
      (v_section->>'position')::int,
      NULLIF(v_section->>'tooltip',''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_section->'screens')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_section->'profiles')), '{}'),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_section->'sources')), '{}'),
      COALESCE(v_section->>'body_md','')
    ) RETURNING id INTO v_section_id;

    FOR v_chunk IN SELECT * FROM jsonb_array_elements(COALESCE(v_section->'chunks','[]'::jsonb))
    LOOP
      INSERT INTO public.help_chunks (section_id, position, content, search_text, embedding)
      VALUES (
        v_section_id,
        (v_chunk->>'position')::int,
        v_chunk->>'content',
        to_tsvector('portuguese', extensions.unaccent(COALESCE(v_chunk->>'content',''))),
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