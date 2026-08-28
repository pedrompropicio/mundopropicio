ALTER TABLE public.transactions
  ADD COLUMN forecast_id uuid REFERENCES public.event_forecasts(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_forecast_id
  ON public.transactions (forecast_id)
  WHERE forecast_id IS NOT NULL;

UPDATE public.transactions t
SET forecast_id = f.id
FROM public.event_forecasts f
WHERE f.transaction_id = t.id
  AND f.version_id IS NULL
  AND t.forecast_id IS NULL;