ALTER TABLE public.press_clippings ADD COLUMN IF NOT EXISTS title text;

CREATE OR REPLACE VIEW public.press_clippings_public AS
 SELECT id,
    event_id,
    source,
    event_name,
    url,
    image,
    display_order,
    created_at,
    company_id,
    title
   FROM press_clippings
  WHERE portal_visible = true
  ORDER BY display_order, created_at DESC;