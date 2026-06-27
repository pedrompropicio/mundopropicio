-- 1) Aditivo no CHECK de status: candidate + selected, mantendo os anteriores
ALTER TABLE crm.meta_campaign_strategies DROP CONSTRAINT IF EXISTS meta_campaign_strategies_status_check;
ALTER TABLE crm.meta_campaign_strategies ADD CONSTRAINT meta_campaign_strategies_status_check
  CHECK (status = ANY (ARRAY['draft','generated','approved','in_progress','completed','archived','candidate','selected']::text[]));

-- 2) Aditivo em audience_duel_runs: correlação
ALTER TABLE crm.audience_duel_runs ADD COLUMN IF NOT EXISTS duel_id uuid;
ALTER TABLE crm.audience_duel_runs ADD COLUMN IF NOT EXISTS campaign_id text;
CREATE INDEX IF NOT EXISTS idx_audience_duel_runs_duel_id ON crm.audience_duel_runs(duel_id) WHERE duel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audience_duel_runs_campaign_id ON crm.audience_duel_runs(campaign_id) WHERE campaign_id IS NOT NULL;