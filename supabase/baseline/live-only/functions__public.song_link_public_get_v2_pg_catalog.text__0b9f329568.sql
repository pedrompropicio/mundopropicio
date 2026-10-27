-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.song_link_public_get_v2(pg_catalog.text)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "bdfcb5db0abd3a7765002ce92b5bcceb740a7d9314f68ce7b8b16e24a868932d", "live_properties_sha256": "2f57dfbd785e154c470ca6ca69cc7ef6191945359e26514d197e5887e4e95b31", "oid": 353889, "review": [6431939022, 6433564033, 6441951637], "rule": "live_only_tail", "source_sql_sha256": "9314de729c0f7d26352e9e9bfbcb31a097036d8dc7a42dc1e624859d26c0e890", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION c2fefb619adc3a1f839eae87e41c98a9bb8bef22d0185cad0d1948535625fc12
CREATE OR REPLACE FUNCTION public.song_link_public_get_v2(p_slug text)
 RETURNS TABLE(slug text, default_mode text, title text, cover_url text, destinations jsonb, meta_pixel_id text, active boolean, tiktok_pixel_id text, artist_line text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select l.slug, l.default_mode, l.title, l.cover_url, l.destinations, l.meta_pixel_id, l.active, l.tiktok_pixel_id, l.artist_line
  from public.song_links l
  where l.slug = lower(btrim(coalesce(p_slug,''))) and l.active
$function$
;

ALTER FUNCTION public.song_link_public_get_v2(pg_catalog.text) OWNER TO "postgres";
-- END OPERATION c2fefb619adc3a1f839eae87e41c98a9bb8bef22d0185cad0d1948535625fc12
