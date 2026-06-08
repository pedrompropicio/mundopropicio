CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_active uuid;
  v_company uuid;
  v_is_pa boolean;
  v_has_active_membership boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT active_company_id, company_id INTO v_active, v_company
    FROM public.profiles WHERE id = v_uid;

  SELECT EXISTS(SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role = 'platform_admin'::app_role) INTO v_is_pa;

  -- 1) active_company_id válido (platform_admin OU user tem membership lá)
  IF v_active IS NOT NULL THEN
    IF v_is_pa THEN
      RETURN v_active;
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.user_roles
      WHERE user_id = v_uid AND company_id = v_active) INTO v_has_active_membership;
    IF v_has_active_membership THEN RETURN v_active; END IF;
  END IF;

  -- 2) fallback: profiles.company_id se ainda tem membership lá
  IF v_company IS NOT NULL THEN
    IF v_is_pa OR EXISTS(SELECT 1 FROM public.user_roles
        WHERE user_id = v_uid AND company_id = v_company) THEN
      RETURN v_company;
    END IF;
  END IF;

  -- 3) fallback: primeira empresa onde tem membership
  RETURN (SELECT ur.company_id FROM public.user_roles ur
    JOIN public.companies c ON c.id = ur.company_id
    WHERE ur.user_id = v_uid AND c.status='active'
    ORDER BY ur.id LIMIT 1);
END;
$function$;