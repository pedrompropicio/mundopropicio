ALTER TABLE crm.role_budget_limits
  ADD COLUMN IF NOT EXISTS max_daily_budget_eur NUMERIC(12,2) NULL
  CHECK (max_daily_budget_eur IS NULL OR max_daily_budget_eur >= 0);

COMMENT ON COLUMN crm.role_budget_limits.max_daily_budget_eur IS
  'Daily budget cap in EUR per role. NULL = no limit. Enforced server-side by crm-meta-entity-action and crm-meta-strategy-deploy.';

UPDATE crm.role_budget_limits SET max_daily_budget_eur = NULL, updated_at = NOW() WHERE role = 'admin';
UPDATE crm.role_budget_limits SET max_daily_budget_eur = 500,  updated_at = NOW() WHERE role = 'manager';
UPDATE crm.role_budget_limits SET max_daily_budget_eur = 200,  updated_at = NOW() WHERE role = 'marketing_manager';

INSERT INTO crm.role_budget_limits (role, monthly_cap_eur, per_campaign_cap_eur, max_daily_budget_eur, description)
VALUES ('platform_admin', 100000, NULL, NULL, 'Super-admin: full authority across platform, no budget limit.')
ON CONFLICT (role) DO UPDATE SET
  max_daily_budget_eur = EXCLUDED.max_daily_budget_eur,
  description          = EXCLUDED.description,
  updated_at           = NOW();

CREATE OR REPLACE FUNCTION public.get_user_max_daily_budget_eur(_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, crm
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN crm.role_budget_limits rbl ON rbl.role = ur.role
      WHERE ur.user_id = _user_id AND rbl.max_daily_budget_eur IS NULL
    ) THEN NULL
    WHEN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN crm.role_budget_limits rbl ON rbl.role = ur.role
      WHERE ur.user_id = _user_id
    ) THEN (
      SELECT MAX(rbl.max_daily_budget_eur)
      FROM public.user_roles ur
      JOIN crm.role_budget_limits rbl ON rbl.role = ur.role
      WHERE ur.user_id = _user_id
    )
    ELSE 0
  END;
$$;

COMMENT ON FUNCTION public.get_user_max_daily_budget_eur(uuid) IS
  'Returns max daily budget in EUR allowed for given user. NULL = no limit, 0 = no authority (fail-safe), >0 = cap.';

GRANT EXECUTE ON FUNCTION public.get_user_max_daily_budget_eur(uuid) TO authenticated, service_role;