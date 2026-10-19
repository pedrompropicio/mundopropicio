-- #334 — registo do DDL aplicado em Live a 19/10/2026 pelo chat 2 (D-ERP287). Prova: 0 diferenças em 103 combinações país/cidade; resumo 28,4 s → 0,77 s.
-- Idempotente: em Live é no-op.
CREATE TABLE IF NOT EXISTS public.portugal_municipalities_ref (
  code text PRIMARY KEY,
  name text NOT NULL,
  region text,
  city_key text GENERATED ALWAYS AS (public.club_city_key(name)) STORED
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.portugal_municipalities_ref)
     AND to_regclass('public.portugal_municipalities') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
       WHERE r.ev_class = 'public.portugal_municipalities'::regclass
         AND d.refobjid = 'public.portugal_municipalities_ref'::regclass)
  THEN
    INSERT INTO public.portugal_municipalities_ref (code, name, region)
    SELECT code, name, region FROM public.portugal_municipalities
    ON CONFLICT (code) DO NOTHING;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS portugal_municipalities_ref_city_key_idx ON public.portugal_municipalities_ref (city_key);
ALTER TABLE public.portugal_municipalities_ref ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='portugal_municipalities_ref' AND policyname='portugal_municipalities_ref_read') THEN
    CREATE POLICY portugal_municipalities_ref_read ON public.portugal_municipalities_ref FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
REVOKE ALL ON public.portugal_municipalities_ref FROM anon, authenticated;
GRANT SELECT ON public.portugal_municipalities_ref TO anon, authenticated;
CREATE OR REPLACE VIEW public.portugal_municipalities WITH (security_invoker = true) AS
SELECT code, name, region FROM public.portugal_municipalities_ref;
CREATE OR REPLACE FUNCTION public.club_city_display(p_country text, p_city text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
  SELECT CASE WHEN upper(coalesce(nullif(btrim(p_country),''),'PT')) IN ('PT','PORTUGAL')
    THEN coalesce((SELECT min(name) FROM public.portugal_municipalities_ref WHERE city_key = public.club_city_key(p_city)), nullif(btrim(p_city),''))
    ELSE nullif(btrim(p_city),'') END
$$;