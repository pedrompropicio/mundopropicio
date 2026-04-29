-- Auto-fill company_id on INSERT when omitted
CREATE OR REPLACE FUNCTION public.set_company_id_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_company_id();
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'company_id cannot be NULL — user has no associated company';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN 
    SELECT table_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name='company_id'
      AND table_name NOT IN ('companies','profiles')
    ORDER BY table_name
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_company_id ON public.%I', r.table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert()',
      r.table_name
    );
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE '✅ Created auto-fill trigger on % tables', v_count;
END $$;