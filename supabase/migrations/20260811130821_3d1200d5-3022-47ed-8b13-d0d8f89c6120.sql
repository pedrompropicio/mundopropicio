CREATE OR REPLACE FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date DEFAULT NULL::date, p_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_payment public.transaction_payments%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_credit_id uuid;
  v_credit_amount numeric;
BEGIN
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

  IF v_payment.reversal_kind IS NOT NULL THEN
    RAISE EXCEPTION 'already_reversed: este pagamento já foi estornado (%)', v_payment.reversal_kind;
  END IF;

  IF v_payment.status <> 'paid' THEN
    RAISE EXCEPTION 'payment_not_paid: só parcelas pagas podem ser estornadas (status atual: %)', v_payment.status;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = v_payment.transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF p_kind = 'supplier_credit' THEN
    IF v_tx.supplier_id IS NULL THEN
      RAISE EXCEPTION 'no_supplier: a transação não tem fornecedor definido — não é possível criar crédito';
    END IF;

    v_credit_amount := coalesce(p_amount, v_payment.amount);
    IF v_credit_amount <= 0 OR v_credit_amount > v_payment.amount + 0.01 THEN
      RAISE EXCEPTION 'invalid_amount: valor do crédito deve estar entre 0 e % (valor do pagamento)', v_payment.amount;
    END IF;

    INSERT INTO public.supplier_credits (
      supplier_id, origin_event_id, amount, used_amount, reason, valid_until, status, created_by, company_id
    )
    VALUES (
      v_tx.supplier_id,
      v_tx.event_id,
      v_credit_amount,
      0,
      'Estorno: ' || p_reason || ' (TX ref ' || v_tx.id::text || ')',
      p_valid_until,
      'active',
      coalesce((SELECT email FROM auth.users WHERE id = v_uid), 'sistema'),
      v_payment.company_id
    )
    RETURNING id INTO v_credit_id;

    UPDATE public.transaction_payments
       SET reversal_kind = 'supplier_credit',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = v_credit_id,
           updated_at = now()
     WHERE id = p_payment_id;

  ELSE
    UPDATE public.transaction_payments
       SET status = 'reversed',
           reversal_kind = 'cash_refund',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           updated_at = now()
     WHERE id = p_payment_id;

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

    DELETE FROM public.payment_list_items
     WHERE transaction_id = v_tx.id
       AND payment_list_id IN (
         SELECT id FROM public.payment_lists
          WHERE status IN ('draft','pending_approval')
       );
  END IF;

  BEGIN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata)
    VALUES (
      'transaction_payment',
      p_payment_id::text,
      'reverse_payment_' || p_kind,
      coalesce((SELECT email FROM auth.users WHERE id = v_uid), 'sistema'),
      jsonb_build_object('status', v_payment.status, 'amount', v_payment.amount, 'account_id', v_payment.account_id),
      jsonb_build_object('reversal_kind', p_kind, 'reason', p_reason, 'supplier_credit_id', v_credit_id, 'credit_amount', v_credit_amount),
      jsonb_build_object('transaction_id', v_tx.id, 'event_id', v_tx.event_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'kind', p_kind,
    'payment_id', p_payment_id,
    'transaction_id', v_tx.id,
    'supplier_credit_id', v_credit_id,
    'credit_amount', v_credit_amount
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_supplier_credit(
  p_credit_id uuid,
  p_transaction_id uuid,
  p_amount numeric,
  p_payment_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_credit public.supplier_credits%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_remaining numeric;
  v_new_used numeric;
  v_usage_id uuid;
  v_actor text := coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), 'sistema');
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'manager'::app_role)) THEN
    RAISE EXCEPTION 'permission_denied: apenas admin ou manager podem abater créditos';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: valor a abater deve ser positivo';
  END IF;

  SELECT * INTO v_credit FROM public.supplier_credits WHERE id = p_credit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_not_found: %', p_credit_id;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found: %', p_transaction_id;
  END IF;

  IF v_tx.supplier_id IS DISTINCT FROM v_credit.supplier_id THEN
    RAISE EXCEPTION 'supplier_mismatch: o crédito pertence a outro fornecedor';
  END IF;

  IF v_credit.valid_until IS NOT NULL AND v_credit.valid_until < current_date THEN
    UPDATE public.supplier_credits SET status = 'expired', updated_at = now() WHERE id = p_credit_id;
    RAISE EXCEPTION 'credit_expired: crédito expirou em %', v_credit.valid_until;
  END IF;

  IF v_credit.status <> 'active' THEN
    RAISE EXCEPTION 'credit_not_active: estado atual %', v_credit.status;
  END IF;

  v_remaining := round((v_credit.amount - v_credit.used_amount)::numeric, 2);
  IF p_amount > v_remaining + 0.01 THEN
    RAISE EXCEPTION 'insufficient_credit: saldo disponível % (pedido %)', v_remaining, p_amount;
  END IF;

  INSERT INTO public.supplier_credit_usages (credit_id, transaction_id, amount, used_by, company_id, notes)
  VALUES (
    p_credit_id,
    p_transaction_id,
    p_amount,
    v_actor,
    v_credit.company_id,
    CASE WHEN p_payment_id IS NOT NULL THEN 'payment:' || p_payment_id::text ELSE NULL END
  )
  RETURNING id INTO v_usage_id;

  v_new_used := round((v_credit.used_amount + p_amount)::numeric, 2);
  UPDATE public.supplier_credits
     SET used_amount = v_new_used,
         status = CASE WHEN v_new_used >= v_credit.amount - 0.01 THEN 'exhausted' ELSE 'active' END,
         updated_at = now()
   WHERE id = p_credit_id;

  IF p_payment_id IS NOT NULL THEN
    UPDATE public.transaction_payments
       SET credit_amount = coalesce(credit_amount, 0) + p_amount,
           updated_at = now()
     WHERE id = p_payment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'payment_not_found: %', p_payment_id;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, new_data, metadata)
    VALUES (
      'supplier_credit', p_credit_id::text, 'apply_supplier_credit', v_actor,
      jsonb_build_object('amount', p_amount, 'usage_id', v_usage_id, 'new_used_amount', v_new_used),
      jsonb_build_object('transaction_id', p_transaction_id, 'payment_id', p_payment_id)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'usage_id', v_usage_id,
    'credit_id', p_credit_id,
    'applied', p_amount,
    'remaining', round((v_credit.amount - v_new_used)::numeric, 2)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_supplier_credits()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE public.supplier_credits
     SET status = 'expired', updated_at = now()
   WHERE status = 'active'
     AND valid_until IS NOT NULL
     AND valid_until < current_date;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_supplier_credit(uuid, uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_supplier_credits() TO authenticated;