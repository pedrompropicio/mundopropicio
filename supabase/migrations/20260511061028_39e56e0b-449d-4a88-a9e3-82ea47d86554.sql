CREATE TABLE crm.meta_campaign_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  connection_id uuid REFERENCES crm.ad_platform_connections(id) ON DELETE SET NULL,
  ad_account_id text,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  name text NOT NULL,
  goal_revenue_eur numeric(12,2) NOT NULL,
  ticket_avg_eur numeric(8,2),
  total_budget_eur numeric(12,2),
  target_roas numeric(5,2),
  days_until_event integer,
  country_codes text[],
  user_notes text,
  detected_artist text,
  generated_plan jsonb,
  generation_model text,
  generation_tokens_used integer,
  generated_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  approved_at timestamptz,
  approved_by uuid,
  actual_spent_eur numeric(12,2) DEFAULT 0,
  actual_revenue_eur numeric(12,2) DEFAULT 0,
  last_sync_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_campaign_strategies_status_check CHECK (status IN ('draft','generated','approved','in_progress','completed','archived'))
);

CREATE INDEX idx_meta_campaign_strategies_company ON crm.meta_campaign_strategies(company_id, status);
CREATE INDEX idx_meta_campaign_strategies_event ON crm.meta_campaign_strategies(event_id);
CREATE INDEX idx_meta_campaign_strategies_created_by ON crm.meta_campaign_strategies(created_by);

ALTER TABLE crm.meta_campaign_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass ON crm.meta_campaign_strategies
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY tenant_isolation_select ON crm.meta_campaign_strategies
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY tenant_isolation_insert ON crm.meta_campaign_strategies
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY tenant_isolation_update ON crm.meta_campaign_strategies
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE TRIGGER set_updated_at_meta_campaign_strategies
  BEFORE UPDATE ON crm.meta_campaign_strategies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();