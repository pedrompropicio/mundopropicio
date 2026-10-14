-- D-ERP259 adenda: empresas visíveis na Gestão Artística por acesso por artista
-- (não altera RLS de companies; expõe só campos de branding).
CREATE OR REPLACE FUNCTION public.my_artist_companies()
RETURNS TABLE(id uuid, display_name text, slug text, logo_url text, theme_config jsonb, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id, c.display_name::text, c.slug::text, c.logo_url::text, c.theme_config::jsonb, c.status::text
  FROM public.companies c
  WHERE c.id IN (SELECT DISTINCT m.company_id FROM public.my_artist_access() m)
  ORDER BY c.display_name;
$$;
REVOKE ALL ON FUNCTION public.my_artist_companies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_artist_companies() TO authenticated;