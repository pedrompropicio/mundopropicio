CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id uuid;
  v_has_schedule boolean;
  v_old_was_schedule boolean := false;
  v_tx_amount numeric;
  v_iva_rate numeric;
  v_gross numeric;
  v_paid_sum numeric;
  v_current_status text;
  v_max_paid_date date;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  v_has_schedule := public.tx_has_installment_schedule(v_tx_id);

  -- Em DELETE, OLD existe sempre num trigger ROW; "OLD IS NOT NULL" falha
  -- para composites com qualquer campo NULL, por isso usamos TG_OP directamente.
  IF TG_OP = 'DELETE' THEN
    v_old_was_schedule := (
      OLD.scheduled_date IS NOT NULL
      OR OLD.status IN ('planned','cancelled','paid')
    );
  END IF;

  -- Só age em TXs com cronograma (presente ou recém-removido)
  IF NOT v_has_schedule AND NOT v_old_was_schedule THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT amount, COALESCE(iva_rate, 0), status
    INTO v_tx_amount, v_iva_rate, v_current_status
    FROM public.transactions
    WHERE id = v_tx_id;

  IF v_tx_amount IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_gross := v_tx_amount * (1 + v_iva_rate / 100.0);

  SELECT COALESCE(SUM(amount), 0), MAX(payment_date)
    INTO v_paid_sum, v_max_paid_date
    FROM public.transaction_payments
    WHERE transaction_id = v_tx_id
      AND status = 'paid';

  IF v_paid_sum <= 0.01 THEN
    UPDATE public.transactions
       SET paid_amount = 0,
           status = CASE WHEN v_current_status IN ('paid','partially_paid') THEN 'pending' ELSE v_current_status END,
           payment_date = NULL,
           updated_at = now()
     WHERE id = v_tx_id;
  ELSIF v_paid_sum >= v_gross - 0.01 THEN
    UPDATE public.transactions
       SET paid_amount = v_paid_sum,
           status = 'paid',
           payment_date = COALESCE(v_max_paid_date, CURRENT_DATE),
           updated_at = now()
     WHERE id = v_tx_id;
  ELSE
    UPDATE public.transactions
       SET paid_amount = v_paid_sum,
           status = 'partially_paid',
           payment_date = NULL,
           updated_at = now()
     WHERE id = v_tx_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;