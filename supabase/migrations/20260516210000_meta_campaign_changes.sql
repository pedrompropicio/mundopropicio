-- ============================================================
-- crm.meta_campaign_changes — audit trail rico de mudanças aplicadas
-- a entidades Meta (campaign/adset/ad), com before/after snapshots,
-- ligação ao diagnóstico que sugeriu a mudança, e medição de impacto D+7.
--
-- Paralelo (não substitui) a crm.meta_entity_actions_log, que continua
-- a registar o evento bruto da chamada à Meta API.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS crm.meta_campaign_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  external_campaign_id text,
  external_adset_id text,
  external_ad_id text,
  change_type text NOT NULL CHECK (change_type IN (
    'budget','targeting','creative','status','bid','name','other'
  )),
  before_jsonb jsonb,
  after_jsonb jsonb,
  reason_text text,
  diagnosis_id uuid,
  applied_action_index int,
  triggered_by text NOT NULL CHECK (triggered_by IN (
    'user_manual','cron_auto','ai_suggestion'
  )),
  measure_impact_requested boolean NOT NULL DEFAULT false,
  applied_by_user_id uuid,
  applied_at timestamptz NOT NULL DEFAULT now(),
  impact_measured_at timestamptz,
  impact_metrics_jsonb jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_changes_campaign
  ON crm.meta_campaign_changes (external_campaign_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_changes_company_applied
  ON crm.meta_campaign_changes (company_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_changes_diagnosis
  ON crm.meta_campaign_changes (diagnosis_id)
  WHERE diagnosis_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meta_changes_pending_impact
  ON crm.meta_campaign_changes (applied_at)
  WHERE impact_measured_at IS NULL;

ALTER TABLE crm.meta_campaign_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass ON crm.meta_campaign_changes;
DROP POLICY IF EXISTS tenant_isolation_select ON crm.meta_campaign_changes;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.meta_campaign_changes;

CREATE POLICY service_role_bypass ON crm.meta_campaign_changes
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY tenant_isolation_select ON crm.meta_campaign_changes
  FOR SELECT TO authenticated USING (company_id = current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.meta_campaign_changes
  FOR INSERT TO authenticated WITH CHECK (company_id = current_company_id());

-- UPDATE intencionalmente NÃO concedido a authenticated.
-- Impact-measurement faz-se via service_role (cron crm-measure-action-impact).

GRANT SELECT, INSERT ON crm.meta_campaign_changes TO authenticated;
GRANT ALL ON crm.meta_campaign_changes TO service_role;
