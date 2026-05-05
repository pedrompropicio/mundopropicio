ALTER TABLE public.event_simulator_config
  ADD COLUMN IF NOT EXISTS other_revenue numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.event_simulator_config.other_revenue IS 'Outras Receitas (€) introduzidas manualmente na Configuração Global do Simulador. Somam ao totalRevenue dos cenários (Real/BE/Forecast) tal como Bonif. Bebidas e Ponto Vendido.';