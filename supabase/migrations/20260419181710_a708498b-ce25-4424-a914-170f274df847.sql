-- Multi-currency support for forecasts and transactions
ALTER TABLE public.event_forecasts
  ADD COLUMN currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN original_amount numeric,
  ADD COLUMN fx_rate numeric,
  ADD COLUMN fx_rate_source text;

ALTER TABLE public.transactions
  ADD COLUMN currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN original_amount numeric,
  ADD COLUMN fx_rate numeric,
  ADD COLUMN fx_rate_source text;

-- Restrict to supported currencies (phase 1)
ALTER TABLE public.event_forecasts
  ADD CONSTRAINT event_forecasts_currency_check
  CHECK (currency IN ('EUR', 'BRL', 'USD'));

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_currency_check
  CHECK (currency IN ('EUR', 'BRL', 'USD'));

-- Indexes for filtering by non-EUR rows (small partial indexes)
CREATE INDEX IF NOT EXISTS idx_event_forecasts_currency_non_eur
  ON public.event_forecasts (currency)
  WHERE currency <> 'EUR';

CREATE INDEX IF NOT EXISTS idx_transactions_currency_non_eur
  ON public.transactions (currency)
  WHERE currency <> 'EUR';

COMMENT ON COLUMN public.event_forecasts.currency IS 'Currency code (EUR/BRL/USD). amount is always in EUR.';
COMMENT ON COLUMN public.event_forecasts.original_amount IS 'Original amount in foreign currency (when currency != EUR).';
COMMENT ON COLUMN public.event_forecasts.fx_rate IS 'Exchange rate used: 1 unit of currency = fx_rate EUR.';
COMMENT ON COLUMN public.event_forecasts.fx_rate_source IS 'Source of fx_rate: manual, auto, suggested.';

COMMENT ON COLUMN public.transactions.currency IS 'Currency code (EUR/BRL/USD). amount is always in EUR.';
COMMENT ON COLUMN public.transactions.original_amount IS 'Original amount in foreign currency (when currency != EUR).';
COMMENT ON COLUMN public.transactions.fx_rate IS 'Exchange rate used: 1 unit of currency = fx_rate EUR.';
COMMENT ON COLUMN public.transactions.fx_rate_source IS 'Source of fx_rate: manual, auto, suggested.';