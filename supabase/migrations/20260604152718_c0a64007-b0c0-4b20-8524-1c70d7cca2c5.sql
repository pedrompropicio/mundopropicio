-- Sprint 3 Fase 0.1: Tabelas blog_posts e press_clippings em sfohvvlq
-- para receber dados migrados do portal antigo (zjseklogascfwqjoocbl).

-- ============================================================
-- blog_posts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  slug text NOT NULL,
  title_pt text NOT NULL,
  title_en text NOT NULL,
  content_pt text NOT NULL DEFAULT '',
  content_en text NOT NULL DEFAULT '',
  excerpt_pt text,
  excerpt_en text,
  cover_image text,
  published boolean NOT NULL DEFAULT false,
  portal_visible boolean NOT NULL DEFAULT false,
  author_id uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_posts_slug_per_company UNIQUE (company_id, slug)
);

CREATE INDEX IF NOT EXISTS blog_posts_company_id_idx ON public.blog_posts(company_id);
CREATE INDEX IF NOT EXISTS blog_posts_portal_visible_idx ON public.blog_posts(portal_visible) WHERE portal_visible = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts TO service_role;

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Blog posts viewable by authenticated users"
  ON public.blog_posts FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Blog posts insertable by privileged roles"
  ON public.blog_posts FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Blog posts updatable by privileged roles"
  ON public.blog_posts FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Blog posts deletable by admin only"
  ON public.blog_posts FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company_isolation_blog_posts"
  ON public.blog_posts AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE OR REPLACE VIEW public.blog_posts_public
WITH (security_invoker=false) AS
SELECT
  id, slug, title_pt, title_en, content_pt, content_en,
  excerpt_pt, excerpt_en, cover_image, published_at, created_at, updated_at
FROM public.blog_posts
WHERE portal_visible = true AND published = true;

GRANT SELECT ON public.blog_posts_public TO anon, authenticated;


-- ============================================================
-- press_clippings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.press_clippings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  source text NOT NULL,
  event_name text NOT NULL,
  url text NOT NULL,
  image text,
  display_order integer DEFAULT 0,
  portal_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS press_clippings_company_id_idx ON public.press_clippings(company_id);
CREATE INDEX IF NOT EXISTS press_clippings_event_id_idx ON public.press_clippings(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS press_clippings_display_order_idx ON public.press_clippings(display_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.press_clippings TO authenticated;
GRANT ALL ON public.press_clippings TO service_role;

ALTER TABLE public.press_clippings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Press clippings viewable by authenticated users"
  ON public.press_clippings FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Press clippings insertable by privileged roles"
  ON public.press_clippings FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Press clippings updatable by privileged roles"
  ON public.press_clippings FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Press clippings deletable by admin only"
  ON public.press_clippings FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company_isolation_press_clippings"
  ON public.press_clippings AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE OR REPLACE VIEW public.press_clippings_public
WITH (security_invoker=false) AS
SELECT
  id, event_id, source, event_name, url, image, display_order, created_at
FROM public.press_clippings
WHERE portal_visible = true
ORDER BY display_order, created_at DESC;

GRANT SELECT ON public.press_clippings_public TO anon, authenticated;


-- ============================================================
-- Trigger updated_at em blog_posts
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_blog_posts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_blog_posts();