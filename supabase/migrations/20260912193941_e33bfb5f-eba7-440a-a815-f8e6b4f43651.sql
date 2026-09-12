CREATE OR REPLACE FUNCTION public.create_settlement_transfer(
  p_settlement_id uuid,
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_date date,
  p_credited boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_settlement record;
  v_from_name text;
  v_to_name text;
  v_key text;
  v_desc text;
  v_out uuid;
  v_status text;
  v_paid numeric;
  v_pay_date date;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT (
      public.has_role(auth.uid(), 'admin')
      OR public.is_platform_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'manage_accounts')
    ) THEN
      RAISE EXCEPTION 'Sem permissão para lançar a transferência do fecho' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa activa não resolvida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settlement FROM public.ticket_office_settlements WHERE id = p_settlement_id;

  IF v_settlement.id IS NULL THEN
    RAISE EXCEPTION 'Fecho não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_settlement.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Fecho de outra empresa' USING ERRCODE = '42501';
  END IF;
  IF v_settlement.transfer_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este fecho já tem transferência lançada' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Valor da transferência tem de ser positivo' USING ERRCODE = '22023';
  END IF;
  IF p_from_account_id IS NULL OR p_to_account_id IS NULL THEN
    RAISE EXCEPTION 'Contas de origem e destino são obrigatórias' USING ERRCODE = '22023';
  END IF;
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Conta de origem e destino não podem ser a mesma' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_from_name FROM public.financial_accounts WHERE id = p_from_account_id;
  SELECT name INTO v_to_name FROM public.financial_accounts WHERE id = p_to_account_id;

  v_key := 'TRF-FECHO-' || upper(substring(replace(p_settlement_id::text, '-', '') FROM 1 FOR 8));
  v_desc := 'Transferência fecho bilheteira ' || coalesce(v_from_name, '?')
            || ' -> ' || coalesce(v_to_name, '?')
            || CASE WHEN p_credited THEN '' ELSE ' (a receber)' END;

  IF p_credited THEN
    v_status := 'paid'; v_paid := p_amount; v_pay_date := p_date;
  ELSE
    v_status := 'pending'; v_paid := 0; v_pay_date := NULL;
  END IF;

  INSERT INTO public.transactions (
    company_id, event_id, type, category_id, description, amount, iva_rate, date,
    status, paid_amount, payment_date, account_id, payment_method,
    exclude_from_result, currency, settlement_id, operation_key
  ) VALUES (
    v_company, v_settlement.event_id, 'expense', 'b32df086-c995-4747-a3f9-bfefa0063d0a',
    v_desc, p_amount, 0, p_date,
    v_status, v_paid, v_pay_date, p_from_account_id, 'transfer',
    true, 'EUR', p_settlement_id, v_key
  ) RETURNING id INTO v_out;

  INSERT INTO public.transactions (
    company_id, event_id, type, category_id, description, amount, iva_rate, date,
    status, paid_amount, payment_date, account_id, payment_method,
    exclude_from_result, currency, settlement_id, operation_key
  ) VALUES (
    v_company, v_settlement.event_id, 'income', 'b32df086-c995-4747-a3f9-bfefa0063d0a',
    v_desc, p_amount, 0, p_date,
    v_status, v_paid, v_pay_date, p_to_account_id, 'transfer',
    true, 'EUR', NULL, v_key
  );

  UPDATE public.ticket_office_settlements
  SET transfer_transaction_id = v_out,
      net_transferred = p_amount,
      transfer_account_id = p_to_account_id
  WHERE id = p_settlement_id;

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_settlement_transfer(uuid, uuid, uuid, numeric, date, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_settlement_transfer(uuid, uuid, uuid, numeric, date, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_settlement_transfer(uuid, uuid, uuid, numeric, date, boolean) TO authenticated;