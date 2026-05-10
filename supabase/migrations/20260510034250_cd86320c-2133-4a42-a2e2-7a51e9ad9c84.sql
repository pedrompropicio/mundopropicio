INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin',             'crm.campaign.create'),
  ('admin',             'crm.campaign.publish'),
  ('admin',             'crm.campaign.set_budget'),
  ('admin',             'crm.attribution.view'),
  ('admin',             'crm.audience.view'),
  ('admin',             'crm.audience.export'),
  ('manager',           'crm.campaign.create'),
  ('manager',           'crm.campaign.publish'),
  ('manager',           'crm.campaign.set_budget'),
  ('manager',           'crm.attribution.view'),
  ('manager',           'crm.audience.view'),
  ('manager',           'crm.audience.export'),
  ('marketing_manager', 'crm.campaign.create'),
  ('marketing_manager', 'crm.campaign.publish'),
  ('marketing_manager', 'crm.campaign.set_budget'),
  ('marketing_manager', 'crm.attribution.view'),
  ('marketing_manager', 'crm.audience.view')
ON CONFLICT (role, permission) DO NOTHING;

CREATE TABLE crm.role_budget_limits (
  role                 public.app_role PRIMARY KEY,
  monthly_cap_eur      numeric(12,2)   NOT NULL CHECK (monthly_cap_eur >= 0),
  per_campaign_cap_eur numeric(12,2)            CHECK (per_campaign_cap_eur >= 0),
  description          text,
  created_at           timestamptz     NOT NULL DEFAULT now(),
  updated_at           timestamptz     NOT NULL DEFAULT now()
);

COMMENT ON TABLE crm.role_budget_limits IS
  'Per-role spend authorization caps for CRM/Ads. Global lookup (not tenant-scoped). See ARCHITECTURE.md §5.2.4.';

INSERT INTO crm.role_budget_limits (role, monthly_cap_eur, per_campaign_cap_eur, description) VALUES
  ('marketing_manager',   5000.00,  1000.00, 'CRM operational role: day-to-day campaign management within tight caps.'),
  ('manager',            20000.00,  5000.00, 'Department lead: broader budget authority across CRM and ERP.'),
  ('admin',             100000.00,     NULL, 'Full authority. NULL per_campaign_cap = no per-campaign limit.');

CREATE OR REPLACE FUNCTION crm.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_role_budget_limits_touch_updated_at
BEFORE UPDATE ON crm.role_budget_limits
FOR EACH ROW
EXECUTE FUNCTION crm.touch_updated_at();

ALTER TABLE crm.role_budget_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_open ON crm.role_budget_limits
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY service_role_bypass ON crm.role_budget_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);