ALTER TABLE crm.meta_publish_plan
  ADD COLUMN IF NOT EXISTS meta_campaign_id text NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS publish_error jsonb NULL;

ALTER TABLE crm.meta_publish_plan DROP CONSTRAINT IF EXISTS meta_publish_plan_estado_check;
ALTER TABLE crm.meta_publish_plan
  ADD CONSTRAINT meta_publish_plan_estado_check
  CHECK (estado IN ('rascunho','pronto_a_publicar','a_publicar','publicado','falhado'));