-- #283 / D-ERP194-195: invariantes de isolamento multi-empresa.
-- politicas_sem_predicado_empresa: tabelas public com company_id que têm política PERMISSIVE
--   (fora de service_role) sem predicado de empresa/helper de acesso/auth.uid() e sem trava RESTRICTIVE.
-- secdef_sem_guarda_empresa: SECURITY DEFINER em public/crm chamáveis por authenticated, com uuid
--   nos argumentos e sem guarda de empresa reconhecida no corpo.
CREATE OR REPLACE FUNCTION public._run_invariant_checks_tenant()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cP bigint; sP jsonb; cF bigint; sF jsonb;
BEGIN
  WITH pol AS (
    SELECT p.tablename, p.policyname
      FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.permissive = 'PERMISSIVE'
       AND NOT (p.roles = '{service_role}'::name[])
       AND EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = p.tablename AND c.column_name = 'company_id')
       AND coalesce(p.qual, '') || coalesce(p.with_check, '') !~* '(company|user_has_event_access|can_manage|can_view|is_settlement_staff|user_event_partner_ids|partner_event_access|auth\.uid\(\) = |= auth\.uid\(\))'
       AND NOT EXISTS (SELECT 1 FROM pg_policies r
                        WHERE r.schemaname = 'public' AND r.tablename = p.tablename
                          AND r.permissive = 'RESTRICTIVE' AND (r.cmd = p.cmd OR r.cmd = 'ALL'))
  )
  SELECT count(DISTINCT tablename),
         coalesce(jsonb_agg(DISTINCT tablename || '.' || policyname), '[]'::jsonb)
    INTO cP, sP FROM pol;

  WITH fn AS (
    SELECT n.nspname || '.' || p.proname AS f
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname IN ('public', 'crm') AND p.prosecdef
       AND p.prorettype <> 'trigger'::regtype
       AND p.proname NOT LIKE '%\_\_impl'
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND pg_get_function_identity_arguments(p.oid) ~ 'uuid'
       AND p.prosrc !~* '(company_id|current_company_id|row_belongs_to_current_company|user_has_event_access|user_has_company_access|can_manage|can_view|is_settlement_staff|user_event_partner_ids|has_permission|partner_event_access|artist_ads_assert|_assert_row_company|_scope_event_ids)'
  )
  SELECT count(*), coalesce(jsonb_agg(f ORDER BY f), '[]'::jsonb) INTO cF, sF FROM fn;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         CASE i.name WHEN 'politicas_sem_predicado_empresa' THEN cP ELSE cF END,
         i.reference_count,
         (CASE i.name WHEN 'politicas_sem_predicado_empresa' THEN cP ELSE cF END) <= i.reference_count,
         i.notes,
         CASE i.name WHEN 'politicas_sem_predicado_empresa' THEN sP ELSE sF END
    FROM public.system_invariants i
   WHERE i.name IN ('politicas_sem_predicado_empresa', 'secdef_sem_guarda_empresa');
END;
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_tenant() TO service_role;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid()
  UNION ALL SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL SELECT * FROM public._run_invariant_checks_secdef()
  UNION ALL SELECT * FROM public._run_invariant_checks_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_extrato()
  UNION ALL SELECT * FROM public._run_invariant_checks_cards()
  UNION ALL SELECT * FROM public._run_invariant_checks_tenant()
$function$;
