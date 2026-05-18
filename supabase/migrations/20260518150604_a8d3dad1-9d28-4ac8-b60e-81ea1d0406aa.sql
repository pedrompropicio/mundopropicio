-- Fix CompanySwitcher para users normais multi-empresa.
-- Problema: RLS RESTRICTIVE em user_roles/user_permissions filtra por
-- current_company_id() e esconde do próprio user as memberships noutras
-- empresas — impedindo o seletor de aparecer/funcionar.
--
-- Solução: adicionar OR (user_id = auth.uid()) para o user ver SEMPRE as
-- próprias linhas. Visualizar dados de OUTROS users continua escopado.

-- user_roles
DROP POLICY IF EXISTS company_isolation_user_roles ON public.user_roles;
CREATE POLICY company_isolation_user_roles ON public.user_roles
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR company_id = public.current_company_id()
    OR public.is_platform_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR company_id = public.current_company_id()
    OR public.is_platform_admin()
  );

-- user_permissions (mesmo padrão por simetria)
DROP POLICY IF EXISTS company_isolation_user_permissions ON public.user_permissions;
CREATE POLICY company_isolation_user_permissions ON public.user_permissions
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR company_id = public.current_company_id()
    OR public.is_platform_admin()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR company_id = public.current_company_id()
    OR public.is_platform_admin()
  );