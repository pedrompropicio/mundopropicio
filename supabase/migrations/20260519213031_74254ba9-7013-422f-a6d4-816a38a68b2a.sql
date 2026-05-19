-- OP-13 Pre-Sprint: admin bypass SELECT em 5 tabelas operacao_*
-- Pattern replicado de operacao_etapa_assignees_select_admin_bypass
-- Todas as 5 tabelas têm company_id directo (confirmado)

DROP POLICY IF EXISTS "operacao_etapas_select_admin_bypass" ON public.operacao_etapas;
CREATE POLICY "operacao_etapas_select_admin_bypass" ON public.operacao_etapas
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = operacao_etapas.company_id
        AND ur.role = 'admin'::public.app_role
    )
  );

DROP POLICY IF EXISTS "operacao_frentes_select_admin_bypass" ON public.operacao_frentes;
CREATE POLICY "operacao_frentes_select_admin_bypass" ON public.operacao_frentes
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = operacao_frentes.company_id
        AND ur.role = 'admin'::public.app_role
    )
  );

DROP POLICY IF EXISTS "operacao_frente_team_select_admin_bypass" ON public.operacao_frente_team;
CREATE POLICY "operacao_frente_team_select_admin_bypass" ON public.operacao_frente_team
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = operacao_frente_team.company_id
        AND ur.role = 'admin'::public.app_role
    )
  );

DROP POLICY IF EXISTS "operacao_registros_select_admin_bypass" ON public.operacao_registros;
CREATE POLICY "operacao_registros_select_admin_bypass" ON public.operacao_registros
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = operacao_registros.company_id
        AND ur.role = 'admin'::public.app_role
    )
  );

DROP POLICY IF EXISTS "operacao_etapa_suppliers_select_admin_bypass" ON public.operacao_etapa_suppliers;
CREATE POLICY "operacao_etapa_suppliers_select_admin_bypass" ON public.operacao_etapa_suppliers
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = operacao_etapa_suppliers.company_id
        AND ur.role = 'admin'::public.app_role
    )
  );