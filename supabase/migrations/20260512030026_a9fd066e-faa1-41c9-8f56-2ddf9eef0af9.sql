ALTER TABLE crm.meta_campaign_strategies
  ADD COLUMN IF NOT EXISTS applied_constraints jsonb NULL;