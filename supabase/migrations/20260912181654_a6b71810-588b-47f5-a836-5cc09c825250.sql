-- Gestão ao nível da chave de operação (D-ERP45/46): renomear/fundir e limpar.
-- Atomicidade e auditoria dentro da base de dados; portão admin por dentro.

CREATE OR REPLACE FUNCTION public.rename_operation_key(_old_key text, _new_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_affected int;
  v_target_existing int;
  v_actor text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    -- service_role / crons (auth.uid() IS NULL) ficam isentos do portão.
    IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid())) THEN
      RAISE EXCEPTION 'Apenas administradores podem renomear chaves de operação' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa activa não resolvida' USING ERRCODE = '42501';
  END IF;

  _old_key := btrim(coalesce(_old_key, ''));
  _new_key := btrim(coalesce(_new_key, ''));

  IF _new_key !~ '^[A-Z0-9]+(-[A-Z0-9]+)+$' THEN
    RAISE EXCEPTION 'Chave nova fora da convenção: %', _new_key USING ERRCODE = '22023';
  END IF;
  IF _old_key = '' OR _old_key = _new_key THEN
    RAISE EXCEPTION 'Chave antiga inválida' USING ERRCODE = '22023';
  END IF;
  IF _old_key LIKE 'CAMARIM-%' OR _old_key LIKE 'CARTAO-%'
     OR _new_key LIKE 'CAMARIM-%' OR _new_key LIKE 'CARTAO-%' THEN
    RAISE EXCEPTION 'Chaves geradas pelo sistema (CAMARIM-/CARTAO-) não podem ser renomeadas' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_target_existing
  FROM public.transactions
  WHERE company_id = v_company AND operation_key = _new_key;

  v_actor := coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), 'sistema');

  INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value, company_id)
  SELECT id, v_actor, 'Chave de operação (renomear grupo)', _old_key, _new_key, v_company
  FROM public.transactions
  WHERE company_id = v_company AND operation_key = _old_key;

  UPDATE public.transactions
  SET operation_key = _new_key
  WHERE company_id = v_company AND operation_key = _old_key;
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Chave % não encontrada nesta empresa', _old_key USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object(
    'old_key', _old_key,
    'new_key', _new_key,
    'affected', v_affected,
    'merged_into_existing', v_target_existing,
    'total_after', v_affected + v_target_existing
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rename_operation_key(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rename_operation_key(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rename_operation_key(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_operation_key(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_operation_key(_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_affected int;
  v_actor text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_platform_admin(auth.uid())) THEN
      RAISE EXCEPTION 'Apenas administradores podem apagar chaves de operação' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa activa não resolvida' USING ERRCODE = '42501';
  END IF;

  _key := btrim(coalesce(_key, ''));
  IF _key = '' THEN
    RAISE EXCEPTION 'Chave inválida' USING ERRCODE = '22023';
  END IF;
  IF _key LIKE 'CAMARIM-%' OR _key LIKE 'CARTAO-%' THEN
    RAISE EXCEPTION 'Chaves geradas pelo sistema (CAMARIM-/CARTAO-) não podem ser apagadas' USING ERRCODE = '42501';
  END IF;

  v_actor := coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), 'sistema');

  INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value, company_id)
  SELECT id, v_actor, 'Chave de operação (apagar grupo)', _key, NULL, v_company
  FROM public.transactions
  WHERE company_id = v_company AND operation_key = _key;

  UPDATE public.transactions
  SET operation_key = NULL
  WHERE company_id = v_company AND operation_key = _key;
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Chave % não encontrada nesta empresa', _key USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object('key', _key, 'affected', v_affected);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_operation_key(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_operation_key(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_operation_key(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_operation_key(text) TO service_role;