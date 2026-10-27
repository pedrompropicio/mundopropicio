-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.materialize_paid_amount_payment()
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "752a5ba5565b37709ac56fcfb6f7bf9565295769a6e5bf801019688a4da44a2e", "live_properties_sha256": "46569a985ca4773ebb142cee5a72c2bd56556984cc5da0e3db0c24cd18ebdc5b", "oid": 294789, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "fadc631aefae92935c68dee08b18ed2be568a13f37d19c9528ec6ba819972c6c", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 75191b682880e1d45f44b35722fa04dbee78035f78b816ee9ae9a1cac071d519
CREATE OR REPLACE FUNCTION public.materialize_paid_amount_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_sum numeric; v_diff numeric; v_method text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.paid_amount IS NOT DISTINCT FROM OLD.paid_amount THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' AND COALESCE(NEW.paid_amount, 0) <= 0.01 THEN RETURN NULL; END IF;
  IF public._paid_guard_is_exempt(NEW) THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM public.transaction_payments
   WHERE transaction_id = NEW.id AND status = 'paid';
  v_diff := round(COALESCE(NEW.paid_amount, 0) - v_sum, 2);
  IF abs(v_diff) <= 0.01 THEN RETURN NULL; END IF;

  IF v_diff < 0 THEN
    UPDATE public.transaction_payments
       SET status = 'reversed', reversed_at = now(),
           reversal_reason = 'reajuste automático do valor pago (D-ERP157)'
     WHERE transaction_id = NEW.id AND status = 'paid' AND created_by = 'base D-ERP157';
    SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM public.transaction_payments
     WHERE transaction_id = NEW.id AND status = 'paid';
    v_diff := round(COALESCE(NEW.paid_amount, 0) - v_sum, 2);
  END IF;

  IF v_diff > 0.01 THEN
    v_method := CASE WHEN NEW.account_id IS NULL THEN 'compensation'
                     WHEN NEW.payment_method IN ('transfer','service_payment','direct_debit','state_payment') THEN NEW.payment_method
                     ELSE 'transfer' END;
    INSERT INTO public.transaction_payments
      (transaction_id, amount, payment_date, account_id, payment_method, status,
       closes_transaction, company_id, created_by, notes)
    VALUES
      (NEW.id, v_diff, COALESCE(NEW.payment_date, NEW.date, current_date),
       CASE WHEN v_method = 'compensation' THEN NULL ELSE NEW.account_id END,
       v_method, 'paid', NEW.status = 'paid', NEW.company_id, 'base D-ERP157',
       'Criado pela base: transação gravada com valor pago sem linha de pagamento ('
         || COALESCE(auth.jwt() ->> 'email', current_user) || ')');
  END IF;

  PERFORM public._derive_paid_amount(NEW.id);
  RETURN NULL;
END $function$
;

ALTER FUNCTION public.materialize_paid_amount_payment() OWNER TO "postgres";
-- END OPERATION 75191b682880e1d45f44b35722fa04dbee78035f78b816ee9ae9a1cac071d519
