-- Enum de Formalidade do BP
CREATE TYPE public.bp_formalidade AS ENUM (
  'estimado',
  'negociacao',
  'fechado',
  'pago_parcial',
  'pago_total'
);

-- Campos em event_forecasts
ALTER TABLE public.event_forecasts
  ADD COLUMN formalidade public.bp_formalidade NOT NULL DEFAULT 'estimado',
  ADD COLUMN formalidade_changed_at timestamptz,
  ADD COLUMN formalidade_changed_by uuid REFERENCES public.profiles(id);

CREATE INDEX idx_event_forecasts_formalidade ON public.event_forecasts(formalidade);

-- Tabela de audit (histórico de transições)
CREATE TABLE public.event_forecast_formalidade_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id uuid NOT NULL REFERENCES public.event_forecasts(id) ON DELETE CASCADE,
  from_state public.bp_formalidade,
  to_state public.bp_formalidade NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.profiles(id),
  changed_by_label text,
  reason text,
  auto_suggested boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_efl_forecast ON public.event_forecast_formalidade_log(forecast_id, changed_at DESC);

ALTER TABLE public.event_forecast_formalidade_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view formalidade log"
  ON public.event_forecast_formalidade_log FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert formalidade log"
  ON public.event_forecast_formalidade_log FOR INSERT
  TO authenticated WITH CHECK (true);

-- Trigger: regista mudança no log e atualiza changed_at/by
CREATE OR REPLACE FUNCTION public.log_formalidade_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_label text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.formalidade IS DISTINCT FROM OLD.formalidade THEN
    v_user := auth.uid();
    SELECT full_name INTO v_label FROM public.profiles WHERE id = v_user;

    NEW.formalidade_changed_at := now();
    NEW.formalidade_changed_by := v_user;

    INSERT INTO public.event_forecast_formalidade_log
      (forecast_id, from_state, to_state, changed_by, changed_by_label, auto_suggested)
    VALUES
      (NEW.id, OLD.formalidade, NEW.formalidade, v_user, v_label, false);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_formalidade_change
  BEFORE UPDATE OF formalidade ON public.event_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION public.log_formalidade_change();

-- Migração one-time: inferir estado inicial a partir de transações existentes
-- pago_total: TX vinculada e está "paid"
-- fechado: TX vinculada aprovada (não paga)
-- estimado: restantes (default já aplicado)
WITH tx_state AS (
  SELECT
    ef.id AS forecast_id,
    BOOL_OR(t.status = 'paid') AS has_paid,
    BOOL_OR(t.status IN ('approved', 'paid')) AS has_approved
  FROM public.event_forecasts ef
  LEFT JOIN public.transactions t ON t.id = ef.transaction_id
  WHERE ef.transaction_id IS NOT NULL
  GROUP BY ef.id
)
UPDATE public.event_forecasts ef
SET formalidade = CASE
  WHEN ts.has_paid THEN 'pago_total'::bp_formalidade
  WHEN ts.has_approved THEN 'fechado'::bp_formalidade
  ELSE 'estimado'::bp_formalidade
END,
formalidade_changed_at = now()
FROM tx_state ts
WHERE ef.id = ts.forecast_id
  AND (ts.has_paid OR ts.has_approved);

-- Função helper para sugerir próximo estado (lida pelo client)
CREATE OR REPLACE FUNCTION public.suggest_formalidade(_forecast_id uuid)
RETURNS public.bp_formalidade
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.bp_formalidade;
  v_bp_amount numeric;
  v_paid_total numeric := 0;
  v_approved_total numeric := 0;
  v_tolerance numeric := 0.05;
BEGIN
  SELECT formalidade, amount INTO v_current, v_bp_amount
  FROM public.event_forecasts WHERE id = _forecast_id;

  IF v_current IS NULL THEN RETURN NULL; END IF;

  SELECT
    COALESCE(SUM(CASE WHEN t.status = 'paid' THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.status IN ('approved','paid') THEN t.amount ELSE 0 END), 0)
  INTO v_paid_total, v_approved_total
  FROM public.transactions t
  WHERE t.id IN (
    SELECT transaction_id FROM public.event_forecasts WHERE id = _forecast_id AND transaction_id IS NOT NULL
  );

  -- Pago total: dentro de ±5% do BP
  IF v_paid_total > 0 AND v_bp_amount > 0
     AND ABS(v_paid_total - v_bp_amount) / v_bp_amount <= v_tolerance THEN
    RETURN 'pago_total';
  END IF;

  -- Pago parcial
  IF v_paid_total > 0 THEN
    RETURN 'pago_parcial';
  END IF;

  -- Fechado: tem TX aprovada
  IF v_approved_total > 0 AND v_current IN ('estimado', 'negociacao') THEN
    RETURN 'fechado';
  END IF;

  RETURN v_current;
END;
$$;