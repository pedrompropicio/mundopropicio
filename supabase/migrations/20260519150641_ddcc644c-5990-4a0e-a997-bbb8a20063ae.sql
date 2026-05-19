-- Bypass de admin/platform_admin para INSERT em operacao_frentes
-- Mantém policy existente (manager/producer via has_permission); adiciona caminho seguro para admins.
DROP POLICY IF EXISTS "operacao_frentes_insert_admin_bypass" ON public.operacao_frentes;
CREATE POLICY "operacao_frentes_insert_admin_bypass" ON public.operacao_frentes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = operacao_frentes.company_id
        AND ur.role = 'admin'::public.app_role
    )
  );

-- Mesmo bypass para operacao_frente_team (helper setFrenteLead INSERTa lead permanente).
DROP POLICY IF EXISTS "operacao_frente_team_insert_admin_bypass" ON public.operacao_frente_team;
CREATE POLICY "operacao_frente_team_insert_admin_bypass" ON public.operacao_frente_team
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = operacao_frente_team.company_id
        AND ur.role = 'admin'::public.app_role
    )
  );