-- D-ERP194 / Issue #283 parte A: papel mantém-se, acrescenta-se o predicado de empresa na linha.
DROP POLICY IF EXISTS lead_capture_admin_delete ON public.lead_capture;
CREATE POLICY lead_capture_admin_delete ON public.lead_capture
  FOR DELETE TO authenticated
  USING ((public.is_platform_admin((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role))
         AND public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS sync_runs_select_authenticated ON public.sync_runs;
CREATE POLICY sync_runs_select_authenticated ON public.sync_runs
  FOR SELECT TO authenticated
  USING (public.row_belongs_to_current_company(company_id));

DROP POLICY IF EXISTS consent_log_select_admin ON public.consent_log;
CREATE POLICY consent_log_select_admin ON public.consent_log
  FOR SELECT TO authenticated
  USING ((public.has_role((SELECT auth.uid()), 'admin'::app_role) OR public.has_role((SELECT auth.uid()), 'platform_admin'::app_role))
         AND public.row_belongs_to_current_company(company_id));