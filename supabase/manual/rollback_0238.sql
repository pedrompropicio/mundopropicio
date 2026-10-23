-- Rollback da migração 0238 (#339 B1). NÃO APLICADO. Só com "Sim" do Pedro.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.event_forecasts
             WHERE revenue_split_mode IS NOT NULL OR revenue_split_params IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback_0238 recusado: existem linhas com revenue_split_mode/revenue_split_params preenchidos';
  END IF;
END $$;
ALTER TABLE public.event_forecasts DROP CONSTRAINT IF EXISTS event_forecasts_revenue_split_income_only_chk;
ALTER TABLE public.event_forecasts DROP CONSTRAINT IF EXISTS event_forecasts_revenue_split_mode_chk;
ALTER TABLE public.event_forecasts DROP COLUMN IF EXISTS revenue_split_params;
ALTER TABLE public.event_forecasts DROP COLUMN IF EXISTS revenue_split_mode;
