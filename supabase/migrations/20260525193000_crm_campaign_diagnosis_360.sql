-- P0 MP Audience — Fase 1A: tabela de output do diagnóstico 360 de campanha.
-- Esqueleto: a tabela guarda o resultado do diagnóstico determinístico que será
-- populado em fases seguintes (1C projeção baseline, 1D classificação da fonte).
-- Segue o padrão RLS das restantes tabelas crm (ver crm.meta_campaign_diagnoses).

CREATE TABLE IF NOT EXISTS crm.campaign_diagnosis_360 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid,
  external_campaign_id text NOT NULL,
  campaign_name text,
  target_roas numeric(5,2) NOT NULL,
  diagnosis_jsonb jsonb NOT NULL,
  source_campaign_class text,
  projected_baseline_roas numeric,
  history_days_available integer,
  history_warning boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_diagnosis_360_campaign
  ON crm.campaign_diagnosis_360 (company_id, external_campaign_id, created_at DESC);

ALTER TABLE crm.campaign_diagnosis_360 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass ON crm.campaign_diagnosis_360;
DROP POLICY IF EXISTS tenant_isolation_select ON crm.campaign_diagnosis_360;

CREATE POLICY service_role_bypass ON crm.campaign_diagnosis_360
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation_select ON crm.campaign_diagnosis_360
  FOR SELECT TO authenticated USING (company_id = current_company_id());

GRANT SELECT ON crm.campaign_diagnosis_360 TO authenticated;
GRANT ALL ON crm.campaign_diagnosis_360 TO service_role;
