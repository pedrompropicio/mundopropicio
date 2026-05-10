-- CRM permission seed for public.role_permissions
-- + crm.role_budget_limits (per-role spend authorization caps, global lookup).
--
-- Depends on the previous migration that adds 'marketing_manager' to
-- public.app_role. PostgreSQL requires the enum value to be committed before
-- it can be used, hence the split.
--
-- Strict scope:
--   * No changes to existing tables other than role_permissions.
--   * role_permissions: INSERT only, idempotent via ON CONFLICT DO NOTHING.
--   * No changes to RLS of existing tables.
--
-- Reference: ARCHITECTURE.md §2.5 (naming) and §5.2.4 (purpose).

-- ============================================================================
-- 1) CRM permissions in public.role_permissions
-- ============================================================================
-- Naming follows §2.5: <domain>.<entity>.<action>.
-- Matrix:
--                              admin  manager  marketing_manager
--   crm.campaign.create          v       v            v
--   crm.campaign.publish         v       v            v
--   crm.campaign.set_budget      v       v            v   (gated by role_budget_limits)
--   crm.attribution.view         v       v            v
--   crm.audience.view            v       v            v
--   crm.audience.export          v       v            -   (PII export restricted)

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

-- ============================================================================
-- 2) crm.role_budget_limits — global lookup, NOT tenant-scoped
-- ============================================================================

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

-- ============================================================================
-- 3) Initial values (conservative; revisit before first paying tenant)
-- ============================================================================

INSERT INTO crm.role_budget_limits (role, monthly_cap_eur, per_campaign_cap_eur, description) VALUES
  ('marketing_manager',   5000.00,  1000.00, 'CRM operational role: day-to-day campaign management within tight caps.'),
  ('manager',            20000.00,  5000.00, 'Department lead: broader budget authority across CRM and ERP.'),
  ('admin',             100000.00,     NULL, 'Full authority. NULL per_campaign_cap = no per-campaign limit.');

-- ============================================================================
-- 4) updated_at auto-touch trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION crm.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
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

-- ============================================================================
-- 5) RLS: open SELECT to authenticated, writes only via service_role
-- ============================================================================

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
