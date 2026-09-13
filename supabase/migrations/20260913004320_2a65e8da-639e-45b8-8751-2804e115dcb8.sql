CREATE OR REPLACE FUNCTION public.get_partner_event_shares(p_event_id uuid)
RETURNS TABLE(partner_name text, percentage numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sup uuid;
  v_own numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_event_access(auth.uid(), p_event_id) THEN
    RETURN;
  END IF;

  IF public.is_settlement_staff(auth.uid()) THEN
    RETURN QUERY
      SELECT COALESCE(s.name, CASE WHEN p.participant_kind = 'house' THEN 'MUNDO PROPÍCIO' ELSE 'Sócio' END)::text,
             p.profit_pct::numeric
      FROM public.event_settlement_participants p
      LEFT JOIN public.suppliers s ON s.id = p.supplier_id
      WHERE p.event_id = p_event_id
        AND p.mode = 'settles'
      ORDER BY p.profit_pct DESC NULLS LAST, 1;
    RETURN;
  END IF;

  v_sup := public.user_supplier_id(auth.uid());
  IF v_sup IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(p.profit_pct), 0) INTO v_own
  FROM public.event_settlement_participants p
  WHERE p.event_id = p_event_id
    AND p.mode = 'settles'
    AND p.supplier_id = v_sup;

  IF v_own = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT COALESCE(s.name, 'Sócio')::text, p.profit_pct::numeric
    FROM public.event_settlement_participants p
    LEFT JOIN public.suppliers s ON s.id = p.supplier_id
    WHERE p.event_id = p_event_id
      AND p.mode = 'settles'
      AND p.supplier_id = v_sup;

  IF v_own < 100 THEN
    RETURN QUERY SELECT 'Sócios locais'::text, (100 - v_own)::numeric;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_partner_event_shares(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_partner_event_shares(uuid) TO authenticated, service_role;