-- Fix handle_new_user to handle missing company_id metadata gracefully
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := NULLIF(NEW.raw_user_meta_data->>'company_id', '')::uuid;
  IF v_company_id IS NULL THEN
    -- Fallback to first active company (default tenant) to avoid breaking signups
    SELECT id INTO v_company_id
    FROM public.companies
    WHERE status = 'active'
    ORDER BY created_at
    LIMIT 1;
  END IF;
  INSERT INTO public.profiles (id, full_name, email, company_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, v_company_id);
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (NEW.id, 'user', v_company_id);
  RETURN NEW;
END;
$function$;

-- Update test function: pass company_id in raw_user_meta_data so the trigger gets it directly
DROP FUNCTION IF EXISTS public.run_rls_isolation_test();

CREATE OR REPLACE FUNCTION public.run_rls_isolation_test()
RETURNS TABLE(block text, check_name text, status text, details text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_mp_id uuid := '975254b9-6b92-4cdd-a971-36e4a4f98525';
  v_d2_id uuid := '6e174fca-69b6-4173-9aca-11a0a8355840';
  v_mp_user uuid := '00000000-0000-0000-0000-000000000d01';
  v_d2_user uuid := '00000000-0000-0000-0000-000000000d02';
  r record;
  v_visible bigint;
  v_leaked bigint;
  v_total_leaked bigint := 0;
  v_total_tables int := 0;
  v_inserted_company uuid;
  v_inserted_id uuid;
  v_updated bigint;
  v_deleted bigint;
  v_uid uuid;
  v_cid uuid;
BEGIN
  -- SETUP fake users
  DELETE FROM public.user_roles WHERE user_id IN (v_mp_user, v_d2_user);
  DELETE FROM public.profiles WHERE id IN (v_mp_user, v_d2_user);
  DELETE FROM auth.users WHERE id IN (v_mp_user, v_d2_user);

  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role, raw_user_meta_data)
  VALUES
    (v_mp_user, '00000000-0000-0000-0000-000000000000', 'rls-test-mp@example.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated',
     jsonb_build_object('company_id', v_mp_id::text, 'full_name', 'RLS Test MP')),
    (v_d2_user, '00000000-0000-0000-0000-000000000000', 'rls-test-d2@example.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated',
     jsonb_build_object('company_id', v_d2_id::text, 'full_name', 'RLS Test D2'));

  -- Trigger handle_new_user já criou profiles + user_roles (com role='user')
  -- Promover para admin para os testes
  UPDATE public.user_roles SET role = 'admin' WHERE user_id IN (v_mp_user, v_d2_user);

  RETURN QUERY SELECT 'SETUP'::text, 'fake users created via trigger'::text, 'OK'::text, 'MP+D2 admin'::text;

  -- BASELINE
  FOR r IN SELECT t FROM unnest(ARRAY['events','transactions','suppliers','event_forecasts','venues']) AS t(t) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id = %L', r.t, v_mp_id) INTO v_visible;
    RETURN QUERY SELECT 'BASELINE'::text, ('mp.'||r.t)::text, 'INFO'::text, v_visible::text;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id = %L', r.t, v_d2_id) INTO v_visible;
    RETURN QUERY SELECT 'BASELINE'::text, ('d2.'||r.t)::text, 'INFO'::text, v_visible::text;
  END LOOP;

  -- Switch to authenticated context as D2 user
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_d2_user::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_uid := auth.uid();
  v_cid := public.current_company_id();
  RETURN QUERY SELECT 'CONTEXT'::text, 'auth.uid'::text,
    CASE WHEN v_uid = v_d2_user THEN 'OK' ELSE 'FAIL' END, coalesce(v_uid::text,'NULL');
  RETURN QUERY SELECT 'CONTEXT'::text, 'current_company_id'::text,
    CASE WHEN v_cid = v_d2_id THEN 'OK' ELSE 'FAIL' END, coalesce(v_cid::text,'NULL');

  -- VARREDURA CEGA
  v_total_leaked := 0;
  v_total_tables := 0;
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema='public' AND col.table_name=c.relname AND col.column_name='company_id'
    WHERE n.nspname='public' AND c.relkind='r'
    ORDER BY c.relname
  LOOP
    v_total_tables := v_total_tables + 1;
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id <> %L', r.tablename, v_d2_id) INTO v_leaked;
      IF v_leaked > 0 THEN
        v_total_leaked := v_total_leaked + v_leaked;
        RETURN QUERY SELECT 'LEAK_SCAN'::text, r.tablename::text, 'LEAK'::text, format('%s rows', v_leaked);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT 'LEAK_SCAN'::text, r.tablename::text, 'ERROR'::text, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT 'LEAK_SCAN'::text, 'SUMMARY'::text,
    CASE WHEN v_total_leaked = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('%s tables / %s leaks', v_total_tables, v_total_leaked);

  EXECUTE 'SELECT count(*) FROM public.companies' INTO v_visible;
  RETURN QUERY SELECT 'LEAK_SCAN'::text, 'companies'::text,
    CASE WHEN v_visible = 1 THEN 'PASS' ELSE 'FAIL' END, v_visible::text||' (expected 1)';

  EXECUTE 'SELECT count(*) FROM public.profiles' INTO v_visible;
  RETURN QUERY SELECT 'LEAK_SCAN'::text, 'profiles'::text, 'INFO'::text, v_visible::text;

  -- INSERT cross-tenant
  BEGIN
    INSERT INTO public.suppliers (name, company_id)
    VALUES ('FAKE_RLS_TEST', v_mp_id)
    RETURNING company_id, id INTO v_inserted_company, v_inserted_id;
    IF v_inserted_company = v_mp_id THEN
      RETURN QUERY SELECT 'INSERT_X'::text, 'D2->MP supplier'::text, 'FAIL'::text, 'created in MP';
    ELSE
      RETURN QUERY SELECT 'INSERT_X'::text, 'D2->MP supplier'::text, 'PASS'::text, 'overridden to '||v_inserted_company::text;
    END IF;
    DELETE FROM public.suppliers WHERE id = v_inserted_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'INSERT_X'::text, 'D2->MP supplier'::text, 'PASS'::text, 'blocked: '||SQLERRM;
  END;

  -- UPDATE cross-tenant
  BEGIN
    WITH upd AS (UPDATE public.transactions SET notes='rls-test' WHERE company_id = v_mp_id RETURNING id)
    SELECT count(*) INTO v_updated FROM upd;
    RETURN QUERY SELECT 'UPDATE_X'::text, 'D2 update MP tx'::text,
      CASE WHEN v_updated=0 THEN 'PASS' ELSE 'FAIL' END, v_updated::text||' rows';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'UPDATE_X'::text, 'D2 update MP tx'::text, 'PASS'::text, 'blocked: '||SQLERRM;
  END;

  -- DELETE cross-tenant
  BEGIN
    WITH del AS (DELETE FROM public.transactions WHERE company_id = v_mp_id RETURNING id)
    SELECT count(*) INTO v_deleted FROM del;
    RETURN QUERY SELECT 'DELETE_X'::text, 'D2 delete MP tx'::text,
      CASE WHEN v_deleted=0 THEN 'PASS' ELSE 'FAIL' END, v_deleted::text||' rows';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'DELETE_X'::text, 'D2 delete MP tx'::text, 'PASS'::text, 'blocked: '||SQLERRM;
  END;

  -- Reset role + cleanup
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  DELETE FROM public.user_roles WHERE user_id IN (v_mp_user, v_d2_user);
  DELETE FROM public.profiles WHERE id IN (v_mp_user, v_d2_user);
  DELETE FROM auth.users WHERE id IN (v_mp_user, v_d2_user);

  RETURN QUERY SELECT 'CLEANUP'::text, 'fake users removed'::text, 'OK'::text, ''::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_rls_isolation_test() TO postgres, service_role;