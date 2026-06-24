CREATE TABLE IF NOT EXISTS crm.upload_creative_debug (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid,
  company_id uuid,
  step text,
  ok boolean,
  http_status int,
  detail text,
  fb_error jsonb,
  ad_account text,
  graph_api_version text,
  created_at timestamptz DEFAULT now()
);

GRANT ALL ON crm.upload_creative_debug TO service_role;