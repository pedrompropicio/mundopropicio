CREATE TABLE IF NOT EXISTS public.ip_geo_cache (
  ip text PRIMARY KEY,
  country text,
  city text,
  region text,
  resolved_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.ip_geo_cache FROM anon, authenticated, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_geo_cache TO service_role;
ALTER TABLE public.ip_geo_cache ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ip_geo_cache IS '#254: cache IP->geo do ipinfo (TTL 30d em _shared/geo.ts). Só service_role; sem policies.';