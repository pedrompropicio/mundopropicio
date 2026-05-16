-- ============================================================
-- Re-desenhar com herança (Sprint 3a) — schema additions
-- ============================================================
-- Adiciona campos para suportar o workflow de redesign com inventário,
-- decisões de herança do utilizador, e pause da campanha original em
-- 3 modos (immediate / delayed_7d / manual).
--
-- Idempotente.
-- ============================================================

-- Coluna em meta_campaign_snapshot: marca substituição por nova strategy.
ALTER TABLE crm.meta_campaign_snapshot
  ADD COLUMN IF NOT EXISTS replaced_by_strategy_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_meta_campaign_snapshot_replaced
  ON crm.meta_campaign_snapshot (company_id, replaced_by_strategy_id)
  WHERE replaced_by_strategy_id IS NOT NULL;

COMMENT ON COLUMN crm.meta_campaign_snapshot.replaced_by_strategy_id IS
  'Strategy que substituiu esta campanha. Quando NOT NULL, esta campanha foi marcada para pause (imediata ou scheduled) pelo redesign workflow.';

-- Colunas em meta_campaign_strategies: modo de pause + decisões de herança.
ALTER TABLE crm.meta_campaign_strategies
  ADD COLUMN IF NOT EXISTS pause_original_mode text NOT NULL
    DEFAULT 'immediate'
    CHECK (pause_original_mode IN ('immediate', 'delayed_7d', 'manual')),
  ADD COLUMN IF NOT EXISTS pause_original_scheduled_for timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pause_original_executed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS inheritance_decisions jsonb DEFAULT NULL;

COMMENT ON COLUMN crm.meta_campaign_strategies.pause_original_mode IS
  'immediate=pausa no deploy; delayed_7d=cron pausa após 7d; manual=utilizador decide.';
COMMENT ON COLUMN crm.meta_campaign_strategies.pause_original_scheduled_for IS
  'Quando o cron deve pausar a original. Só preenchido se mode=delayed_7d (pelo strategy-deploy).';
COMMENT ON COLUMN crm.meta_campaign_strategies.pause_original_executed_at IS
  'Quando o pause foi efectivamente executado (deploy hook ou cron crm-cron-pause-replaced-originals).';
COMMENT ON COLUMN crm.meta_campaign_strategies.inheritance_decisions IS
  'Payload do wizard 3b com decisões de herança aprovadas pelo utilizador. Null se redesign foi chamado sem wizard.';

-- Índice de apoio ao cron (encontra strategies prontas para pausar).
CREATE INDEX IF NOT EXISTS idx_meta_strategies_pending_pause
  ON crm.meta_campaign_strategies (pause_original_scheduled_for)
  WHERE pause_original_mode = 'delayed_7d'
    AND pause_original_executed_at IS NULL;
