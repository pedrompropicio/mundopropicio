-- #296: paid_amount e estado da fatura da sala passam a ser só dos triggers de transaction_payments
-- (trg_sync_paid_amount_from_payments / trg_clear_reversal_on_repay). O ajuste manual somava por cima
-- e reverter um fecho confirmado falhava no guard_paid_amount_vs_payments.
-- A perna da transferência do próprio fecho (transfer_transaction_id / TRF-FECHO-) nunca é desligada.
CREATE OR REPLACE FUNCTION public.save_ticket_office_settlement(
  p_settlement_id uuid,
  p_payload jsonb,
  p_confirm boolean,
  p_selected jsonb,
  p_transfer jsonb,
  p_retained_payment_notes text,
  p_remainder_payment_notes text,
  p_audit_user text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_id uuid;
  v_prev public.ticket_office_settlements%ROWTYPE;
  v_has_prev boolean := false;
  v_office uuid := (p_payload->>'financial_account_id')::uuid;
  v_event uuid := nullif(p_payload->>'event_id','')::uuid;
  v_date date := (p_payload->>'settlement_date')::date;
  v_ids uuid[];
  v_ret_amt numeric := coalesce((p_payload->>'venue_retained_amount')::numeric, 0);
  v_inv uuid := nullif(p_payload->>'venue_retained_invoice_id','')::uuid;
  v_rem_applied boolean := coalesce((p_payload->>'venue_invoice_remainder_paid')::boolean, false);
  v_rem_amt numeric := coalesce((p_payload->>'venue_invoice_remainder_amount')::numeric, 0);
  v_need_rev boolean;
  v_need_rev_rem boolean;
  v_tx record;
  v_pay uuid;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.is_platform_admin(v_uid)
          OR public.has_permission(v_uid, 'manage_accounts')) THEN
    RAISE EXCEPTION 'Sem permissão para gravar o fecho de bilheteira' USING ERRCODE = '42501';
  END IF;
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa activa não resolvida' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = v_office AND company_id = v_company) THEN
    RAISE EXCEPTION 'Bilheteira de outra empresa' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg((x->>'id')::uuid), '{}') INTO v_ids FROM jsonb_array_elements(coalesce(p_selected,'[]'::jsonb)) x;
  IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = ANY(v_ids) AND t.company_id IS DISTINCT FROM v_company) THEN
    RAISE EXCEPTION 'Dedução de outra empresa' USING ERRCODE = '42501';
  END IF;
  IF v_inv IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = v_inv AND company_id = v_company) THEN
    RAISE EXCEPTION 'Fatura de outra empresa' USING ERRCODE = '42501';
  END IF;

  IF p_settlement_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.ticket_office_settlements WHERE id = p_settlement_id FOR UPDATE;
    IF v_prev.id IS NULL OR v_prev.company_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION 'Fecho não encontrado nesta empresa' USING ERRCODE = '42501';
    END IF;
    v_has_prev := true;
    v_id := p_settlement_id;
    UPDATE public.ticket_office_settlements SET
      financial_account_id = v_office, event_id = v_event, settlement_date = v_date,
      gross_revenue = (p_payload->>'gross_revenue')::numeric,
      total_deductions = (p_payload->>'total_deductions')::numeric,
      net_calculated = (p_payload->>'net_calculated')::numeric,
      net_adjusted = nullif(p_payload->>'net_adjusted','')::numeric,
      adjustment_notes = p_payload->>'adjustment_notes',
      gross_adjustment_notes = p_payload->>'gross_adjustment_notes',
      forma_liquidacao_manual = p_payload->>'forma_liquidacao_manual',
      forma_liquidacao_manual_notes = p_payload->>'forma_liquidacao_manual_notes',
      net_transferred = coalesce((p_payload->>'net_transferred')::numeric, 0),
      transfer_account_id = nullif(p_payload->>'transfer_account_id','')::uuid,
      document_url = p_payload->>'document_url',
      document_name = p_payload->>'document_name',
      notes = p_payload->>'notes',
      venue_retained_amount = v_ret_amt,
      venue_retained_invoice_id = v_inv,
      venue_retained_notes = p_payload->>'venue_retained_notes',
      venue_invoice_remainder_paid = v_rem_applied,
      venue_invoice_remainder_amount = v_rem_amt,
      status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'draft' END,
      closed_at = CASE WHEN p_confirm THEN now() ELSE closed_at END,
      closed_by = CASE WHEN p_confirm THEN v_uid ELSE closed_by END
    WHERE id = v_id;
  ELSE
    INSERT INTO public.ticket_office_settlements (
      company_id, financial_account_id, event_id, settlement_date, gross_revenue, total_deductions,
      net_calculated, net_adjusted, adjustment_notes, gross_adjustment_notes,
      forma_liquidacao_manual, forma_liquidacao_manual_notes, net_transferred, transfer_account_id,
      document_url, document_name, notes, venue_retained_amount, venue_retained_invoice_id,
      venue_retained_notes, venue_invoice_remainder_paid, venue_invoice_remainder_amount,
      status, closed_at, closed_by, created_by
    ) VALUES (
      v_company, v_office, v_event, v_date, (p_payload->>'gross_revenue')::numeric,
      (p_payload->>'total_deductions')::numeric, (p_payload->>'net_calculated')::numeric,
      nullif(p_payload->>'net_adjusted','')::numeric, p_payload->>'adjustment_notes',
      p_payload->>'gross_adjustment_notes', p_payload->>'forma_liquidacao_manual',
      p_payload->>'forma_liquidacao_manual_notes', coalesce((p_payload->>'net_transferred')::numeric, 0),
      nullif(p_payload->>'transfer_account_id','')::uuid, p_payload->>'document_url',
      p_payload->>'document_name', p_payload->>'notes', v_ret_amt, v_inv,
      p_payload->>'venue_retained_notes', v_rem_applied, v_rem_amt,
      CASE WHEN p_confirm THEN 'confirmed' ELSE 'draft' END,
      CASE WHEN p_confirm THEN now() END, CASE WHEN p_confirm THEN v_uid END, v_uid
    ) RETURNING id INTO v_id;
  END IF;

  IF p_confirm AND p_transfer IS NOT NULL AND coalesce((p_transfer->>'amount')::numeric,0) > 0
     AND NOT (v_has_prev AND v_prev.transfer_transaction_id IS NOT NULL) THEN
    PERFORM public.create_settlement_transfer(v_id, v_office, (p_transfer->>'to_account_id')::uuid,
      (p_transfer->>'amount')::numeric, v_date, coalesce((p_transfer->>'credited')::boolean, false));
  END IF;

  IF v_has_prev THEN
    UPDATE public.transactions t SET settlement_id = NULL
     WHERE t.settlement_id = v_id
       AND NOT (t.id = ANY(v_ids))
       AND t.id IS DISTINCT FROM (SELECT transfer_transaction_id FROM public.ticket_office_settlements WHERE id = v_id)
       AND coalesce(t.operation_key,'') NOT LIKE 'TRF-FECHO-%';
  END IF;

  IF array_length(v_ids,1) > 0 THEN
    IF p_confirm THEN
      FOR r IN SELECT (x->>'id')::uuid AS id, (x->>'paid_amount')::numeric AS paid
                 FROM jsonb_array_elements(p_selected) x LOOP
        IF r.paid IS NULL THEN
          UPDATE public.transactions SET settlement_id = v_id WHERE id = r.id;
          CONTINUE;
        END IF;
        SELECT id, reversed_at INTO v_tx FROM public.transactions WHERE id = r.id FOR UPDATE;
        IF v_tx.id IS NULL THEN RAISE EXCEPTION 'Dedução % não encontrada', r.id; END IF;
        UPDATE public.transactions SET settlement_id = v_id, status = 'paid', payment_date = v_date,
               account_id = v_office, paid_amount = r.paid,
               reversed_at = CASE WHEN v_tx.reversed_at IS NOT NULL THEN NULL ELSE reversed_at END,
               reversal_kind = CASE WHEN v_tx.reversed_at IS NOT NULL THEN NULL ELSE reversal_kind END
         WHERE id = r.id;
        IF v_tx.reversed_at IS NOT NULL THEN
          INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value)
          VALUES (r.id, p_audit_user, 'Estorno', 'Estornada em ' || to_char(v_tx.reversed_at, 'YYYY-MM-DD'),
                  'Carimbo de estorno limpo — transação voltou a ser paga');
        END IF;
      END LOOP;
    ELSE
      UPDATE public.transactions SET settlement_id = v_id WHERE id = ANY(v_ids);
    END IF;
  END IF;

  v_need_rev := v_has_prev AND v_prev.venue_retained_payment_id IS NOT NULL AND (
    NOT p_confirm OR v_inv IS NULL OR v_inv IS DISTINCT FROM v_prev.venue_retained_invoice_id
    OR abs(v_ret_amt - coalesce(v_prev.venue_retained_amount,0)) > 0.005);
  IF v_need_rev THEN
    DELETE FROM public.transaction_payments WHERE id = v_prev.venue_retained_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento de compensação anterior não encontrado'; END IF;
    UPDATE public.ticket_office_settlements SET venue_retained_payment_id = NULL WHERE id = v_id;
  END IF;

  IF p_confirm AND v_ret_amt > 0 AND v_inv IS NOT NULL
     AND (v_need_rev OR NOT v_has_prev OR v_prev.venue_retained_payment_id IS NULL) THEN
    INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, payment_method, account_id, notes, created_by)
    VALUES (v_inv, v_ret_amt, v_date, 'compensation', NULL, p_retained_payment_notes, p_audit_user)
    RETURNING id INTO v_pay;
    UPDATE public.ticket_office_settlements SET venue_retained_payment_id = v_pay WHERE id = v_id;
  END IF;

  v_need_rev_rem := v_has_prev AND v_prev.venue_invoice_remainder_payment_id IS NOT NULL AND (
    NOT p_confirm OR NOT v_rem_applied OR v_inv IS NULL
    OR v_inv IS DISTINCT FROM v_prev.venue_retained_invoice_id
    OR abs(v_rem_amt - coalesce(v_prev.venue_invoice_remainder_amount,0)) > 0.005);
  IF v_need_rev_rem THEN
    DELETE FROM public.transaction_payments WHERE id = v_prev.venue_invoice_remainder_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento do saldo restante anterior não encontrado'; END IF;
    UPDATE public.ticket_office_settlements SET venue_invoice_remainder_payment_id = NULL WHERE id = v_id;
  END IF;

  IF p_confirm AND v_rem_applied AND v_inv IS NOT NULL
     AND (v_need_rev_rem OR NOT v_has_prev OR v_prev.venue_invoice_remainder_payment_id IS NULL) THEN
    INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, payment_method, account_id, notes, created_by)
    VALUES (v_inv, v_rem_amt, v_date, 'transfer', v_office, p_remainder_payment_notes, p_audit_user)
    RETURNING id INTO v_pay;
    UPDATE public.ticket_office_settlements SET venue_invoice_remainder_payment_id = v_pay WHERE id = v_id;
  END IF;

  IF p_confirm AND v_event IS NOT NULL THEN
    UPDATE public.event_ticket_office_assignments
       SET is_conciliated = true, conciliated_at = now(), conciliated_by = coalesce(nullif(p_payload->>'conciliated_by',''), 'system')
     WHERE event_id = v_event AND financial_account_id = v_office;
  END IF;

  RETURN jsonb_build_object('settlement_id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ticket_office_settlement(uuid, jsonb, boolean, jsonb, jsonb, text, text, text) TO authenticated, service_role;