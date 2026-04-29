DO $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN 
    SELECT table_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name='company_id'
      AND table_name NOT IN ('companies')
    ORDER BY table_name
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN company_id SET DEFAULT public.current_company_id()',
      r.table_name
    );
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '✅ Set DEFAULT current_company_id() on % tables', v_count;
END $$;