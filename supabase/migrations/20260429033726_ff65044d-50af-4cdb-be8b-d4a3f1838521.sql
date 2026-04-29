-- Multi-tenant Phase 7: enforce NOT NULL on all 70 tenant tables
DO $$
DECLARE
  r record;
  v_count int := 0;
  v_failed text[] := '{}';
BEGIN
  FOR r IN 
    SELECT table_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name='company_id' AND is_nullable='YES'
    ORDER BY table_name
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN company_id SET NOT NULL', r.table_name);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed || format('%s: %s', r.table_name, SQLERRM);
    END;
  END LOOP;
  RAISE NOTICE '✅ Set NOT NULL on % tables', v_count;
  IF array_length(v_failed,1) IS NOT NULL THEN
    RAISE WARNING '❌ Failed: %', v_failed;
  END IF;
END $$;

-- Audit function
CREATE OR REPLACE FUNCTION public.audit_multi_tenant_isolation()
RETURNS TABLE(metric text, value bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT 'tables_with_company_id'::text, COUNT(*)::bigint 
    FROM information_schema.columns 
    WHERE table_schema='public' AND column_name='company_id'
  UNION ALL
  SELECT 'tables_company_id_not_null', COUNT(*)::bigint 
    FROM information_schema.columns 
    WHERE table_schema='public' AND column_name='company_id' AND is_nullable='NO'
  UNION ALL
  SELECT 'companies_total', COUNT(*)::bigint FROM public.companies
  UNION ALL
  SELECT 'profiles_with_company', COUNT(*)::bigint FROM public.profiles WHERE company_id IS NOT NULL
  UNION ALL
  SELECT 'profiles_without_company', COUNT(*)::bigint FROM public.profiles WHERE company_id IS NULL;
END $$;