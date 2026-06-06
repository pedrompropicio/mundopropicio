-- ============================================================
-- M2 — events_public LEFT JOIN event_marketing (05/06/26)
-- Subset b: fallbacks para events operacional quando event_marketing
-- não tem registo publicado. Mantém as 17 cols originais + adiciona
-- 22 cols novas no fim (compatível com CREATE OR REPLACE VIEW).
-- ============================================================

CREATE OR REPLACE VIEW public.events_public AS
SELECT
    e.id,
    e.slug,
    COALESCE(e.title_pt, e.name) AS title_pt,
    COALESCE(e.title_en, e.name) AS title_en,
    e.description_pt,
    e.description_en,
    COALESCE(e.location_pt, e.location) AS location_pt,
    COALESCE(e.location_en, e.location) AS location_en,
    e.date,
    -- Hero: marketing curado prevalece, fallback operacional
    COALESCE(em.hero_image_url, e.hero_image_url) AS hero_image_url,
    e.poster_image_url,
    e.venue_map_url,
    e.venue_directions_url,
    e.ticketing_url,
    e.meta_pixel_id,
    e.portal_featured AS featured,
    e.date < CURRENT_DATE AS is_past,
    -- Novos campos de event_marketing (M2)
    em.hook_pt,
    em.hook_en,
    em.description_long_pt,
    em.description_long_en,
    em.meta_description_pt,
    em.meta_description_en,
    em.og_image_url,
    em.poster_vertical_url,
    em.gallery_urls,
    em.press_quote_pt,
    em.press_quote_en,
    em.press_quote_source,
    em.cta_primary_label_pt,
    em.cta_primary_label_en,
    em.urgency_message_pt,
    em.urgency_message_en,
    em.performer_name,
    em.performer_url,
    em.offer_price_min,
    em.offer_price_max,
    em.offer_currency,
    em.offer_availability,
    -- Flag para client logic
    (em.event_id IS NOT NULL) AS has_marketing
FROM public.events e
LEFT JOIN public.event_marketing em
    ON em.event_id = e.id
    AND em.status = 'published'
WHERE e.portal_visible = true
    AND e.slug IS NOT NULL;

COMMENT ON VIEW public.events_public IS 'View pública de eventos. LEFT JOIN com event_marketing publicado — degrade gracioso para campos operacionais quando marketing ainda não preencheu. has_marketing=false significa fallback total.';
