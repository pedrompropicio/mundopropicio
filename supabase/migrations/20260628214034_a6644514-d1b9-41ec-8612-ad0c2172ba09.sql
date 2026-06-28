CREATE TABLE IF NOT EXISTS crm.create_reels_ad_debug (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  creative_id uuid,
  external_adset_id text NOT NULL,
  dry_run boolean NOT NULL DEFAULT true,
  ok boolean NOT NULL DEFAULT false,
  ad_id text,
  http_status int,
  detail text,
  fb_error jsonb,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON crm.create_reels_ad_debug TO service_role;

ALTER TABLE crm.create_reels_ad_debug ENABLE ROW LEVEL SECURITY;

-- Sem policies para authenticated/anon: tabela é só de telemetria interna
-- usada pela edge function crm-meta-create-reels-ad (service_role).
CREATE INDEX IF NOT EXISTS create_reels_ad_debug_company_created_idx
  ON crm.create_reels_ad_debug (company_id, created_at DESC);