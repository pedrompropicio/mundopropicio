CREATE OR REPLACE FUNCTION public.get_partner_event_shares(p_event_id uuid)
RETURNS TABLE (partner_name text, percentage numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(s.name, 'Sócio')::text AS partner_name,
         ep.percentage::numeric
  FROM public.event_partners ep
  LEFT JOIN public.suppliers s ON s.id = ep.supplier_id
  WHERE ep.event_id = p_event_id
    AND auth.uid() IS NOT NULL
    AND public.user_has_event_access(auth.uid(), p_event_id)
  ORDER BY ep.percentage DESC NULLS LAST, s.name;
$$;

REVOKE ALL ON FUNCTION public.get_partner_event_shares(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_partner_event_shares(uuid) TO authenticated;