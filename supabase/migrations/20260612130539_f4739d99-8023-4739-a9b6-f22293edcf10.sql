
-- ============================================================
-- Reverse Payment (Estorno) — schema + RPC
-- ============================================================

-- 1) Novas colunas em transaction_payments
ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS reversal_kind text,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS supplier_credit_id uuid REFERENCES public.supplier_credits(id) ON DELETE SET NULL;

-- CHECK no reversal_kind
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transaction_payments_reversal_kind_check'
  ) THEN
    ALTER TABLE public.transaction_payments
      ADD CONSTRAINT transaction_payments_reversal_kind_check
      CHECK (reversal_kind IS NULL OR reversal_kind IN ('cash_refund','supplier_credit'));
  END IF;
END $$;

-- 2) Expandir status CHECK p/ incluir 'reversed'
ALTER TABLE public.transaction_payments
  DROP CONSTRAINT IF EXISTS transaction_payments_status_check;
ALTER TABLE public.transaction_payments
  ADD CONSTRAINT transaction_payments_status_check
  CHECK (status IN ('planned','paid','cancelled','reversed'));

-- 3) RPC reverse_payment — só admin
CREATE OR REPLACE FUNCTION public.reverse_payment(
  p_payment_id uuid,
  p_kind text,
  p_reason text,
  p_valid_until date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payment public.transaction_payments%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_credit_id uuid;
  v_event_name text;
BEGIN
  -- Permissão: só admin
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'permission_denied: apenas administradores podem estornar pagamentos';
  END IF;

  IF p_kind NOT IN ('cash_refund','supplier_credit') THEN
    RAISE EXCEPTION 'invalid_kind: % (esperado cash_refund | supplier_credit)', p_kind;
  END IF;

  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'reason_required: motivo do estorno é obrigatório';
  END IF;

  SELECT * INTO v_payment FROM public.transaction_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found: %', p_payment_id;
  END IF;

  IF v_payment.status <> 'paid' THEN
    RAISE EXCEPTION 'payment_not_paid: só parcelas pagas podem ser estornadas (status atual: %)', v_payment.status;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = v_payment.transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  -- ============ V2: SUPPLIER CREDIT ============
  IF p_kind = 'supplier_credit' THEN
    IF v_tx.supplier_id IS NULL THEN
      RAISE EXCEPTION 'no_supplier: a transação não tem fornecedor definido — não é possível criar crédito';
    END IF;

    INSERT INTO public.supplier_credits (
      supplier_id, origin_event_id, amount, used_amount, reason, valid_until, status, created_by, company_id
    )
    VALUES (
      v_tx.supplier_id,
      v_tx.event_id,
      v_payment.amount,
      0,
      'Estorno: ' || p_reason || ' (TX ref ' || v_tx.id::text || ')',
      p_valid_until,
      'active',
      coalesce((SELECT email FROM auth.users WHERE id = v_uid), 'sistema'),
      v_payment.company_id
    )
    RETURNING id INTO v_credit_id;

    -- Mantém status='paid'; só marca metadados de estorno
    UPDATE public.transaction_payments
       SET reversal_kind = 'supplier_credit',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = v_credit_id,
           updated_at = now()
     WHERE id = p_payment_id;

  -- ============ V1: CASH REFUND ============
  ELSE
    -- Marcar como reversed → trigger sync_paid_amount_from_payments recalcula TX
    UPDATE public.transaction_payments
       SET status = 'reversed',
           reversal_kind = 'cash_refund',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           updated_at = now()
     WHERE id = p_payment_id;

    -- Para TXs SEM cronograma de parcelas, o trigger não age → recalcular manualmente
    IF NOT public.tx_has_installment_schedule(v_tx.id) THEN
      DECLARE
        v_paid_sum numeric;
        v_max_date date;
        v_gross numeric := v_tx.amount * (1 + coalesce(v_tx.iva_rate, 0) / 100.0);
      BEGIN
        SELECT coalesce(SUM(amount),0), MAX(payment_date) INTO v_paid_sum, v_max_date
          FROM public.transaction_payments
         WHERE transaction_id = v_tx.id AND status = 'paid';

        IF v_paid_sum <= 0.01 THEN
          UPDATE public.transactions
             SET paid_amount = 0,
                 status = CASE WHEN status IN ('paid','partially_paid') THEN 'approved' ELSE status END,
                 payment_date = NULL,
                 updated_at = now()
           WHERE id = v_tx.id;
        ELSIF v_paid_sum >= v_gross - 0.01 THEN
          UPDATE public.transactions
             SET paid_amount = v_paid_sum, status = 'paid', payment_date = v_max_date, updated_at = now()
           WHERE id = v_tx.id;
        ELSE
          UPDATE public.transactions
             SET paid_amount = v_paid_sum, status = 'partially_paid', payment_date = NULL, updated_at = now()
           WHERE id = v_tx.id;
        END IF;
      END;
    END IF;

    -- Remover de listas de pagamento "abertas" (draft/pending_approval) — listas já pagas/fechadas ficam histórico
    DELETE FROM public.payment_list_items
     WHERE transaction_id = v_tx.id
       AND payment_list_id IN (
         SELECT id FROM public.payment_lists
          WHERE status IN ('draft','pending_approval')
       );
  END IF;

  -- Audit log (ambos)
  BEGIN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata)
    VALUES (
      'transaction_payment',
      p_payment_id::text,
      'reverse_payment_' || p_kind,
      coalesce((SELECT email FROM auth.users WHERE id = v_uid), 'sistema'),
      jsonb_build_object('status', v_payment.status, 'amount', v_payment.amount, 'account_id', v_payment.account_id),
      jsonb_build_object('reversal_kind', p_kind, 'reason', p_reason, 'supplier_credit_id', v_credit_id),
      jsonb_build_object('transaction_id', v_tx.id, 'event_id', v_tx.event_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- audit não deve bloquear
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'kind', p_kind,
    'payment_id', p_payment_id,
    'transaction_id', v_tx.id,
    'supplier_credit_id', v_credit_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_payment(uuid, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_payment(uuid, text, text, date) TO authenticated;
