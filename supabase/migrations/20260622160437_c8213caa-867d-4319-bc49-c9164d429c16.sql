ALTER TABLE crm.meta_publish_plan
  ADD COLUMN IF NOT EXISTS publish_started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS publish_finished_at timestamptz NULL;