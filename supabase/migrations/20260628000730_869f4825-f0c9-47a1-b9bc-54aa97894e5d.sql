-- DR-2026-06-27e — Adiciona source_mode a crm.meta_campaign_strategies
-- Distingue redesigns dos planos from-scratch (com/sem referência).
-- Default 'redesign' classifica retroactivamente os registos existentes.

ALTER TABLE crm.meta_campaign_strategies
  ADD COLUMN IF NOT EXISTS source_mode text;

UPDATE crm.meta_campaign_strategies
  SET source_mode = 'redesign'
  WHERE source_mode IS NULL;

ALTER TABLE crm.meta_campaign_strategies
  ALTER COLUMN source_mode SET DEFAULT 'redesign';

ALTER TABLE crm.meta_campaign_strategies
  DROP CONSTRAINT IF EXISTS meta_campaign_strategies_source_mode_check;

ALTER TABLE crm.meta_campaign_strategies
  ADD CONSTRAINT meta_campaign_strategies_source_mode_check
  CHECK (source_mode IN ('redesign', 'from_scratch_ref', 'from_scratch_blank'));

COMMENT ON COLUMN crm.meta_campaign_strategies.source_mode IS
  'Origem do plano: redesign (campanha existente), from_scratch_ref (evento novo com campanha de referência), from_scratch_blank (evento novo sem referência). DR-2026-06-27e.';
