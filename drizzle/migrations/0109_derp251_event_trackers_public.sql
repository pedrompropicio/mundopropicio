CREATE VIEW public.event_trackers_public WITH (security_invoker = false) AS
SELECT t.event_id, e.slug AS event_slug, t.platform, t.tracker_id AS tracker_code
FROM public.event_trackers t
JOIN public.events e ON e.id = t.event_id
WHERE e.portal_visible = true AND e.slug IS NOT NULL;
COMMENT ON VIEW public.event_trackers_public IS 'Leitura pública (portal) dos trackers por evento; só eventos portal_visible com slug. Escrita nunca pelo portal.';
REVOKE ALL ON public.event_trackers_public FROM anon, authenticated;
GRANT SELECT ON public.event_trackers_public TO anon, authenticated;
GRANT ALL ON public.event_trackers_public TO service_role;