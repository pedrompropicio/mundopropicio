CREATE OR REPLACE FUNCTION public.reverse_transaction(
  p_transaction_id uuid,
  p_reversal_kind text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx record;
  v_credit_id uuid;
  v_user uuid := auth.uid();
BEGIN
  IF NOT (has_role(v_user,'admin') OR has_role(v_user,'platform_admin')) THEN
    RAISE EXCEPTION 'Apenas admin pode estornar transações';
  END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.status <> 'paid' THEN RAISE EXCEPTION 'Só transações pagas podem ser estornadas'; END IF;
  IF p_reversal_kind NOT IN ('cash_refund','supplier_credit') THEN
    RAISE EXCEPTION 'reversal_kind inválido';
  END IF;

  IF p_reversal_kind = 'supplier_credit' THEN
    IF v_tx.supplier_id IS NULL THEN
      RAISE EXCEPTION 'Transação sem fornecedor não pode gerar crédito';
    END IF;
    INSERT INTO supplier_credits (supplier_id, amount, remaining_amount, source_transaction_id, notes, company_id)
    VALUES (v_tx.supplier_id, v_tx.paid_amount, v_tx.paid_amount, v_tx.id,
            'Estorno: ' || COALESCE(p_reason,''), v_tx.company_id)
    RETURNING id INTO v_credit_id;

    UPDATE transactions SET
      status = 'reversed',
      reversal_kind = 'supplier_credit',
      reversal_reason = p_reason,
      reversed_at = now(),
      reversed_by = v_user,
      supplier_credit_id = v_credit_id,
      updated_at = now()
    WHERE id = p_transaction_id;
  ELSE
    UPDATE transactions SET
      status = 'reversed',
      reversal_kind = 'cash_refund',
      reversal_reason = p_reason,
      reversed_at = now(),
      reversed_by = v_user,
      paid_amount = 0,
      updated_at = now()
    WHERE id = p_transaction_id;
  END IF;

  INSERT INTO system_audit_log (entity_type, entity_id, action, changed_by, metadata, company_id)
  VALUES ('transaction', p_transaction_id, 'reversed', v_user,
          jsonb_build_object('kind', p_reversal_kind, 'reason', p_reason, 'credit_id', v_credit_id),
          v_tx.company_id);

  RETURN jsonb_build_object('ok', true, 'credit_id', v_credit_id);
END;
$$;