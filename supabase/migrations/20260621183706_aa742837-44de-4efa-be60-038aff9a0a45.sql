-- ============================================================
-- Camada 2 — Validação de Mensagem dos Criativos
-- Tabela de resultados por (creative_id, event_id)
-- ============================================================

CREATE TABLE IF NOT EXISTS crm.creative_message_validation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  creative_id uuid NOT NULL REFERENCES crm.meta_creatives(id) ON DELETE CASCADE,
  semaforo text NOT NULL CHECK (semaforo IN ('coerente','atencao','contradiz')),
  aproveita_gatilhos boolean NOT NULL DEFAULT false,
  explicacao text,
  sugestao_copy text,
  gatilhos_snapshot jsonb,
  analysis_model text,
  validated_by uuid,
  validated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (creative_id, event_id)
);

CREATE INDEX IF NOT EXISTS creative_message_validation_event_idx
  ON crm.creative_message_validation(event_id);
CREATE INDEX IF NOT EXISTS creative_message_validation_company_idx
  ON crm.creative_message_validation(company_id);
CREATE INDEX IF NOT EXISTS creative_message_validation_creative_idx
  ON crm.creative_message_validation(creative_id);

-- GRANTs (schema crm)
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.creative_message_validation TO authenticated;
GRANT ALL ON crm.creative_message_validation TO service_role;

-- RLS — padrão crm.meta_campaign_diagnoses
ALTER TABLE crm.creative_message_validation ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass ON crm.creative_message_validation
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation_select ON crm.creative_message_validation
  FOR SELECT TO authenticated USING (company_id = current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.creative_message_validation
  FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());
CREATE POLICY tenant_isolation_update ON crm.creative_message_validation
  FOR UPDATE TO authenticated USING (company_id = current_company_id()) WITH CHECK (company_id = current_company_id());
CREATE POLICY tenant_isolation_delete ON crm.creative_message_validation
  FOR DELETE TO authenticated USING (company_id = current_company_id());
