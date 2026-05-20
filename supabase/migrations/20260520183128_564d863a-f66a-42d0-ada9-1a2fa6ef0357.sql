
-- =============================================================
-- Fase 1: Schema + Triggers para parcelamento de transações
-- =============================================================

-- 1. Schema: scheduled_date + status em transaction_payments
ALTER TABLE public.transaction_payments
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'paid';

-- Constraint de valores permitidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transaction_payments_status_check'
  ) THEN
    ALTER TABLE public.transaction_payments
      ADD CONSTRAINT transaction_payments_status_check
      CHECK (status IN ('planned','paid','cancelled'));
  END IF;
END$$;

-- Índice de performance
CREATE INDEX IF NOT EXISTS idx_transaction_payments_tx_status
  ON public.transaction_payments(transaction_id, status);

CREATE INDEX IF NOT EXISTS idx_transaction_payments_scheduled
  ON public.transaction_payments(scheduled_date)
  WHERE scheduled_date IS NOT NULL;

-- =============================================================
-- 2. Função helper: TX tem cronograma?
-- =============================================================
CREATE OR REPLACE FUNCTION public.tx_has_installment_schedule(_tx_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.transaction_payments
    WHERE transaction_id = _tx_id
      AND (scheduled_date IS NOT NULL OR status IN ('planned','cancelled'))
  );
$$;

-- =============================================================
-- 3. Trigger: sync paid_amount + status na transactions
-- =============================================================
CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_has_schedule boolean;
  v_tx_amount numeric;
  v_iva_rate numeric;
  v_gross numeric;
  v_paid_sum numeric;
  v_current_status text;
  v_new_status text;
BEGIN
  -- Guard contra recursão
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);

  -- Só age se a TX tem cronograma
  v_has_schedule := public.tx_has_installment_schedule(v_tx_id);
  IF NOT v_has_schedule THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Buscar dados da TX
  SELECT amount, COALESCE(iva_rate, 0), status
    INTO v_tx_amount, v_iva_rate, v_current_status
    FROM public.transactions
    WHERE id = v_tx_id;

  IF v_tx_amount IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_gross := v_tx_amount * (1 + v_iva_rate / 100.0);

  -- Somar pagamentos efetivos
  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_sum
    FROM public.transaction_payments
    WHERE transaction_id = v_tx_id
      AND status = 'paid';

  -- Determinar novo status
  IF v_paid_sum <= 0.01 THEN
    -- Voltou a zero: status volta a 'pending' (a menos que estivesse approved sem pagamentos)
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

DROP TRIGGER IF EXISTS trg_sync_paid_amount_from_payments ON public.transaction_payments;
CREATE TRIGGER trg_sync_paid_amount_from_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.transaction_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_paid_amount_from_payments();

-- =============================================================
-- 4. Trigger: validar que soma de parcelas não excede gross
-- =============================================================
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
  v_sum numeric;
  v_should_validate boolean;
BEGIN
  -- Determinar se devemos validar:
  -- 1) Esta linha tem cronograma (status planned/cancelled OU scheduled_date)
  -- 2) OU a TX já tem cronograma noutras linhas
  v_should_validate :=
    NEW.status IN ('planned','cancelled')
    OR NEW.scheduled_date IS NOT NULL
    OR public.tx_has_installment_schedule(NEW.transaction_id);

  IF NOT v_should_validate THEN
    RETURN NEW;
  END IF;

  SELECT amount, COALESCE(iva_rate, 0)
    INTO v_tx_amount, v_iva_rate
    FROM public.transactions
    WHERE id = NEW.transaction_id;

  IF v_tx_amount IS NULL THEN
    RETURN NEW;
  END IF;

  v_gross := v_tx_amount * (1 + v_iva_rate / 100.0);

  -- Somar planned + paid (cancelled não conta), incluindo esta linha
  SELECT COALESCE(SUM(amount), 0)
    INTO v_sum
    FROM public.transaction_payments
    WHERE transaction_id = NEW.transaction_id
      AND status IN ('planned','paid')
      AND id <> NEW.id;

  IF NEW.status IN ('planned','paid') THEN
    v_sum := v_sum + NEW.amount;
  END IF;

  IF v_sum > v_gross + 0.01 THEN
    RAISE EXCEPTION 'Soma das parcelas (% €) excede o valor bruto da transação (% €).',
      ROUND(v_sum::numeric, 2), ROUND(v_gross::numeric, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_installments_total ON public.transaction_payments;
CREATE TRIGGER trg_validate_installments_total
  BEFORE INSERT OR UPDATE ON public.transaction_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_installments_total();

COMMENT ON COLUMN public.transaction_payments.scheduled_date IS 'Data prevista do pagamento. Presença indica que faz parte de cronograma de parcelas.';
COMMENT ON COLUMN public.transaction_payments.status IS 'planned (futura) | paid (efetiva) | cancelled. Default paid para compat com fluxo legado.';
