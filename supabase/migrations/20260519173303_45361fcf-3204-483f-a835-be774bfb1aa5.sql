DROP POLICY IF EXISTS "operacao_etapa_assignees_select_admin_bypass" ON public.operacao_etapa_assignees;
CREATE POLICY "operacao_etapa_assignees_select_admin_bypass" ON public.operacao_etapa_assignees
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = operacao_etapa_assignees.company_id
        AND ur.role = 'admin'::public.app_role
    )
  );

DROP POLICY IF EXISTS "operacao_etapa_assignees_update_admin_bypass" ON public.operacao_etapa_assignees;
CREATE POLICY "operacao_etapa_assignees_update_admin_bypass" ON public.operacao_etapa_assignees
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = operacao_etapa_assignees.company_id
        AND ur.role = 'admin'::public.app_role
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.company_id = operacao_etapa_assignees.company_id
        AND ur.role = 'admin'::public.app_role
    )
  );