-- D-ERP237 — aplicada (OK do Pedro, 2026-10-12). Espelho de drizzle/migrations/0118.
CREATE TABLE crm.artist_ads_budget_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  artist_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id),
  platform text NOT NULL CHECK (platform IN ('meta','tiktok','google')),
  level text NOT NULL CHECK (level IN ('campaign','adset','adgroup')),
  external_id text NOT NULL,
  entity_name text,
  ad_account_id text,
  currency text NOT NULL,
  requested_daily_budget numeric(14,2) NOT NULL CHECK (requested_daily_budget > 0),
  before_daily_budget numeric(14,2),
  after_daily_budget numeric(14,2),
  cap_daily numeric(14,2),
  committed_daily numeric(14,2),
  reason text NOT NULL,
  request_id uuid NOT NULL,
  dry_run boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','dry_run','applied','unconfirmed','refused','failed')),
  error_code text,
  error_message text,
  platform_response jsonb,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (company_id, request_id)
);
CREATE INDEX artist_ads_budget_changes_entity_idx
  ON crm.artist_ads_budget_changes (company_id, platform, external_id, requested_at DESC);
CREATE INDEX artist_ads_budget_changes_artist_idx
  ON crm.artist_ads_budget_changes (artist_id, requested_at DESC);

REVOKE ALL ON crm.artist_ads_budget_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON crm.artist_ads_budget_changes TO authenticated;
GRANT ALL ON crm.artist_ads_budget_changes TO service_role;

ALTER TABLE crm.artist_ads_budget_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY artist_ads_budget_changes_select ON crm.artist_ads_budget_changes
  FOR SELECT TO authenticated USING (company_id = public.current_company_id());
-- Sem políticas de escrita para authenticated: só a edge function (service_role) escreve.
