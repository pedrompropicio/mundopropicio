ALTER TABLE public.event_ab_config
  ADD COLUMN IF NOT EXISTS faturacao_real_alimentos numeric NULL;

COMMENT ON COLUMN public.event_ab_config.faturacao_real_alimentos IS
  'Facturação bruta real do operador de alimentos (s/IVA). Override ao cálculo per capita no cenário Real. NULL = não informada.';

ALTER TABLE public.event_ab_zones
  ADD COLUMN IF NOT EXISTS faturacao_real_bebidas numeric NULL;

COMMENT ON COLUMN public.event_ab_zones.faturacao_real_bebidas IS
  'Facturação bruta real do operador desta zona de bebidas (s/IVA). Override ao cálculo per capita no cenário Real. NULL = não informada.';