-- 0133 (D-ERP263 complemento) — lat/lon nos ranges DB-IP + vista de distância das blitz.
ALTER TABLE public.ip_city_ranges ADD COLUMN IF NOT EXISTS lat numeric, ADD COLUMN IF NOT EXISTS lon numeric;

DROP FUNCTION IF EXISTS public.ip_city_lookup(inet);
CREATE FUNCTION public.ip_city_lookup(ip inet)
RETURNS TABLE(country text, region text, city text, lat numeric, lon numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.country, r.region, r.city, r.lat, r.lon
  FROM (
    SELECT c.country, c.region, c.city, c.lat, c.lon, c.ip_to FROM public.ip_city_ranges c
    WHERE c.ip_from <= ip_city_lookup.ip
    ORDER BY c.ip_from DESC, c.source_month DESC
    LIMIT 1
  ) r
  WHERE r.ip_to >= ip_city_lookup.ip AND family(r.ip_to) = family(ip_city_lookup.ip);
$$;
REVOKE ALL ON FUNCTION public.ip_city_lookup(inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ip_city_lookup(inet) TO service_role;

-- Centroide por cidade (média de lat/lon dos ranges). Só nomes de cidade e coordenadas públicas — sem IPs.
CREATE OR REPLACE FUNCTION public.ip_city_centroids()
RETURNS TABLE(country text, region text, city text, lat numeric, lon numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT country, region, city, round(avg(lat), 5), round(avg(lon), 5)
  FROM public.ip_city_ranges
  WHERE city IS NOT NULL AND lat IS NOT NULL
    AND source_month = (SELECT max(source_month) FROM public.ip_city_ranges)
  GROUP BY 1, 2, 3;
$$;
REVOKE ALL ON FUNCTION public.ip_city_centroids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ip_city_centroids() TO authenticated, service_role;

-- Alvos por prefixo de campanha (só blitz_jp em uso; os outros ficam preparados).
CREATE OR REPLACE VIEW public.v_song_link_blitz_targets WITH (security_invoker = true) AS
SELECT * FROM (VALUES
  ('blitz_jp',  'João Pessoa', 'PB', -7.1195::numeric, -34.8450::numeric),
  ('blitz_for', 'Fortaleza',   'CE', -3.7319, -38.5267),
  ('blitz_arp', 'Arapiraca',   'AL', -9.7525, -36.6611),
  ('blitz_aju', 'Aracaju',     'SE', -10.9472, -37.0731),
  ('blitz_nat', 'Natal',       'RN', -5.7945, -35.2110),
  ('blitz_tou', 'Touros',      'RN', -5.1989, -35.4608)
) t(prefix, target_city, target_state, target_lat, target_lon);
GRANT SELECT ON public.v_song_link_blitz_targets TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_song_link_blitz_geo WITH (security_invoker = true) AS
SELECT e.id, e.created_at, e.event, e.utm_campaign, e.country, e.region, e.city,
       t.prefix, t.target_city, t.target_state,
       c.lat AS city_lat, c.lon AS city_lon,
       CASE WHEN c.lat IS NULL THEN NULL ELSE round((2 * 6371 * asin(sqrt(
         power(sin(radians((c.lat - t.target_lat) / 2)), 2) +
         cos(radians(t.target_lat)) * cos(radians(c.lat)) * power(sin(radians((c.lon - t.target_lon) / 2)), 2)
       )))::numeric, 1) END AS dist_km_alvo
FROM public.song_link_events e
JOIN public.v_song_link_blitz_targets t ON lower(e.utm_campaign) LIKE t.prefix || '%'
LEFT JOIN public.ip_city_centroids() c
  ON c.country = e.country AND c.region IS NOT DISTINCT FROM e.region AND c.city = e.city
WHERE e.utm_campaign ILIKE 'blitz\_%';
GRANT SELECT ON public.v_song_link_blitz_geo TO authenticated, service_role;
