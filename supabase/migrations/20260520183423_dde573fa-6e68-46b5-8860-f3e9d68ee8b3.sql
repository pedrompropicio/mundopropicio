
CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_has_schedule boolean;
  v_old_was_schedule boolean := false;
  v_tx_amount numeric;
  v_iva_rate numeric;
  v_gross numeric;
  v_paid_sum numeric;
  v_current_status text;
  v_new_status text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  -- Estado atual: existe alguma linha de cronograma?
  v_has_schedule := public.tx_has_installment_schedule(v_tx_id);

  -- Em DELETE, considerar também se a linha apagada participava do cronograma
  IF TG_OP = 'DELETE' AND OLD IS NOT NULL THEN
    v_old_was_schedule := (OLD.scheduled_date IS NOT NULL OR OLD.status IN ('planned','cancelled'));
  END IF;

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

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_sum
    FROM public.transaction_payments
    WHERE transaction_id = v_tx_id
      AND status = 'paid';

  IF v_paid_sum <= 0.01 THEN
    v_new_status := CASE
      WHEN v_current_status IN ('paid','partially_paid') THEN 'pending'
      ELSE v_current_status
    END;
  ELSIF v_paid_sum >= v_gross - 0.01 THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partially_paid';
  END IF;

  UPDATE public.transactions
    SET paid_amount = v_paid_sum,
        status = v_new_status,
        updated_at = now()
    WHERE id = v_tx_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;
