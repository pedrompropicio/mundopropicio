ALTER TABLE crm.meta_publish_plan
  ADD COLUMN IF NOT EXISTS start_time timestamptz NULL,
  ADD COLUMN IF NOT EXISTS end_time   timestamptz NULL;