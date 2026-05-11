CREATE TABLE IF NOT EXISTS crm.meta_campaign_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  ad_account_id text NOT NULL,
  external_campaign_id text NOT NULL,
  campaign_name text,
  period_from date NOT NULL,
  period_to date NOT NULL,
  diagnosis_jsonb jsonb NOT NULL,
  summary_text text,
  overall_score numeric,
  severity text CHECK (severity IN ('critical','warning','healthy')),
  creatives_analyzed_count integer DEFAULT 0,
  adsets_count integer DEFAULT 0,
  ads_count integer DEFAULT 0,
  ai_model text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_campaign_diagnoses_campaign ON crm.meta_campaign_diagnoses (company_id, external_campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_campaign_diagnoses_severity ON crm.meta_campaign_diagnoses (company_id, severity, created_at DESC);

ALTER TABLE crm.meta_campaign_diagnoses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass ON crm.meta_campaign_diagnoses;
DROP POLICY IF EXISTS tenant_isolation_select ON crm.meta_campaign_diagnoses;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.meta_campaign_diagnoses;
DROP POLICY IF EXISTS tenant_isolation_update ON crm.meta_campaign_diagnoses;
DROP POLICY IF EXISTS tenant_isolation_delete ON crm.meta_campaign_diagnoses;

CREATE POLICY service_role_bypass ON crm.meta_campaign_diagnoses AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation_select ON crm.meta_campaign_diagnoses FOR SELECT TO authenticated USING (company_id = current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.meta_campaign_diagnoses FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());
CREATE POLICY tenant_isolation_update ON crm.meta_campaign_diagnoses FOR UPDATE TO authenticated USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY tenant_isolation_delete ON crm.meta_campaign_diagnoses FOR DELETE TO authenticated USING (company_id = current_company_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.meta_campaign_diagnoses TO authenticated;
GRANT ALL ON crm.meta_campaign_diagnoses TO service_role;

CREATE OR REPLACE FUNCTION crm.touch_meta_campaign_diagnoses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meta_campaign_diagnoses_updated_at ON crm.meta_campaign_diagnoses;
CREATE TRIGGER trg_meta_campaign_diagnoses_updated_at
BEFORE UPDATE ON crm.meta_campaign_diagnoses
FOR EACH ROW EXECUTE FUNCTION crm.touch_meta_campaign_diagnoses_updated_at();