-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.run_rls_isolation_test()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "8568fe2ff6405bf04cae7306767b6807aa6eeed94bc9e7ec6e4a7672c64ad33c", "live_properties_sha256": "f6d1f832681631d2c645d18003339d4bd2ef070eec9ac6064d3c4641a3d7247b", "oid": 56290, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "ba876e93ab4f1520235c3347c470d7d3d77f40b4fa2d066ac31319e2a1632f13", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 3cc61eb8c0df3c0dacdf9c513741920ca1fbaeb2203bb505a2f39b089d703bce
CREATE OR REPLACE FUNCTION public.run_rls_isolation_test()
 RETURNS TABLE(block text, check_name text, status text, details text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  v_uid uuid;
  v_cid uuid;
BEGIN
  INSERT INTO public.companies (id, slug, legal_name, display_name, contact_email, country, currency, timezone, status)
  VALUES
    (v_mp_id, 'rls-test-mp', 'RLS Test MP', 'RLS Test MP', 'mail-6b7a554c19dd04b2f640dd7066336e17e7e3d11ad6daab0190cea62c2ae73dfd@homolog.invalid', 'PT', 'EUR', 'Europe/Lisbon', 'active'),
    (v_d2_id, 'rls-test-d2', 'RLS Test D2', 'RLS Test D2', 'mail-a98eb4074adf08a2a7341baa179e867d03ca54f4cb9f87a49cac5f3633244ca5@homolog.invalid', 'PT', 'EUR', 'Europe/Lisbon', 'active')
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.user_roles WHERE user_id IN (v_mp_user, v_d2_user);
  DELETE FROM public.profiles WHERE id IN (v_mp_user, v_d2_user);
  DELETE FROM auth.users WHERE id IN (v_mp_user, v_d2_user);

  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role, raw_user_meta_data)
  VALUES
    (v_mp_user, '00000000-0000-0000-0000-000000000000', 'mail-6b7a554c19dd04b2f640dd7066336e17e7e3d11ad6daab0190cea62c2ae73dfd@homolog.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated',
     jsonb_build_object('company_id', v_mp_id::text, 'full_name', 'RLS Test MP')),
    (v_d2_user, '00000000-0000-0000-0000-000000000000', 'mail-a98eb4074adf08a2a7341baa179e867d03ca54f4cb9f87a49cac5f3633244ca5@homolog.invalid', 'x', now(), now(), now(), 'authenticated', 'authenticated',
     jsonb_build_object('company_id', v_d2_id::text, 'full_name', 'RLS Test D2'));

  UPDATE public.user_roles SET role = 'admin' WHERE user_id IN (v_mp_user, v_d2_user);

  RETURN QUERY SELECT 'SETUP'::text, 'fake users + companies created'::text, 'OK'::text, 'MP+D2 admin'::text;

  FOR r IN SELECT t FROM unnest(ARRAY['events','transactions','suppliers','event_forecasts','venues']) AS t(t) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id = %L', r.t, v_mp_id) INTO v_visible;
    RETURN QUERY SELECT 'BASELINE'::text, ('mp.'||r.t)::text, 'INFO'::text, v_visible::text;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE company_id = %L', r.t, v_d2_id) INTO v_visible;
    RETURN QUERY SELECT 'BASELINE'::text, ('d2.'||r.t)::text, 'INFO'::text, v_visible::text;
  END LOOP;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_d2_user::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_uid := auth.uid();
  v_cid := public.current_company_id();
  RETURN QUERY SELECT 'CONTEXT'::text, 'auth.uid'::text,
    CASE WHEN v_uid = v_d2_user THEN 'OK' ELSE 'FAIL' END, coalesce(v_uid::text,'NULL');
  RETURN QUERY SELECT 'CONTEXT'::text, 'current_company_id'::text,
    CASE WHEN v_cid = v_d2_id THEN 'OK' ELSE 'FAIL' END, coalesce(v_cid::text,'NULL');

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

  BEGIN
    INSERT INTO public.suppliers (name, company_id)
    VALUES ('FAKE_RLS_TEST', v_mp_id)
    RETURNING company_id, id INTO v_inserted_company, v_inserted_id;
    IF v_inserted_company = v_mp_id THEN
      RETURN QUERY SELECT 'INSERT_X'::text, 'D2->MP supplier'::text, 'FAIL'::text, 'created in MP';
    ELSE
      RETURN QUERY SELECT 'INSERT_X'::text, 'D2->MP supplier'::text, 'PASS'::text, 'rewritten to '||v_inserted_company::text;
    END IF;
    DELETE FROM public.suppliers WHERE id = v_inserted_id;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 'INSERT_X'::text, 'D2->MP supplier'::text, 'PASS'::text, 'blocked: '||SQLERRM;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  -- Cleanup: remover dependências antes das empresas
  DELETE FROM public.user_roles WHERE user_id IN (v_mp_user, v_d2_user);
  DELETE FROM public.profiles WHERE id IN (v_mp_user, v_d2_user);
  DELETE FROM auth.users WHERE id IN (v_mp_user, v_d2_user);
  DELETE FROM public.system_audit_log WHERE company_id IN (v_mp_id, v_d2_id);
  DELETE FROM public.companies WHERE id IN (v_mp_id, v_d2_id);

  RETURN QUERY SELECT 'CLEANUP'::text, 'fake users + companies removed'::text, 'OK'::text, ''::text;
END;
$function$
;

ALTER FUNCTION public.run_rls_isolation_test() OWNER TO "postgres";
-- END OPERATION 3cc61eb8c0df3c0dacdf9c513741920ca1fbaeb2203bb505a2f39b089d703bce
