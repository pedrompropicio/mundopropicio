CREATE TABLE IF NOT EXISTS crm.meta_entity_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  ad_account_id text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('campaign','adset','ad')),
  external_id text NOT NULL,
  entity_name text,
  action text NOT NULL CHECK (action IN ('pause','activate','update_budget','update_name','update_end_time')),
  prev_status text,
  new_status text,
  updates_jsonb jsonb,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  meta_response_jsonb jsonb,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_entity_actions_log_external
  ON crm.meta_entity_actions_log (company_id, external_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_entity_actions_log_type
  ON crm.meta_entity_actions_log (company_id, entity_type, performed_at DESC);

ALTER TABLE crm.meta_entity_actions_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass ON crm.meta_entity_actions_log;
DROP POLICY IF EXISTS tenant_isolation_select ON crm.meta_entity_actions_log;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.meta_entity_actions_log;

CREATE POLICY service_role_bypass ON crm.meta_entity_actions_log
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation_select ON crm.meta_entity_actions_log
  FOR SELECT TO authenticated USING (company_id = current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.meta_entity_actions_log
  FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());

GRANT SELECT, INSERT ON crm.meta_entity_actions_log TO authenticated;
GRANT ALL ON crm.meta_entity_actions_log TO service_role;