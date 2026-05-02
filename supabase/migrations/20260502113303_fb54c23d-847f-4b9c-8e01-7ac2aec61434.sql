ALTER TABLE public.event_simulator_config
  ADD COLUMN IF NOT EXISTS forecast_final_accel numeric(5,2) NOT NULL DEFAULT 1.6,
  ADD COLUMN IF NOT EXISTS forecast_final_window_days integer NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.event_simulator_config.forecast_final_accel IS 'Multiplicador da velocidade de vendas na reta final (ex: 1.6 = +60%). Default 1.6.';
COMMENT ON COLUMN public.event_simulator_config.forecast_final_window_days IS 'Nº de dias antes do evento considerados "reta final" para aplicar o boost. Default 30.';