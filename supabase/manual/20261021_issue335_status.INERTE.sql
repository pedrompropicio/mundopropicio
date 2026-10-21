-- LOCAL/INERTE separate existing-object candidate; separate Sim required.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF position('issue335-approval-v2l' in pg_get_functiondef('public.enforce_transaction_approval_permission()'::regprocedure))=0 THEN
  RAISE EXCEPTION 'installation_order: approval_before_status'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public._derive_paid_amount(p_tx_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric; v_iva_rate numeric; v_status text; v_currency text;
  v_parent uuid; v_split numeric; v_reimb boolean;
  v_gross numeric; v_paid_sum numeric; v_max_paid_date date; v_closes boolean;
  prior record;
BEGIN
  -- issue335-status-v2l: exact earlier state only inside proven reversal; all other paths unchanged.
  SELECT t.amount, COALESCE(t.iva_rate, 0), t.status, COALESCE(t.currency, 'EUR'),
         t.parent_transaction_id, t.split_percentage, COALESCE(t.is_reimbursement, false)
    INTO v_amount, v_iva_rate, v_status, v_currency, v_parent, v_split, v_reimb
    FROM public.transactions t WHERE t.id = p_tx_id;
  IF v_amount IS NULL THEN RETURN; END IF;
  IF (v_parent IS NOT NULL AND v_split IS NOT NULL) OR v_reimb
     OR EXISTS (SELECT 1 FROM public.partner_paid_expenses p WHERE p.transaction_id = p_tx_id)
  THEN RETURN; END IF;
  v_gross := v_amount * (1 + v_iva_rate / 100.0);
  SELECT COALESCE(SUM(p.amount), 0), MAX(p.payment_date),
         COALESCE(bool_or(COALESCE(p.closes_transaction, false)), false)
    INTO v_paid_sum, v_max_paid_date, v_closes FROM public.transaction_payments p
   WHERE p.transaction_id = p_tx_id AND p.status = 'paid';
  IF public.issue335_context_valid('reverse') THEN
   SELECT i.* INTO prior FROM public.transaction_offset_items i JOIN public.transaction_offset_groups g ON g.id=i.group_id
   WHERE i.transaction_id=p_tx_id AND g.status='reversing' AND i.prior_paid_amount=v_paid_sum
    AND NOT EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.offset_group_id=g.id AND p.transaction_id=p_tx_id
       AND (p.status<>'reversed' OR p.reversed_at IS NULL));
   IF FOUND THEN
    UPDATE public.transactions SET paid_amount=v_paid_sum,status=prior.prior_status,
      payment_date=prior.prior_payment_date,updated_at=now() WHERE id=p_tx_id;
    RETURN;
   END IF;
  END IF;
  IF v_paid_sum <= 0.01 THEN
    UPDATE public.transactions SET paid_amount=0,
      status=CASE WHEN v_status IN('paid','partially_paid') THEN 'approved' ELSE v_status END,
      payment_date=NULL,updated_at=now() WHERE id=p_tx_id;
  ELSIF v_paid_sum >= v_gross - 0.05 OR (v_currency <> 'EUR' AND v_closes) THEN
    UPDATE public.transactions SET paid_amount=v_paid_sum,status='paid',
      payment_date=COALESCE(v_max_paid_date,CURRENT_DATE),updated_at=now() WHERE id=p_tx_id;
  ELSE
    UPDATE public.transactions SET paid_amount=v_paid_sum,status='approved',payment_date=NULL,updated_at=now() WHERE id=p_tx_id;
  END IF;
END;
$function$;
COMMIT;