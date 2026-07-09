CREATE OR REPLACE FUNCTION public.reverse_transaction(
  p_tx_id uuid,
  p_kind text,
  p_reason text,
  p_valid_until date,
  p_release_for_repayment boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx RECORD;
  v_uid uuid := auth.uid();
  v_credit_id uuid;
  v_paid_amount numeric;
  v_account_name text;
  v_removed_from_lists jsonb := '[]'::jsonb;
  v_list RECORD;
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

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.status = 'reversed' THEN RAISE EXCEPTION 'Transação já está estornada'; END IF;
  IF coalesce(v_tx.paid_amount,0) <= 0 AND v_tx.status <> 'paid' THEN
    RAISE EXCEPTION 'Só transações com pagamento registado podem ser estornadas';
  END IF;

  v_paid_amount := coalesce(v_tx.paid_amount, 0);

  SELECT name INTO v_account_name FROM public.financial_accounts WHERE id = v_tx.account_id;

  IF p_kind = 'supplier_credit' THEN
    IF v_tx.supplier_id IS NULL THEN
      RAISE EXCEPTION 'Transação não tem fornecedor — não é possível criar crédito';
    END IF;

    INSERT INTO public.supplier_credits (
      supplier_id, origin_event_id, amount, reason, valid_until,
      document_ref, status, created_by, company_id
    ) VALUES (
      v_tx.supplier_id, v_tx.event_id, v_paid_amount,
      'Estorno tx ' || v_tx.id::text || ' — ' || p_reason,
      p_valid_until, 'reverse_tx:' || v_tx.id::text, 'active',
      coalesce(v_uid::text, 'system'), v_tx.company_id
    ) RETURNING id INTO v_credit_id;

    UPDATE public.transaction_payments
       SET reversal_kind = 'supplier_credit', reversal_reason = p_reason,
           reversed_at = now(), reversed_by = v_uid, supplier_credit_id = v_credit_id
     WHERE transaction_id = p_tx_id AND status = 'paid' AND reversal_kind IS NULL;
  ELSE
    UPDATE public.transaction_payments
       SET status = 'reversed', reversal_kind = 'cash_refund',
           reversal_reason = p_reason, reversed_at = now(), reversed_by = v_uid
     WHERE transaction_id = p_tx_id AND status = 'paid';
  END IF;

  DELETE FROM public.payment_list_items pli
   USING public.payment_lists pl
   WHERE pli.transaction_id = p_tx_id
     AND pli.payment_list_id = pl.id
     AND pl.status IN ('draft','pending_approval');

  IF p_release_for_repayment THEN
    FOR v_list IN
      SELECT pl.id AS list_id, pl.title AS list_name, pl.status AS list_status, pli.id AS pli_id
        FROM public.payment_list_items pli
        JOIN public.payment_lists pl ON pl.id = pli.payment_list_id
       WHERE pli.transaction_id = p_tx_id
         AND pl.status IN ('approved','paid')
    LOOP
      DELETE FROM public.payment_list_items WHERE id = v_list.pli_id;
      v_removed_from_lists := v_removed_from_lists || jsonb_build_object(
        'list_id', v_list.list_id, 'list_name', v_list.list_name, 'list_status', v_list.list_status
      );
    END LOOP;
  ELSE
    FOR v_list IN
      SELECT pl.id AS list_id, pl.title AS list_name, pl.status AS list_status
        FROM public.payment_list_items pli
        JOIN public.payment_lists pl ON pl.id = pli.payment_list_id
       WHERE pli.transaction_id = p_tx_id
         AND pl.status IN ('approved','paid')
    LOOP
      INSERT INTO public.transaction_audit_log (
        transaction_id, changed_by, field_name, old_value, new_value, company_id
      ) VALUES (
        p_tx_id, coalesce(v_uid::text, 'system'),
        'Estorno — lista mantida',
        v_list.list_name || ' (' || v_list.list_status || ')',
        'Transação estornada mas mantida na lista (modo conservador). Para libertar, refaça o estorno com "libertar para nova liquidação".',
        v_tx.company_id
      );
    END LOOP;
  END IF;

  IF p_release_for_repayment THEN
    UPDATE public.transactions
       SET status = 'pending',
           paid_amount = 0,
           payment_date = NULL,
           manually_marked_paid = false,
           reversal_kind = p_kind,
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = CASE WHEN p_kind='supplier_credit' THEN v_credit_id ELSE supplier_credit_id END,
           updated_at = now()
     WHERE id = p_tx_id;
  ELSE
    UPDATE public.transactions
       SET status = 'reversed',
           paid_amount = CASE WHEN p_kind='cash_refund' THEN 0 ELSE paid_amount END,
           payment_date = CASE WHEN p_kind='cash_refund' THEN NULL ELSE payment_date END,
           reversal_kind = p_kind,
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = CASE WHEN p_kind='supplier_credit' THEN v_credit_id ELSE supplier_credit_id END,
           updated_at = now()
     WHERE id = p_tx_id;
  END IF;

  INSERT INTO public.transaction_audit_log (
    transaction_id, changed_by, field_name, old_value, new_value, company_id
  ) VALUES (
    p_tx_id,
    coalesce(v_uid::text, 'system'),
    'Estorno',
    'paid',
    CASE WHEN p_kind = 'cash_refund'
         THEN 'Devolução em dinheiro — ' || to_char(v_paid_amount,'FM999G999G990D00') || ' € repostos' ||
              coalesce(' em ' || v_account_name, '') || ' — ' || p_reason
         ELSE 'Crédito do fornecedor — ' || to_char(v_paid_amount,'FM999G999G990D00') || ' € — ' || p_reason
    END
      || CASE WHEN p_release_for_repayment
              THEN ' · Libertada para nova liquidação (status → A pagar)'
              ELSE ' · Estornada (status → Estornada)'
         END,
    v_tx.company_id
  );

  INSERT INTO public.system_audit_log (
    entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id
  ) VALUES (
    'transaction', p_tx_id::text, 'reverse_transaction_' || p_kind,
    coalesce(v_uid::text, 'system'), to_jsonb(v_tx),
    jsonb_build_object(
      'status', CASE WHEN p_release_for_repayment THEN 'pending' ELSE 'reversed' END,
      'reversal_kind', p_kind,
      'reversal_reason', p_reason,
      'supplier_credit_id', v_credit_id,
      'released_for_repayment', p_release_for_repayment,
      'removed_from_lists', v_removed_from_lists
    ),
    jsonb_build_object(
      'reason', p_reason,
      'amount', v_paid_amount,
      'supplier_credit_id', v_credit_id,
      'valid_until', p_valid_until,
      'released_for_repayment', p_release_for_repayment
    ),
    v_tx.company_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'transaction_id', p_tx_id,
    'kind', p_kind,
    'supplier_credit_id', v_credit_id,
    'released_for_repayment', p_release_for_repayment,
    'new_status', CASE WHEN p_release_for_repayment THEN 'pending' ELSE 'reversed' END,
    'removed_from_lists', v_removed_from_lists
  );
END;
$function$;