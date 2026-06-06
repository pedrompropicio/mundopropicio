-- ============================================================
-- M3.4 — View pública de páginas estáticas (06/06/26)
-- Expõe páginas com status='published' ao portal público (anon).
-- Multi-tenant filtra via current_company_id() na chamada SELECT.
-- ============================================================

CREATE OR REPLACE VIEW public.static_pages_public AS
SELECT 
  slug,
  locale,
  title,
  content_md,
  meta_title,
  meta_description,
  og_image_url,
  published_at,
  updated_at
FROM public.static_pages
WHERE status = 'published'
  AND published_at IS NOT NULL;

COMMENT ON VIEW public.static_pages_public IS 'View pública de static_pages com status=published. Filtragem por company_id via current_company_id() no caller.';

GRANT SELECT ON public.static_pages_public TO anon, authenticated;
