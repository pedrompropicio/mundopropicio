-- 1) Allow 'reversed' status on transactions
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'overdue'::text, 'partially_paid'::text, 'reversed'::text]));

-- 2) Reversal metadata columns on transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS reversal_kind text
    CHECK (reversal_kind IS NULL OR reversal_kind IN ('cash_refund','supplier_credit')),
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS supplier_credit_id uuid REFERENCES public.supplier_credits(id) ON DELETE SET NULL;

-- 3) RPC reverse_transaction — admin only, atomic
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
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem estornar transações';
  END IF;

  IF p_kind NOT IN ('cash_refund','supplier_credit') THEN
    RAISE EXCEPTION 'Tipo de estorno inválido: %', p_kind;
  END IF;
  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Motivo é obrigatório';
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;

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
      supplier_id, origin_event_id, amount, reason, valid_until,
      document_ref, status, created_by, company_id
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

    -- Marca parcelas pagas como convertidas em crédito (mantém status='paid')
    UPDATE public.transaction_payments
       SET reversal_kind = 'supplier_credit',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = v_credit_id
     WHERE transaction_id = p_tx_id AND status = 'paid' AND reversal_kind IS NULL;

    UPDATE public.transactions
       SET status = 'reversed',
           reversal_kind = 'supplier_credit',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = v_credit_id,
           updated_at = now()
     WHERE id = p_tx_id;

  ELSE -- cash_refund
    -- Marca parcelas pagas como estornadas (status='reversed' → saem do paid_amount via trigger)
    UPDATE public.transaction_payments
       SET status = 'reversed',
           reversal_kind = 'cash_refund',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid
     WHERE transaction_id = p_tx_id AND status = 'paid';

    -- Remove de listas de pagamento ainda em draft / pending_approval
    DELETE FROM public.payment_list_items pli
      USING public.payment_lists pl
     WHERE pli.transaction_id = p_tx_id
       AND pli.payment_list_id = pl.id
       AND pl.status IN ('draft','pending_approval');

    -- Para TXs sem parcelas o trigger não recalcula → forçamos zero
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

  -- Audit
  INSERT INTO public.system_audit_log (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    'reverse_transaction_' || p_kind,
    'transaction',
    p_tx_id,
    jsonb_build_object(
      'reason', p_reason,
      'amount', v_paid_amount,
      'supplier_credit_id', v_credit_id,
      'valid_until', p_valid_until
    )
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