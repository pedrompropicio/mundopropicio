-- Per-user permission overrides
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, permission)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User permissions viewable by authenticated"
  ON public.user_permissions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "User permissions manageable by admin"
  ON public.user_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add granular report permissions to role_permissions for admin/manager
INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin', 'view_report_dre'),
  ('admin', 'view_report_pl'),
  ('admin', 'view_report_cashflow'),
  ('admin', 'view_report_bank_statement'),
  ('admin', 'view_report_contas_pagar'),
  ('admin', 'view_report_payment_lists'),
  ('admin', 'view_report_suppliers'),
  ('admin', 'view_report_categories'),
  ('manager', 'view_report_dre'),
  ('manager', 'view_report_pl'),
  ('manager', 'view_report_cashflow'),
  ('manager', 'view_report_bank_statement'),
  ('manager', 'view_report_contas_pagar'),
  ('manager', 'view_report_payment_lists'),
  ('manager', 'view_report_suppliers'),
  ('manager', 'view_report_categories'),
  ('viewer', 'view_report_dre'),
  ('viewer', 'view_report_pl'),
  ('viewer', 'view_report_cashflow'),
  ('viewer', 'view_report_bank_statement'),
  ('viewer', 'view_report_contas_pagar'),
  ('viewer', 'view_report_payment_lists'),
  ('viewer', 'view_report_suppliers'),
  ('viewer', 'view_report_categories');

-- Update has_permission to consider user-level overrides
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- User-level override takes priority
    (SELECT granted FROM public.user_permissions WHERE user_id = _user_id AND permission = _permission),
    -- Fall back to role-level permission
    (SELECT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission = _permission
    ))
  )
$$;