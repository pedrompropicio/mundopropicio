CREATE OR REPLACE FUNCTION public.create_card_session_load(
  p_session_id uuid,
  p_amount numeric,
  p_load_date date,
  p_source_account_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.create_card_session_load(uuid, numeric, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_card_session_load(uuid, numeric, date, uuid, text) TO service_role;