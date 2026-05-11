-- Fase 3 — Re-design: campos de origem em meta_campaign_strategies
ALTER TABLE crm.meta_campaign_strategies
  ADD COLUMN IF NOT EXISTS source_campaign_id text NULL,
  ADD COLUMN IF NOT EXISTS source_diagnosis_id uuid NULL,
  ADD COLUMN IF NOT EXISTS redesign_rationale text NULL;

CREATE INDEX IF NOT EXISTS idx_meta_campaign_strategies_source_campaign
  ON crm.meta_campaign_strategies (company_id, source_campaign_id)
  WHERE source_campaign_id IS NOT NULL;