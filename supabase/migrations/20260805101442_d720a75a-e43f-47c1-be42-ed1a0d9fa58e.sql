CREATE OR REPLACE VIEW public.blog_posts_public AS
SELECT id, slug, title_pt, title_en, content_pt, content_en, excerpt_pt, excerpt_en,
       cover_image, published_at, created_at, updated_at, company_id
FROM public.blog_posts
WHERE portal_visible = true AND published = true;

CREATE OR REPLACE VIEW public.static_pages_public AS
SELECT slug, locale, title, content_md, meta_title, meta_description, og_image_url,
       published_at, updated_at, company_id
FROM public.static_pages
WHERE status = 'published'::text AND published_at IS NOT NULL;

GRANT SELECT ON public.blog_posts_public TO anon, authenticated;
GRANT SELECT ON public.static_pages_public TO anon, authenticated;