CREATE OR REPLACE FUNCTION public.validate_installments_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_amount numeric;
  v_iva_rate numeric;
  v_gross numeric;
  v_others numeric;
  v_sum numeric;
  v_old_sum numeric;
BEGIN
  SELECT amount, COALESCE(iva_rate, 0)
    INTO v_tx_amount, v_iva_rate
    FROM public.transactions
    WHERE id = NEW.transaction_id;

  IF v_tx_amount IS NULL THEN
    RETURN NEW;
  END IF;

  v_gross := v_tx_amount * (1 + v_iva_rate / 100.0);

  IF v_gross <= 0 THEN
    RETURN NEW;
  END IF;

  -- Soma das outras linhas (planned + paid; cancelled não conta)
  SELECT COALESCE(SUM(amount), 0)
    INTO v_others
    FROM public.transaction_payments
    WHERE transaction_id = NEW.transaction_id
      AND status IN ('planned','paid')
      AND id <> NEW.id;

  v_sum := v_others;
  IF NEW.status IN ('planned','paid') THEN
    v_sum := v_sum + NEW.amount;
  END IF;

  IF v_sum > v_gross + 0.01 THEN
    IF TG_OP = 'UPDATE' THEN
      v_old_sum := v_others;
      IF OLD.status IN ('planned','paid') THEN
        v_old_sum := v_old_sum + OLD.amount;
      END IF;
      -- linha legada: permitir desde que não piore
      IF v_sum <= v_old_sum THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'Soma das parcelas (% €) excede o valor bruto da transação (% €).',
      ROUND(v_sum::numeric, 2), ROUND(v_gross::numeric, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;
