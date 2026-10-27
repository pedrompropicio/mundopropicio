-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.create_card_session_load(pg_catalog.uuid,pg_catalog."numeric",pg_catalog.date,pg_catalog.uuid,pg_catalog.text)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "2c5397e0fec5fb32f1d1c1aef6257ee48a47c4fbd8fcad124610c2d50d96e55f", "live_properties_sha256": "319b56c3df1f36801cb232413b8ef3571c03b14d124056dee2afd448e57dab6c", "oid": 230002, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "8d8180101ff9966ef1a0c2502d599541f86a338239dbf24419e84e65881d9a95", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 1b70d8a25a67e18f75e8dd82b4add00128cfc98af0b10f2da6098a0ddeb373c3
CREATE OR REPLACE FUNCTION public.create_card_session_load(p_session_id uuid, p_amount numeric, p_load_date date, p_source_account_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sess public.card_sessions%ROWTYPE;
  v_src_name TEXT;
  v_card_name TEXT;
  v_cat_id UUID;
  v_out_id UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor da carga inválido.';
  END IF;
  IF p_source_account_id IS NULL THEN
    RAISE EXCEPTION 'Conta de origem obrigatória.';
  END IF;

  SELECT * INTO v_sess FROM public.card_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão de cartão não encontrada.';
  END IF;
  IF v_sess.company_id IS NULL THEN
    RAISE EXCEPTION 'Sessão de cartão sem empresa associada.';
  END IF;
  IF v_sess.status = 'closed' THEN
    RAISE EXCEPTION 'Sessão fechada: não aceita novas recargas.';
  END IF;

  SELECT name INTO v_src_name  FROM public.financial_accounts WHERE id = p_source_account_id;
  SELECT name INTO v_card_name FROM public.financial_accounts WHERE id = v_sess.card_account_id;

  SELECT id INTO v_cat_id
    FROM public.account_categories
   WHERE code = '10.3'
     AND (company_id IS NULL OR company_id = v_sess.company_id)
   ORDER BY (company_id IS NULL)
   LIMIT 1;
  IF v_cat_id IS NULL THEN
    RAISE EXCEPTION 'Rubrica 10.3 (transferências entre contas) não encontrada.';
  END IF;

  INSERT INTO public.transactions (
    company_id, type, description, amount, iva_rate, date, status,
    is_transitory, transitory_reason, exclude_from_result, category_id, account_id
  ) VALUES (
    v_sess.company_id, 'expense',
    'Carga cartão — ' || COALESCE(v_card_name, 'cartão') || ' (' || COALESCE(v_src_name, 'origem') || ' → ' || COALESCE(v_card_name, 'cartão') || ')',
    p_amount, 0, p_load_date, 'pending',
    true, 'carga_cartao', true, v_cat_id, p_source_account_id
  )
  RETURNING id INTO v_out_id;

  INSERT INTO public.card_session_loads (
    company_id, session_id, amount, load_date, source_account_id,
    out_transaction_id, in_transaction_id, notes, created_by
  ) VALUES (
    v_sess.company_id, p_session_id, p_amount, p_load_date, p_source_account_id,
    v_out_id, NULL, NULLIF(btrim(COALESCE(p_notes, '')), ''), auth.uid()
  );

  RETURN v_out_id;
END;
$function$
;

ALTER FUNCTION public.create_card_session_load(pg_catalog.uuid,pg_catalog."numeric",pg_catalog.date,pg_catalog.uuid,pg_catalog.text) OWNER TO "postgres";
-- END OPERATION 1b70d8a25a67e18f75e8dd82b4add00128cfc98af0b10f2da6098a0ddeb373c3
