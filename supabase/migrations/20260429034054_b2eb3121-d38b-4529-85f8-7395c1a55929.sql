CREATE OR REPLACE FUNCTION public.run_rls_isolation_test()
RETURNS TABLE(block text, check_name text, status text, details text)
LANGUAGE plpgsql
SECURITY DEFINER
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
BEGIN
  -- SETUP fake users
  DELETE FROM public.user_roles WHERE user_id IN (v_mp_user, v_d2_user);
  DELETE FROM public.profiles WHERE id IN (v_mp_user, v_d2_user);
  DELETE FROM auth.users WHERE id IN (v_mp_user, v_d2_user);

  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
  VALUES
    (v_mp_user, '00000000-0000-0000-0000-000000000000', 'rls-test-mp@example.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated'),
    (v_d2_user, '00000000-0000-0000-0000-000000000000', 'rls-test-d2@example.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated');

  INSERT INTO public.profiles (id, email, full_name, company_id) VALUES
    (v_mp_user, 'rls-test-mp@example.invalid', 'RLS Test MP', v_mp_id),
    (v_d2_user, 'rls-test-d2@example.invalid', 'RLS Test D2', v_d2_id);

  INSERT INTO public.user_roles (user_id, role, company_id) VALUES
    (v_mp_user, 'admin', v_mp_id),
    (v_d2_user, 'admin', v_d2_id);

  RETURN QUERY SELECT 'SETUP'::text, 'fake users created'::text, 'OK'::text, 'MP user + D2 user inserted'::text;

  -- ── BLOCO 1: BASELINE
  FOR r IN SELECT t FROM unnest(ARRAY['events','transactions','suppliers','event_forecasts','venues','financial_accounts']) AS t LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id = %L', r.t, v_mp_id) INTO v_visible;
    RETURN QUERY SELECT 'BASELINE'::text, ('mp.'||r.t)::text, 'INFO'::text, v_visible::text;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id = %L', r.t, v_d2_id) INTO v_visible;
    RETURN QUERY SELECT 'BASELINE'::text, ('d2.'||r.t)::text, 'INFO'::text, v_visible::text;
  END LOOP;

  -- ── BLOCO 2/7: VARREDURA CEGA — D2 user vê linhas com company_id != D2?
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_d2_user::text, 'role', 'authenticated')::text, true);

  -- Validar contexto
  RETURN QUERY SELECT 'CONTEXT'::text, 'auth.uid as D2'::text,
    CASE WHEN auth.uid() = v_d2_user THEN 'OK' ELSE 'FAIL' END,
    coalesce(auth.uid()::text,'NULL');
  RETURN QUERY SELECT 'CONTEXT'::text, 'current_company_id as D2'::text,
    CASE WHEN public.current_company_id() = v_d2_id THEN 'OK' ELSE 'FAIL' END,
    coalesce(public.current_company_id()::text,'NULL');

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
        RETURN QUERY SELECT 'LEAK_SCAN'::text, r.tablename::text, 'LEAK'::text, format('%s rows visible from other tenants', v_leaked);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT 'LEAK_SCAN'::text, r.tablename::text, 'ERROR'::text, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT 'LEAK_SCAN'::text, 'SUMMARY'::text,
    CASE WHEN v_total_leaked = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('%s tables scanned, %s total leaked rows', v_total_tables, v_total_leaked);

  -- BLOCO companies/profiles
  EXECUTE 'SELECT count(*) FROM public.companies' INTO v_visible;
  RETURN QUERY SELECT 'LEAK_SCAN'::text, 'companies (D2 should see 1)'::text,
    CASE WHEN v_visible = 1 THEN 'PASS' ELSE 'FAIL' END, v_visible::text;

  EXECUTE 'SELECT count(*) FROM public.profiles' INTO v_visible;
  RETURN QUERY SELECT 'LEAK_SCAN'::text, 'profiles (D2 should see only D2 users)'::text, 'INFO'::text, v_visible::text;

  -- ── BLOCO 4: INSERT cross-tenant
  BEGIN
    INSERT INTO public.suppliers (name, company_id)
    VALUES ('FAKE_SUPPLIER_RLS_TEST', v_mp_id)
    RETURNING company_id, id INTO v_inserted_company, v_inserted_id;
    IF v_inserted_company = v_mp_id THEN
      RETURN QUERY SELECT 'INSERT_X'::text, 'D2 inserts as MP'::text, 'FAIL'::text, 'row created in MP — ISOLATION BROKEN';
    ELSE
      RETURN QUERY SELECT 'INSERT_X'::text, 'D2 inserts as MP'::text, 'PASS'::text, format('trigger overrode to %s', v_inserted_company);
    END IF;
    DELETE FROM public.suppliers WHERE id = v_inserted_id;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception THEN
    RETURN QUERY SELECT 'INSERT_X'::text, 'D2 inserts as MP'::text, 'PASS'::text, 'blocked: '||SQLERRM;
  END;

  -- ── BLOCO 5: UPDATE/DELETE cross-tenant
  BEGIN
    WITH upd AS (
      UPDATE public.transactions SET notes = 'rls-test-tampering'
      WHERE company_id = v_mp_id RETURNING id
    )
    SELECT count(*) INTO v_updated FROM upd;
    RETURN QUERY SELECT 'UPDATE_X'::text, 'D2 updates MP transactions'::text,
      CASE WHEN v_updated = 0 THEN 'PASS' ELSE 'FAIL' END,
      format('rows affected: %s (must be 0)', v_updated);
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'UPDATE_X'::text, 'D2 updates MP transactions'::text, 'PASS'::text, 'blocked: '||SQLERRM;
  END;

  BEGIN
    WITH del AS (
      DELETE FROM public.transactions WHERE company_id = v_mp_id RETURNING id
    )
    SELECT count(*) INTO v_deleted FROM del;
    RETURN QUERY SELECT 'DELETE_X'::text, 'D2 deletes MP transactions'::text,
      CASE WHEN v_deleted = 0 THEN 'PASS' ELSE 'FAIL' END,
      format('rows affected: %s (must be 0)', v_deleted);
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'DELETE_X'::text, 'D2 deletes MP transactions'::text, 'PASS'::text, 'blocked: '||SQLERRM;
  END;

  -- Reset role for cleanup
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- CLEANUP
  DELETE FROM public.user_roles WHERE user_id IN (v_mp_user, v_d2_user);
  DELETE FROM public.profiles WHERE id IN (v_mp_user, v_d2_user);
  DELETE FROM auth.users WHERE id IN (v_mp_user, v_d2_user);

  RETURN QUERY SELECT 'CLEANUP'::text, 'fake users removed'::text, 'OK'::text, ''::text;
END;
$$;

-- Restrict execute to admins
REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_rls_isolation_test() FROM anon;