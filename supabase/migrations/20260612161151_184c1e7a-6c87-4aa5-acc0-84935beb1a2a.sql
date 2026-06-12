CREATE OR REPLACE FUNCTION public.reverse_transaction(
  p_tx_id uuid,
  p_kind text,
  p_reason text,
  p_valid_until date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx RECORD;
  v_uid uuid := auth.uid();
  v_credit_id uuid;
  v_paid_amount numeric;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'platform_admin'::app_role)) THEN
    RAISE EXCEPTION 'Apenas administradores podem estornar transações';
  END IF;

  IF p_kind NOT IN ('cash_refund','supplier_credit') THEN
    RAISE EXCEPTION 'Tipo de estorno inválido: %', p_kind;
  END IF;

  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Motivo é obrigatório';
  END IF;

  SELECT * INTO v_tx
  FROM public.transactions
  WHERE id = p_tx_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transação não encontrada';
  END IF;

  IF v_tx.status = 'reversed' THEN
    RAISE EXCEPTION 'Transação já está estornada';
  END IF;

  IF coalesce(v_tx.paid_amount,0) <= 0 AND v_tx.status <> 'paid' THEN
    RAISE EXCEPTION 'Só transações com pagamento registado podem ser estornadas';
  END IF;

  v_paid_amount := coalesce(v_tx.paid_amount, 0);

  IF p_kind = 'supplier_credit' THEN
    IF v_tx.supplier_id IS NULL THEN
      RAISE EXCEPTION 'Transação não tem fornecedor — não é possível criar crédito';
    END IF;

    INSERT INTO public.supplier_credits (
      supplier_id,
      origin_event_id,
      amount,
      reason,
      valid_until,
      document_ref,
      status,
      created_by,
      company_id
    ) VALUES (
      v_tx.supplier_id,
      v_tx.event_id,
      v_paid_amount,
      'Estorno tx ' || v_tx.id::text || ' — ' || p_reason,
      p_valid_until,
      'reverse_tx:' || v_tx.id::text,
      'active',
      coalesce(v_uid::text, 'system'),
      v_tx.company_id
    ) RETURNING id INTO v_credit_id;

    UPDATE public.transaction_payments
       SET reversal_kind = 'supplier_credit',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = v_credit_id
     WHERE transaction_id = p_tx_id
       AND status = 'paid'
       AND reversal_kind IS NULL;

    UPDATE public.transactions
       SET status = 'reversed',
           reversal_kind = 'supplier_credit',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = v_credit_id,
           updated_at = now()
     WHERE id = p_tx_id;
  ELSE
    UPDATE public.transaction_payments
       SET status = 'reversed',
           reversal_kind = 'cash_refund',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid
     WHERE transaction_id = p_tx_id
       AND status = 'paid';

    DELETE FROM public.payment_list_items pli
      USING public.payment_lists pl
     WHERE pli.transaction_id = p_tx_id
       AND pli.payment_list_id = pl.id
       AND pl.status IN ('draft','pending_approval');

    UPDATE public.transactions
       SET status = 'reversed',
           paid_amount = 0,
           payment_date = NULL,
           reversal_kind = 'cash_refund',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           updated_at = now()
     WHERE id = p_tx_id;
  END IF;

  INSERT INTO public.system_audit_log (
    entity_type,
    entity_id,
    action,
    changed_by,
    old_data,
    new_data,
    metadata,
    company_id
  ) VALUES (
    'transaction',
    p_tx_id::text,
    'reverse_transaction_' || p_kind,
    coalesce(v_uid::text, 'system'),
    to_jsonb(v_tx),
    jsonb_build_object(
      'status', 'reversed',
      'reversal_kind', p_kind,
      'reversal_reason', p_reason,
      'supplier_credit_id', v_credit_id
    ),
    jsonb_build_object(
      'reason', p_reason,
      'amount', v_paid_amount,
      'supplier_credit_id', v_credit_id,
      'valid_until', p_valid_until
    ),
    v_tx.company_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'transaction_id', p_tx_id,
    'kind', p_kind,
    'supplier_credit_id', v_credit_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_transaction(uuid, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(uuid, text, text, date) TO authenticated;