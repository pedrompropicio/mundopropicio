
CREATE TABLE IF NOT EXISTS crm.assisted_assembly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  source_campaign_id uuid NULL,
  flow text NOT NULL CHECK (flow IN ('redesign','from_scratch')),
  adsets jsonb NOT NULL,
  total_creatives int NOT NULL DEFAULT 0,
  snapshot jsonb NULL,
  generated_by uuid NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assisted_assembly_event_idx ON crm.assisted_assembly(event_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS assisted_assembly_company_idx ON crm.assisted_assembly(company_id);
CREATE INDEX IF NOT EXISTS assisted_assembly_source_campaign_idx ON crm.assisted_assembly(source_campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.assisted_assembly TO authenticated;
GRANT ALL ON crm.assisted_assembly TO service_role;

ALTER TABLE crm.assisted_assembly ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass ON crm.assisted_assembly
  FOR ALL TO public USING (true) WITH CHECK (true);

CREATE POLICY tenant_isolation_select ON crm.assisted_assembly
  FOR SELECT TO authenticated USING (company_id = current_company_id());

CREATE POLICY tenant_isolation_insert ON crm.assisted_assembly
  FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());

CREATE POLICY tenant_isolation_update ON crm.assisted_assembly
  FOR UPDATE TO authenticated USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY tenant_isolation_delete ON crm.assisted_assembly
  FOR DELETE TO authenticated USING (company_id = current_company_id());
