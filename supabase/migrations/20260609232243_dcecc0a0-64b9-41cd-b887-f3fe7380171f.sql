-- Funcionalidade B (fase 1): colunas de cupão VIP por evento + view pública

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS vip_coupon_code text,
  ADD COLUMN IF NOT EXISTS vip_coupon_discount_label text,
  ADD COLUMN IF NOT EXISTS vip_coupon_valid_until timestamptz;

-- Recriar events_public preservando colunas existentes e adicionando 3 novas no fim.
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
    COALESCE(em.hero_image_url, e.hero_image_url) AS hero_image_url,
    e.poster_image_url,
    e.venue_map_url,
    e.venue_directions_url,
    e.ticketing_url,
    e.meta_pixel_id,
    e.portal_featured AS featured,
    e.date < CURRENT_DATE AS is_past,
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
    em.event_id IS NOT NULL AS has_marketing,
    e.company_id AS portal_company_id,
    NULL::text AS endorsement_partner_label,
    0 AS endorsement_display_order,
    false AS is_endorsement,
    em.hero_video_url,
    em.music_embed_url,
    em.ticket_experiences,
    e.vip_coupon_code,
    e.vip_coupon_discount_label,
    e.vip_coupon_valid_until
FROM public.events e
LEFT JOIN public.event_marketing em
       ON em.event_id = e.id AND em.status = 'published'
WHERE e.portal_visible = true AND e.slug IS NOT NULL

UNION ALL

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
    COALESCE(ep.override_hero_image_url, em.hero_image_url, e.hero_image_url) AS hero_image_url,
    e.poster_image_url,
    e.venue_map_url,
    e.venue_directions_url,
    e.ticketing_url,
    e.meta_pixel_id,
    ep.featured,
    e.date < CURRENT_DATE AS is_past,
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
    em.event_id IS NOT NULL AS has_marketing,
    ep.portal_company_id,
    ep.partner_label AS endorsement_partner_label,
    ep.display_order AS endorsement_display_order,
    true AS is_endorsement,
    em.hero_video_url,
    em.music_embed_url,
    em.ticket_experiences,
    e.vip_coupon_code,
    e.vip_coupon_discount_label,
    e.vip_coupon_valid_until
FROM public.event_portal_endorsements ep
JOIN public.events e ON e.id = ep.event_id
LEFT JOIN public.event_marketing em
       ON em.event_id = e.id AND em.status = 'published'
WHERE e.slug IS NOT NULL;

GRANT SELECT ON public.events_public TO anon, authenticated;
