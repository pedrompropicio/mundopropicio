-- #308: origens com contagem e listas (último snapshot) para o ecrã Contactos.
-- SECURITY INVOKER: respeitam a RLS de contacts/audiences do utilizador.
CREATE OR REPLACE FUNCTION public.crm_contact_sources()
 RETURNS TABLE(source text, n bigint)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT c.source, count(*)::bigint
    FROM public.contacts c
   WHERE c.company_id = public.current_company_id()
   GROUP BY c.source
   ORDER BY count(*) DESC, c.source
$$;

CREATE OR REPLACE FUNCTION public.crm_audience_lists()
 RETURNS TABLE(audience_id uuid, name text, snapshot_id uuid, member_count integer, captured_at timestamptz)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT a.id, a.name, s.id, s.member_count, s.captured_at
    FROM public.audiences a
    LEFT JOIN LATERAL (
      SELECT id, member_count, captured_at FROM public.audience_snapshots
       WHERE audience_id = a.id ORDER BY captured_at DESC, id DESC LIMIT 1
    ) s ON true
   WHERE a.company_id = public.current_company_id()
   ORDER BY a.name
$$;

REVOKE ALL ON FUNCTION public.crm_contact_sources() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_audience_lists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_contact_sources() TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_audience_lists() TO authenticated;

-- Segurança: SELECT abertos (USING true) em audiências.
DROP POLICY IF EXISTS audiences_select ON public.audiences;
DROP POLICY IF EXISTS audience_snapshots_select ON public.audience_snapshots;
DROP POLICY IF EXISTS audience_members_select ON public.audience_members;