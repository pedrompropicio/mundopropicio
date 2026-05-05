-- ============================================================
-- A&B v2 — Dual Mode: Terceirização + Exploração Própria
-- ============================================================
-- Não-destrutivo: novos campos têm DEFAULT que preservam o
-- comportamento actual (terceirização com custo = 0).
-- ============================================================

-- 1. event_ab_config — modo por tipo + campos exploração própria (alimentos)
ALTER TABLE public.event_ab_config
  ADD COLUMN IF NOT EXISTS ab_mode_bebidas text NOT NULL DEFAULT 'terceirizacao'
    CHECK (ab_mode_bebidas IN ('terceirizacao', 'exploracao_propria')),
  ADD COLUMN IF NOT EXISTS ab_mode_alimentos text NOT NULL DEFAULT 'terceirizacao'
    CHECK (ab_mode_alimentos IN ('terceirizacao', 'exploracao_propria')),
  ADD COLUMN IF NOT EXISTS per_capita_custo_alimentos numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_fixo_alimentos numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operador_nome_alimentos text;

-- 2. event_ab_zones — campos exploração própria (bebidas) + label operador
ALTER TABLE public.event_ab_zones
  ADD COLUMN IF NOT EXISTS per_capita_custo_bebidas numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_fixo_bebidas numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operador_nome text;

COMMENT ON COLUMN public.event_ab_config.ab_mode_bebidas IS
  'Modo de bebidas: terceirizacao (gerador opera, casa recebe %) | exploracao_propria (casa opera, resultado=receita-custo)';
COMMENT ON COLUMN public.event_ab_config.ab_mode_alimentos IS
  'Modo de alimentos: terceirizacao | exploracao_propria';
COMMENT ON COLUMN public.event_ab_config.per_capita_custo_alimentos IS
  'Custo estimado por pessoa em alimentos — apenas em exploracao_propria';
COMMENT ON COLUMN public.event_ab_config.custo_fixo_alimentos IS
  'Custo fixo do operador de alimentos — apenas em exploracao_propria';
COMMENT ON COLUMN public.event_ab_config.operador_nome_alimentos IS
  'Label livre do operador de alimentos — sem FK em v1';
COMMENT ON COLUMN public.event_ab_zones.per_capita_custo_bebidas IS
  'Custo estimado por pessoa nesta zona (bebidas) — apenas em exploracao_propria';
COMMENT ON COLUMN public.event_ab_zones.custo_fixo_bebidas IS
  'Custo fixo desta zona de bebidas — apenas em exploracao_propria';
COMMENT ON COLUMN public.event_ab_zones.operador_nome IS
  'Label livre do operador desta zona — sem FK em v1';