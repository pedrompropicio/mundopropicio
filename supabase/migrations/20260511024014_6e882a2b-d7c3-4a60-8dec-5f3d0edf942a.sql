CREATE TABLE IF NOT EXISTS crm.meta_campaign_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES crm.ad_platform_connections(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  ad_account_id text NOT NULL,
  external_campaign_id text NOT NULL,
  name text NOT NULL,
  status text,
  effective_status text,
  objective text,
  daily_budget_cents bigint,
  lifetime_budget_cents bigint,
  budget_remaining_cents bigint,
  start_time timestamptz,
  stop_time timestamptz,
  created_time timestamptz,
  updated_time timestamptz,
  buying_type text,
  bid_strategy text,
  raw jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, external_campaign_id)
);

ALTER TABLE crm.meta_campaign_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_select ON crm.meta_campaign_snapshot;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.meta_campaign_snapshot;
DROP POLICY IF EXISTS tenant_isolation_update ON crm.meta_campaign_snapshot;
DROP POLICY IF EXISTS service_role_bypass ON crm.meta_campaign_snapshot;

CREATE POLICY tenant_isolation_select ON crm.meta_campaign_snapshot FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.meta_campaign_snapshot FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY tenant_isolation_update ON crm.meta_campaign_snapshot FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());
CREATE POLICY service_role_bypass ON crm.meta_campaign_snapshot FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA crm TO authenticated;
GRANT SELECT, INSERT, UPDATE ON crm.meta_campaign_snapshot TO authenticated;

CREATE INDEX IF NOT EXISTS idx_meta_campaign_snapshot_company ON crm.meta_campaign_snapshot(company_id, last_synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_campaign_snapshot_account ON crm.meta_campaign_snapshot(ad_account_id, status);