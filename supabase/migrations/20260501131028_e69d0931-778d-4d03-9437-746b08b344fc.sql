DROP FUNCTION IF EXISTS public.run_rls_legacy_audit_cron();
DROP FUNCTION IF EXISTS public.run_rls_legacy_audit(text, uuid);

CREATE OR REPLACE FUNCTION public.run_rls_legacy_audit(
  _triggered_by text DEFAULT 'cron',
  _triggered_by_user uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_legacy int;
  v_total int;
  v_details jsonb;
  v_row jsonb;
BEGIN
  SELECT count(*) INTO v_total
  FROM pg_policies
  WHERE schemaname = 'public';

  SELECT
    coalesce(jsonb_agg(jsonb_build_object(
      'schemaname', schemaname,
      'tablename', tablename,
      'policyname', policyname,
      'cmd', cmd,
      'qual', qual,
      'with_check', with_check
    ) ORDER BY tablename, policyname), '[]'::jsonb)
  INTO v_details
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      qual ILIKE '%auth.uid() IS NOT NULL%'
      OR with_check ILIKE '%auth.uid() IS NOT NULL%'
    );

  v_legacy := jsonb_array_length(v_details);

  INSERT INTO public.rls_legacy_audit_reports
    (legacy_count, total_policies, status, details, triggered_by, triggered_by_user)
  VALUES (
    v_legacy,
    v_total,
    CASE WHEN v_legacy = 0 THEN 'green' ELSE 'red' END,
    v_details,
    _triggered_by,
    _triggered_by_user
  )
  RETURNING to_jsonb(public.rls_legacy_audit_reports.*) INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.run_rls_legacy_audit(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_rls_legacy_audit(text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_rls_legacy_audit_cron()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT public.run_rls_legacy_audit('cron', NULL);
$$;

REVOKE ALL ON FUNCTION public.run_rls_legacy_audit_cron() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_rls_legacy_audit_cron() TO service_role;