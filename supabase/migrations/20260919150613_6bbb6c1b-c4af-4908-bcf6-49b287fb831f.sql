DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    WITH pol AS (
      SELECT DISTINCT lower(m[1]) AS fname
      FROM pg_policies p,
           LATERAL regexp_matches(coalesce(p.qual,'')||' '||coalesce(p.with_check,''), '([a-z_]+)\(', 'g') AS m
    )
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','crm')
      AND p.prosecdef
      AND p.proname NOT IN (SELECT fname FROM pol)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC', r.nspname, r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon', r.nspname, r.proname, r.args);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'SECDEF revogadas a PUBLIC/anon: %', n;
END $$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA crm REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA crm REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE abertas int;
BEGIN
  SELECT count(*) INTO abertas
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public','crm') AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  RAISE NOTICE 'SECDEF ainda executáveis por anon: %', abertas;
  IF abertas > 15 THEN
    RAISE EXCEPTION 'Esperado no máximo 15 funções de RLS abertas a anon; encontrado %', abertas;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_secdef()
RETURNS TABLE(name text, current_count bigint, reference_count bigint, conforme boolean, severity text, scope text, sample jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public','pg_catalog'
AS $$
DECLARE ref bigint; sev text; sc text;
BEGIN
  SELECT si.reference_count, si.severity, si.scope INTO ref, sev, sc
  FROM public.system_invariants si WHERE si.name = 'secdef_abertas_a_anon';
  IF ref IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH abertas AS (
    SELECT n.nspname::text AS schema_name, p.proname::text AS func_name
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','crm') AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  )
  SELECT 'secdef_abertas_a_anon'::text,
         (SELECT count(*) FROM abertas),
         ref,
         (SELECT count(*) FROM abertas) = ref,
         sev,
         sc,
         (SELECT jsonb_agg(jsonb_build_object('schema', schema_name, 'funcao', func_name))
            FROM (SELECT * FROM abertas ORDER BY schema_name, func_name LIMIT 5) s);
END $$;

REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_secdef() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_secdef() FROM anon, authenticated;

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES (
  'secdef_abertas_a_anon',
  'Funções SECURITY DEFINER em public/crm ainda executáveis por visitantes anónimos.',
  'warn', 'global', 15,
  'Referência 15 = helpers usados dentro de políticas de RLS, abertos por desenho (D-ERP37): can_manage_cards, can_manage_event_operacao_full, can_manage_operacao_etapa, can_see_confidential, can_view_event_operacao, current_company_id, has_permission, has_permission_in, has_role, is_platform_admin, is_public_portal_company, row_belongs_to_current_company, storage_path_belongs_to_current_company, user_has_event_access, user_supplier_id. Privilégios por omissão em public e crm já não dão EXECUTE a anon (19/09/2026).'
)
ON CONFLICT (name) DO UPDATE
  SET description = EXCLUDED.description,
      severity = EXCLUDED.severity,
      scope = EXCLUDED.scope,
      reference_count = EXCLUDED.reference_count,
      notes = EXCLUDED.notes;