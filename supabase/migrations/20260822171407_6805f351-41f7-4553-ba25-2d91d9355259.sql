GRANT USAGE ON SCHEMA crm TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS crm.google_conversion_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid,
  customer_id text NOT NULL,
  resource_name text NOT NULL,
  external_id text,
  name text,
  type text,
  status text,
  category text,
  primary_for_goal boolean,
  raw jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT google_conversion_action_uniq UNIQUE (company_id, customer_id, resource_name)
);
COMMENT ON TABLE crm.google_conversion_action IS 'Espelho das conversion actions da conta Google Ads. Fonte para a meta da campanha no publicador; NAO e source of truth (ver last_synced_at).';

ALTER TABLE crm.google_conversion_action ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON crm.google_conversion_action;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.google_conversion_action;
DROP POLICY IF EXISTS tenant_isolation_update ON crm.google_conversion_action;
DROP POLICY IF EXISTS service_role_bypass ON crm.google_conversion_action;
CREATE POLICY tenant_isolation_select ON crm.google_conversion_action FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.google_conversion_action FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company_id());
CREATE POLICY tenant_isolation_update ON crm.google_conversion_action FOR UPDATE TO authenticated USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY service_role_bypass ON crm.google_conversion_action FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON crm.google_conversion_action TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_google_conv_action_company ON crm.google_conversion_action(company_id, customer_id);

CREATE TABLE IF NOT EXISTS crm.google_publish_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  design_id uuid,
  connection_id uuid,
  customer_id text NOT NULL,
  login_customer_id text,
  nome_campanha text NOT NULL,
  objetivo text NOT NULL DEFAULT 'CONVERSIONS' CHECK (objetivo IN ('CONVERSIONS','TRAFFIC')),
  estrategia_lance text NOT NULL DEFAULT 'MAXIMIZE_CONVERSIONS'
    CHECK (estrategia_lance IN ('MAXIMIZE_CONVERSIONS','MAXIMIZE_CLICKS')),
  conversion_action_ref text,
  orcamento_diario_micros bigint NOT NULL CHECK (orcamento_diario_micros > 0),
  moeda text NOT NULL DEFAULT 'EUR',
  link_destino text NOT NULL,
  start_date date,
  end_date date,
  geo jsonb NOT NULL DEFAULT '{}'::jsonb,
  idiomas jsonb NOT NULL DEFAULT '["pt"]'::jsonb,
  ad_groups jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado text NOT NULL DEFAULT 'rascunho' CHECK (estado IN (
    'rascunho','pronto_a_publicar','a_publicar','publicado','falhado','ativo','pausado','cancelado'
  )),
  google_budget_resource text,
  google_campaign_resource text,
  google_campaign_id text,
  campaign_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  resumo jsonb,
  publish_error jsonb,
  activation_error jsonb,
  publish_started_at timestamptz,
  publish_finished_at timestamptz,
  published_at timestamptz,
  activated_at timestamptz,
  activated_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE crm.google_publish_plan IS 'Plano de publicacao de campanha de Pesquisa no Google Ads. Cada resource_name devolvido pela API e persistido aqui para a retoma ser idempotente. Campanhas nascem sempre PAUSED.';

ALTER TABLE crm.google_publish_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON crm.google_publish_plan;
DROP POLICY IF EXISTS tenant_isolation_insert ON crm.google_publish_plan;
DROP POLICY IF EXISTS tenant_isolation_update ON crm.google_publish_plan;
DROP POLICY IF EXISTS service_role_bypass ON crm.google_publish_plan;
CREATE POLICY tenant_isolation_select ON crm.google_publish_plan FOR SELECT TO authenticated USING (company_id = public.current_company_id());
CREATE POLICY tenant_isolation_insert ON crm.google_publish_plan FOR INSERT TO authenticated WITH CHECK (company_id = public.current_company_id());
CREATE POLICY tenant_isolation_update ON crm.google_publish_plan FOR UPDATE TO authenticated USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY service_role_bypass ON crm.google_publish_plan FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON crm.google_publish_plan TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_google_publish_plan_event ON crm.google_publish_plan(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_publish_plan_company ON crm.google_publish_plan(company_id, estado);

CREATE OR REPLACE FUNCTION crm.google_publish_plan_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = crm, public AS $func$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$func$;

DROP TRIGGER IF EXISTS trg_google_publish_plan_touch ON crm.google_publish_plan;
CREATE TRIGGER trg_google_publish_plan_touch
  BEFORE UPDATE ON crm.google_publish_plan
  FOR EACH ROW EXECUTE FUNCTION crm.google_publish_plan_touch();