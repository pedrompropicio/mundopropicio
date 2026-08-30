-- 1) validate_installments_total: valida SEMPRE (com ou sem cronograma),
--    mas em UPDATE só recusa se a soma piorar (legados continuam editáveis).
CREATE OR REPLACE FUNCTION public.validate_installments_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- 2) Guarda no lado da transação: paid_amount não excede o bruto.
CREATE OR REPLACE FUNCTION public.validate_paid_amount_not_exceeds_gross()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_gross numeric;
  v_old_gross numeric;
BEGIN
  IF NEW.paid_amount IS NULL THEN
    RETURN NEW;
  END IF;

  v_gross := COALESCE(NEW.amount, 0) * (1 + COALESCE(NEW.iva_rate, 0) / 100.0);

  IF v_gross <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.paid_amount > v_gross + 0.01 THEN
    -- Estado legado já excedido: permitir desde que não aumente.
    v_old_gross := COALESCE(OLD.amount, 0) * (1 + COALESCE(OLD.iva_rate, 0) / 100.0);
    IF COALESCE(OLD.paid_amount, 0) > v_old_gross + 0.01
       AND NEW.paid_amount <= COALESCE(OLD.paid_amount, 0) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Valor pago (% €) excede o valor bruto da transação (% €).',
      ROUND(NEW.paid_amount::numeric, 2), ROUND(v_gross::numeric, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_paid_amount_not_exceeds_gross ON public.transactions;
CREATE TRIGGER trg_validate_paid_amount_not_exceeds_gross
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_paid_amount_not_exceeds_gross();

COMMENT ON FUNCTION public.validate_installments_total() IS
  'A soma de transaction_payments (planned+paid) nunca excede o bruto da transação (amount * (1+iva_rate/100)), com ou sem cronograma. Em UPDATE só recusa se a soma piorar, para não bloquear linhas legadas.';
COMMENT ON FUNCTION public.validate_paid_amount_not_exceeds_gross() IS
  'transactions.paid_amount nunca excede o bruto (amount * (1+iva_rate/100)) + 0,01. Estados legados já excedidos continuam editáveis desde que paid_amount não aumente.';