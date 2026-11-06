-- 0335 — Issue #664 · autorização 6643339210 / ajuste 6643775338.
-- R2 PREPARADA, NÃO APLICADA. Sem DML, sem transacção exterior.
-- Aplicar cada PARTE apenas na sua janela, nunca o ficheiro todo de uma vez.
-- PARTE 1 → Publish ERP + deploy dos escritores → prova antes → PARTE 2 → prova depois.
-- Rollback integral apenas no ficheiro comentado correspondente.
-- Fontes: 0048 (resolvedores); catálogo versionado #352 (camarim e teste RLS).
-- _seed_coala_from_mp não está viva: a migração 20260429225802 acaba em DROP FUNCTION.
-- Não reinstalar nem executar a rotina one-shot que copia fornecedores entre empresas.

-- PARTE 1 — antes do Publish; p_country opcional mantém compatibilidade com a 0315.
DO $country_precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.suppliers'::regclass AND attname = 'country'
      AND attnotnull AND NOT attisdropped AND NOT atthasdef
  ) THEN
    RAISE EXCEPTION '0335: suppliers.country tem de ser NOT NULL e sem DEFAULT (0104/0315)';
  END IF;
END;
$country_precondition$;

-- A 0302 criou um CHECK sem nome explícito. Ler o nome real no catálogo.
DO $tax_id_type$
DECLARE v_names text[];
BEGIN
  SELECT array_agg(c.conname::text) INTO v_names
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'tax_id_type'
  WHERE c.conrelid = 'public.suppliers'::regclass AND c.contype = 'c'
    AND c.conkey = ARRAY[a.attnum];
  IF coalesce(cardinality(v_names), 0) <> 1 THEN
    RAISE EXCEPTION '0335: CHECK único de tax_id_type da 0302 não identificado';
  END IF;
  EXECUTE format('ALTER TABLE public.suppliers DROP CONSTRAINT %I', v_names[1]);
  EXECUTE format('ALTER TABLE public.suppliers ADD CONSTRAINT %I CHECK (tax_id_type IS NULL OR tax_id_type IN (''cpf'',''cnpj'',''ein'',''tin'',''vat'',''outro'',''sem_nif''))', v_names[1]);
END;
$tax_id_type$;

-- Sem overloads ambíguos: remover primeiro o invólucro antigo e depois o privado.
DROP FUNCTION public.supplier_resolve_or_create(text, text, text);
DROP FUNCTION public._supplier_resolve_or_create(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public._supplier_resolve_or_create(p_company_id uuid, p_name text, p_nif text, p_source text, p_country text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_nif_active uuid[]; v_flagged int := 0; r record;
BEGIN
  SELECT array_agg(c.id) INTO v_nif_active
    FROM public._supplier_similar_candidates(p_company_id, p_name, p_nif, NULL) c
   WHERE c.motivo = 'nif' AND c.is_active;
  IF coalesce(array_length(v_nif_active, 1), 0) = 1 THEN
    RETURN jsonb_build_object('id', v_nif_active[1], 'created', false, 'reused', true, 'flagged', 0);
  END IF;

  INSERT INTO public.suppliers (name, nif, company_id, is_active, country)
  VALUES (btrim(p_name), nullif(btrim(coalesce(p_nif, '')), ''), p_company_id, true, nullif(upper(btrim(p_country)), ''))
  RETURNING id INTO v_id;

  FOR r IN SELECT c.id, c.motivo FROM public._supplier_similar_candidates(p_company_id, p_name, p_nif, v_id) c LOOP
    INSERT INTO public.supplier_similarity_flags (company_id, supplier_id, similar_supplier_id, motivo, source)
    VALUES (p_company_id, v_id, r.id, r.motivo, p_source) ON CONFLICT DO NOTHING;
    v_flagged := v_flagged + 1;
  END LOOP;
  RETURN jsonb_build_object('id', v_id, 'created', true, 'reused', false, 'flagged', v_flagged);
END;
$$;
REVOKE ALL ON FUNCTION public._supplier_resolve_or_create(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._supplier_resolve_or_create(uuid, text, text, text, text) TO service_role;

-- Invólucro para o frontend (importação de patrocinadores): empresa activa + papel de quem cria fornecedores.
CREATE OR REPLACE FUNCTION public.supplier_resolve_or_create(p_name text, p_nif text, p_source text, p_country text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_company uuid := public.current_company_id();
BEGIN
  IF auth.uid() IS NULL OR v_company IS NULL THEN RAISE EXCEPTION 'Empresa activa não definida' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'editor')) THEN
    RAISE EXCEPTION 'Sem permissão para criar fornecedores' USING ERRCODE = '42501';
  END IF;
  IF p_source NOT IN ('sponsors_import') THEN RAISE EXCEPTION 'Origem inválida'; END IF;
  RETURN public._supplier_resolve_or_create(v_company, p_name, p_nif, p_source, p_country);
END;
$$;
REVOKE ALL ON FUNCTION public.supplier_resolve_or_create(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_resolve_or_create(text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_or_create_generic_camarim_supplier(_company_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_country text;
BEGIN
  IF _company_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
    FROM public.suppliers
   WHERE company_id = _company_id
     AND is_active = true
     AND lower(btrim(name)) = lower('Diversos — Camarim')
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Excepção #664: marcador interno, não uma contraparte real.
  -- O país da empresa é escrito explicitamente; nunca há recurso a PT.
  SELECT upper(btrim(country)) INTO v_country FROM public.companies WHERE id = _company_id;
  IF v_country IS NULL OR v_country !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'supplier_country_required: empresa sem país válido';
  END IF;

  INSERT INTO public.suppliers (name, category, notes, is_active, company_id, country)
  VALUES (
    'Diversos — Camarim',
    'Camarim',
    'Fornecedor genérico para pequenas despesas de camarim sem cadastro próprio. O estabelecimento real fica registado no item e na descrição da transação.',
    true,
    _company_id, v_country
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.suppliers
     WHERE company_id = _company_id
       AND is_active = true
       AND lower(btrim(name)) = lower('Diversos — Camarim')
     LIMIT 1;
  END IF;

  RETURN v_id;
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_or_create_generic_camarim_supplier(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_generic_camarim_supplier(uuid) TO authenticated, service_role;

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
    INSERT INTO public.suppliers (name, company_id, country)
    VALUES ('FAKE_RLS_TEST', v_mp_id, 'PT')
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

-- A função de teste existente conserva a sua ACL: CREATE OR REPLACE não a altera.
-- Não chamar run_rls_isolation_test nesta janela (contém escrita de fixtures).

-- PARTE 2 — só depois do Publish e deploy de TODOS os escritores, com prova antes.
-- O CHECK do país já existe em Live como `suppliers_country_iso2` (validado); não se recria.
DO $country_precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.suppliers'::regclass AND attname = 'country'
      AND attnotnull AND NOT attisdropped AND NOT atthasdef
  ) THEN
    RAISE EXCEPTION '0335: suppliers.country tem de ser NOT NULL e sem DEFAULT (0104/0315)';
  END IF;
END;
$country_precondition$;

DROP TRIGGER suppliers_default_country_trigger ON public.suppliers;
DROP FUNCTION public.suppliers_default_country();
