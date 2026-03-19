-- Create permissions table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role, permission)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Role permissions viewable by authenticated"
  ON public.role_permissions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Role permissions manageable by admin"
  ON public.role_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin permissions
INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin', 'manage_users'),('admin', 'manage_settings'),('admin', 'delete_events'),
  ('admin', 'view_reports'),('admin', 'view_balances'),('admin', 'manage_events'),
  ('admin', 'manage_transactions'),('admin', 'manage_suppliers'),('admin', 'manage_quotations'),
  ('admin', 'manage_accounts'),('admin', 'manage_backups'),('admin', 'manage_tickets'),
  ('admin', 'manage_iva'),('admin', 'manage_categories'),('admin', 'manage_calendar');

-- Manager permissions
INSERT INTO public.role_permissions (role, permission) VALUES
  ('manager', 'view_reports'),('manager', 'view_balances'),('manager', 'manage_events'),
  ('manager', 'manage_transactions'),('manager', 'manage_suppliers'),('manager', 'manage_quotations'),
  ('manager', 'manage_accounts'),('manager', 'manage_tickets'),('manager', 'manage_iva'),
  ('manager', 'manage_categories'),('manager', 'manage_calendar');

-- Editor permissions (no reports/balances)
INSERT INTO public.role_permissions (role, permission) VALUES
  ('editor', 'manage_events'),('editor', 'manage_transactions'),('editor', 'manage_suppliers'),
  ('editor', 'manage_quotations'),('editor', 'manage_tickets'),('editor', 'manage_iva'),
  ('editor', 'manage_categories'),('editor', 'manage_calendar');

-- Viewer permissions (read-only)
INSERT INTO public.role_permissions (role, permission) VALUES
  ('viewer', 'view_reports'),('viewer', 'view_balances');

-- Function to check permissions
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role = ur.role
    WHERE ur.user_id = _user_id
      AND rp.permission = _permission
  )
$$;