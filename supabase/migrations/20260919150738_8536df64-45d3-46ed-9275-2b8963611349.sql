DROP FUNCTION IF EXISTS public._run_invariant_checks_secdef();

CREATE OR REPLACE FUNCTION public._run_invariant_checks_secdef()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_catalog'
AS $function$
DECLARE
  cR bigint; sR jsonb;
BEGIN
  SELECT count(*) INTO cR
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname IN ('public','crm') AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO sR
    FROM (
      SELECT n.nspname::text AS schema_name, p.proname::text AS funcao
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname IN ('public','crm') AND p.prosecdef
         AND has_function_privilege('anon', p.oid, 'EXECUTE')
       ORDER BY 1, 2
       LIMIT 5
    ) x;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cR, i.reference_count, (cR = i.reference_count) AS conforme,
         i.notes, sR
    FROM public.system_invariants i
   WHERE i.name = 'secdef_abertas_a_anon';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_secdef() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_secdef() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_secdef()
$function$;