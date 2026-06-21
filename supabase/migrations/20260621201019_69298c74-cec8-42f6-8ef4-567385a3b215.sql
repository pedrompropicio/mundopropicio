CREATE TABLE IF NOT EXISTS crm.campaign_design (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  assembly_id uuid NOT NULL,
  adsets jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','finalizado')),
  generated_by uuid NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_design_event_idx ON crm.campaign_design(event_id);
CREATE INDEX IF NOT EXISTS campaign_design_company_idx ON crm.campaign_design(company_id);
CREATE INDEX IF NOT EXISTS campaign_design_assembly_idx ON crm.campaign_design(assembly_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.campaign_design TO authenticated;
GRANT ALL ON crm.campaign_design TO service_role;

ALTER TABLE crm.campaign_design ENABLE ROW LEVEL SECURITY;

-- service_role_bypass TO service_role (NÃO TO public — evita o bug da assisted_assembly)
CREATE POLICY service_role_bypass ON crm.campaign_design
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY tenant_isolation_select ON crm.campaign_design
  FOR SELECT TO authenticated USING (company_id = current_company_id());

CREATE POLICY tenant_isolation_insert ON crm.campaign_design
  FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());

CREATE POLICY tenant_isolation_update ON crm.campaign_design
  FOR UPDATE TO authenticated USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY tenant_isolation_delete ON crm.campaign_design
  FOR DELETE TO authenticated USING (company_id = current_company_id());

-- Trigger updated_at (função local ao schema crm, search_path seguro)
CREATE OR REPLACE FUNCTION crm.set_updated_at_campaign_design()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, crm
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_design_set_updated_at ON crm.campaign_design;
CREATE TRIGGER campaign_design_set_updated_at
  BEFORE UPDATE ON crm.campaign_design
  FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at_campaign_design();