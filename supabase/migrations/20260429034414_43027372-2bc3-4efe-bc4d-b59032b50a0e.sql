-- user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation_user_roles ON public.user_roles;
CREATE POLICY company_isolation_user_roles ON public.user_roles
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() OR public.is_platform_admin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_platform_admin());

-- user_permissions
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation_user_permissions ON public.user_permissions;
CREATE POLICY company_isolation_user_permissions ON public.user_permissions
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (company_id = public.current_company_id() OR public.is_platform_admin())
  WITH CHECK (company_id = public.current_company_id() OR public.is_platform_admin());