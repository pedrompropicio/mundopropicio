CREATE OR REPLACE FUNCTION public.renegotiate_transaction_installments(p_transaction_id uuid, p_installments jsonb, p_changed_by text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Renegocia uma despesa de pagamento único num grupo estrutural de N parcelas.
--
-- p_installments: array ORDENADO de { "due_date": "YYYY-MM-DD", "amount": <BASE, sem IVA> }.
-- O cliente converte bruto->base (computeInstallmentNets) ANTES de chamar.
DECLARE
  v_uid uuid := auth.uid();
  v_tx public.transactions%ROWTYPE;
  v_n int;
  v_sum numeric := 0;
  v_group_id uuid;
  v_base_desc text;
  v_item jsonb;
  v_i int;
  v_amount numeric;
  v_due date;
  v_first_amount numeric;
  v_first_due date;
  v_old_amount numeric;
  v_old_due date;
  v_new_id uuid;
  v_event_status text;
BEGIN
  IF NOT (
    public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'manager'::app_role)
    OR public.has_permission(v_uid, 'manage_transactions')
  ) THEN
    RAISE EXCEPTION 'permission_denied: sem permissão para renegociar em parcelas';
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found: %', p_transaction_id;
  END IF;

  IF v_tx.type <> 'expense' THEN
    RAISE EXCEPTION 'not_expense: apenas despesas podem ser renegociadas em parcelas';
  END IF;

  IF coalesce(v_tx.paid_amount, 0) > 0 THEN
    RAISE EXCEPTION 'already_paid: a transação já tem valor pago (%)', v_tx.paid_amount;
  END IF;

  IF EXISTS (SELECT 1 FROM public.transaction_payments WHERE transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'has_payments: a transação já tem pagamentos registados';
  END IF;

  IF v_tx.installment_group_id IS NOT NULL THEN
    RAISE EXCEPTION 'already_installment_group: a transação já pertence a um grupo de parcelas';
  END IF;

  IF v_tx.split_percentage IS NOT NULL THEN
    RAISE EXCEPTION 'is_split: transações de rateio não podem ser renegociadas em parcelas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.transactions
     WHERE parent_transaction_id = p_transaction_id
       AND split_percentage IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'is_split_parent: transações rateadas entre eventos não podem ser renegociadas em parcelas; ajuste o rateio primeiro';
  END IF;

  IF coalesce(v_tx.is_reimbursement, false) THEN
    RAISE EXCEPTION 'is_reimbursement: notas de reembolso não podem ser renegociadas em parcelas';
  END IF;

  IF coalesce(v_tx.is_transitory, false) THEN
    RAISE EXCEPTION 'is_transitory: transações transitórias não podem ser renegociadas em parcelas';
  END IF;

  IF EXISTS (SELECT 1 FROM public.partner_paid_expenses WHERE transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'is_partner_paid: despesas pagas por sócio não podem ser renegociadas em parcelas';
  END IF;

  IF EXISTS (SELECT 1 FROM public.partner_advance_expenses WHERE transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'is_partner_extra: extras de sócio não podem ser renegociados em parcelas';
  END IF;

  IF v_tx.event_id IS NOT NULL THEN
    SELECT status INTO v_event_status FROM public.events WHERE id = v_tx.event_id;
    IF v_event_status = 'completed' THEN
      RAISE EXCEPTION 'event_completed: o evento associado está fechado';
    END IF;
  END IF;

  IF p_installments IS NULL OR jsonb_typeof(p_installments) <> 'array' THEN
    RAISE EXCEPTION 'invalid_installments: lista de parcelas inválida';
  END IF;

  v_n := jsonb_array_length(p_installments);
  IF v_n < 2 THEN
    RAISE EXCEPTION 'too_few_installments: são necessárias pelo menos 2 parcelas (recebidas %)', v_n;
  END IF;

  FOR v_i IN 0..v_n - 1 LOOP
    v_item := p_installments -> v_i;
    IF v_item ->> 'due_date' IS NULL OR trim(v_item ->> 'due_date') = '' THEN
      RAISE EXCEPTION 'invalid_due_date: parcela % sem data de vencimento', v_i + 1;
    END IF;
    v_amount := (v_item ->> 'amount')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'invalid_amount: parcela % com valor inválido', v_i + 1;
    END IF;
    v_sum := v_sum + v_amount;
  END LOOP;

  IF abs(v_sum - v_tx.amount) > 0.01 THEN
    RAISE EXCEPTION 'installments_sum_mismatch: soma das parcelas % difere do valor da transação %', v_sum, v_tx.amount;
  END IF;

  v_group_id := gen_random_uuid();
  v_base_desc := trim(regexp_replace(coalesce(v_tx.description, ''), '\(\s*\d+\s*/\s*\d+\s*\)\s*$', ''));
  v_old_amount := v_tx.amount;
  v_old_due := v_tx.due_date;
  v_first_amount := ((p_installments -> 0) ->> 'amount')::numeric;
  v_first_due := ((p_installments -> 0) ->> 'due_date')::date;

  UPDATE public.transactions
     SET description = v_base_desc || ' (1/' || v_n || ')',
         amount = v_first_amount,
         due_date = v_first_due,
         installment_group_id = v_group_id,
         installment_number = 1,
         installment_total = v_n,
         original_amount = CASE
           WHEN coalesce(v_tx.currency, 'EUR') <> 'EUR' AND v_tx.original_amount IS NOT NULL AND coalesce(v_old_amount, 0) <> 0
             THEN round(v_tx.original_amount * v_first_amount / v_old_amount, 2)
           ELSE v_tx.original_amount
         END,
         updated_at = now()
   WHERE id = p_transaction_id;

  INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value)
  VALUES
    (p_transaction_id, p_changed_by, 'Valor (renegociação em parcelas)', round(v_old_amount, 2)::text, round(v_first_amount, 2)::text),
    (p_transaction_id, p_changed_by, 'Data Vencimento (renegociação em parcelas)', coalesce(v_old_due::text, ''), v_first_due::text);

  FOR v_i IN 1..v_n - 1 LOOP
    v_item := p_installments -> v_i;
    v_amount := (v_item ->> 'amount')::numeric;
    v_due := (v_item ->> 'due_date')::date;

    INSERT INTO public.transactions (
      description, type, amount, iva_rate, event_id, category_id, supplier_id, account_id,
      specification, date, due_date, status, paid_amount, payment_date,
      is_reimbursement, is_transitory, exclude_from_result,
      invoice_ref, invoice_group_id, payment_method, payment_entity, payment_reference,
      ordering_partner_id, paying_partner_id,
      currency, fx_rate, fx_rate_source, original_amount,
      parent_transaction_id, installment_group_id, installment_number, installment_total,
      split_percentage, split_amount, company_id
    ) VALUES (
      v_base_desc || ' (' || (v_i + 1) || '/' || v_n || ')',
      v_tx.type, v_amount, v_tx.iva_rate, v_tx.event_id, v_tx.category_id, v_tx.supplier_id, v_tx.account_id,
      v_tx.specification, v_tx.date, v_due, v_tx.status, 0, NULL,
      false, false, coalesce(v_tx.exclude_from_result, false),
      v_tx.invoice_ref, v_tx.invoice_group_id, coalesce(v_tx.payment_method, 'transfer'), v_tx.payment_entity, v_tx.payment_reference,
      v_tx.ordering_partner_id, v_tx.paying_partner_id,
      coalesce(v_tx.currency, 'EUR'), v_tx.fx_rate, v_tx.fx_rate_source,
      CASE
        WHEN coalesce(v_tx.currency, 'EUR') <> 'EUR' AND v_tx.original_amount IS NOT NULL AND coalesce(v_old_amount, 0) <> 0
          THEN round(v_tx.original_amount * v_amount / v_old_amount, 2)
        ELSE NULL
      END,
      p_transaction_id, v_group_id, v_i + 1, v_n,
      NULL, NULL, v_tx.company_id
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value)
    VALUES (
      v_new_id, p_changed_by, 'Criação (renegociação em parcelas)', NULL,
      v_base_desc || ' (' || (v_i + 1) || '/' || v_n || ') — ' || round(v_amount, 2)::text || ' € (base) — venc. ' || v_due::text
    );
  END LOOP;

  RETURN v_group_id;
END;
$function$

;
