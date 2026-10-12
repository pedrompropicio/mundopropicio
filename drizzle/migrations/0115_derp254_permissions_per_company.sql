-- #311 F2a: platform_admin tem todas as chaves; excepção negada na empresa continua a valer (#105).
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT granted FROM public.user_permissions
       WHERE user_id = _user_id AND permission = _permission
         AND company_id = public.current_company_id()
       LIMIT 1),
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission = _permission
        AND ur.company_id = public.current_company_id()
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.has_permission_in(_user_id uuid, _permission text, _company_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT granted FROM public.user_permissions
       WHERE user_id = _user_id AND permission = _permission AND company_id = _company_id LIMIT 1),
    public.is_platform_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.user_roles ur
       JOIN public.role_permissions rp ON rp.role = ur.role
       WHERE ur.user_id = _user_id AND rp.permission = _permission AND ur.company_id = _company_id)
  )
$function$;

-- Resolução efectiva (papel + permissões) de um utilizador numa empresa. Interna.
CREATE OR REPLACE FUNCTION public._effective_permissions_for(_user_id uuid, _company_id uuid, _universe text[] DEFAULT '{}')
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_pa boolean := public.is_platform_admin(_user_id);
  v_roles text[];
  v_role text;
  v_full boolean;
  v_perms text[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('role', NULL, 'permissions', '[]'::jsonb);
  END IF;

  SELECT array_agg(DISTINCT role::text) INTO v_roles
    FROM public.user_roles
   WHERE user_id = _user_id
     AND (company_id = _company_id OR role = 'platform_admin'::app_role);

  SELECT r INTO v_role FROM unnest(coalesce(v_roles, '{}')) r
   ORDER BY CASE r WHEN 'platform_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2
     WHEN 'accountant' THEN 3 WHEN 'marketing_manager' THEN 4 WHEN 'content_manager' THEN 4
     WHEN 'editor' THEN 4 WHEN 'producer' THEN 4 WHEN 'field_producer' THEN 4
     WHEN 'partner' THEN 5 WHEN 'viewer' THEN 6 WHEN 'user' THEN 7 ELSE 99 END, r
   LIMIT 1;

  v_full := v_pa OR 'admin' = ANY(coalesce(v_roles, '{}'));

  WITH base AS (
    SELECT unnest(coalesce(_universe, '{}')) k WHERE v_full
    UNION SELECT permission FROM public.role_permissions WHERE v_pa
    UNION SELECT rp.permission FROM public.role_permissions rp
      WHERE rp.role::text = ANY(coalesce(v_roles, '{}'))
  ),
  ov AS (
    SELECT permission k, bool_and(granted) g FROM public.user_permissions
     WHERE user_id = _user_id AND company_id = _company_id GROUP BY 1
  ),
  eff AS (
    SELECT b.k FROM base b LEFT JOIN ov ON ov.k = b.k WHERE ov.g IS NULL OR ov.g
    UNION SELECT k FROM ov WHERE g
  )
  SELECT array_agg(k ORDER BY k) INTO v_perms FROM eff;

  RETURN jsonb_build_object(
    'role', coalesce(v_role, 'user'),
    'company_id', _company_id,
    'permissions', to_jsonb(coalesce(v_perms, '{}'))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._effective_permissions_for(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._effective_permissions_for(uuid, uuid, text[]) TO service_role;

-- RPC do ecrã: fonte única com o servidor, para o utilizador actual na empresa activa.
CREATE OR REPLACE FUNCTION public.my_effective_permissions(p_universe text[] DEFAULT '{}')
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public._effective_permissions_for(auth.uid(), public.current_company_id(), p_universe)
$function$;

REVOKE ALL ON FUNCTION public.my_effective_permissions(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_effective_permissions(text[]) TO authenticated;