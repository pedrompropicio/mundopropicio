ALTER TABLE public.event_forecasts
  ADD COLUMN revenue_split_mode text NULL,
  ADD COLUMN revenue_split_params jsonb NULL;
ALTER TABLE public.event_forecasts
  ADD CONSTRAINT event_forecasts_revenue_split_mode_chk
  CHECK (revenue_split_mode IS NULL OR revenue_split_mode IN ('equal','fixed_pct','ticket_share'));
ALTER TABLE public.event_forecasts
  ADD CONSTRAINT event_forecasts_revenue_split_income_only_chk
  CHECK (revenue_split_mode IS NULL OR type = 'income');
COMMENT ON COLUMN public.event_forecasts.revenue_split_mode IS '#339 B: regra de repartição de uma linha de RECEITA do Master pelas cidades (equal | fixed_pct | ticket_share). NULL = sem repartição. Só em Master — validado no código.';
COMMENT ON COLUMN public.event_forecasts.revenue_split_params IS '#339 B: parâmetros da repartição; fixed_pct = {"<event_id>": pct, ...} somando 100.';