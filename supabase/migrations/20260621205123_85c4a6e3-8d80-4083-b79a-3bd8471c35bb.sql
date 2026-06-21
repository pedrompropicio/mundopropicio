CREATE TABLE IF NOT EXISTS crm.meta_publish_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  design_id uuid NOT NULL,
  objetivo text NULL,
  orcamento_total_cents bigint NULL,
  moeda text NOT NULL DEFAULT 'EUR',
  adsets jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','pronto_a_publicar','publicado','falhado')),
  resumo jsonb NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_publish_plan_event_idx ON crm.meta_publish_plan(event_id);
CREATE INDEX IF NOT EXISTS meta_publish_plan_company_idx ON crm.meta_publish_plan(company_id);
CREATE INDEX IF NOT EXISTS meta_publish_plan_design_idx ON crm.meta_publish_plan(design_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.meta_publish_plan TO authenticated;
GRANT ALL ON crm.meta_publish_plan TO service_role;

ALTER TABLE crm.meta_publish_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass ON crm.meta_publish_plan
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY tenant_isolation_select ON crm.meta_publish_plan
  FOR SELECT TO authenticated USING (company_id = current_company_id());

CREATE POLICY tenant_isolation_insert ON crm.meta_publish_plan
  FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());

CREATE POLICY tenant_isolation_update ON crm.meta_publish_plan
  FOR UPDATE TO authenticated USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY tenant_isolation_delete ON crm.meta_publish_plan
  FOR DELETE TO authenticated USING (company_id = current_company_id());

CREATE OR REPLACE FUNCTION crm.set_updated_at_meta_publish_plan()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, crm
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meta_publish_plan_set_updated_at ON crm.meta_publish_plan;
CREATE TRIGGER meta_publish_plan_set_updated_at
  BEFORE UPDATE ON crm.meta_publish_plan
  FOR EACH ROW EXECUTE FUNCTION crm.set_updated_at_meta_publish_plan();