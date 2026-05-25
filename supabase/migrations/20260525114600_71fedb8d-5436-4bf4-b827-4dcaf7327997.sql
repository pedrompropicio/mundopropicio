-- Add company_id isolation to coala_sync_decisions policies
DROP POLICY IF EXISTS "Admin/manager view sync decisions" ON public.coala_sync_decisions;
DROP POLICY IF EXISTS "Admin/manager insert sync decisions" ON public.coala_sync_decisions;
DROP POLICY IF EXISTS "Admin/manager update sync decisions" ON public.coala_sync_decisions;
DROP POLICY IF EXISTS "Admin/manager delete sync decisions" ON public.coala_sync_decisions;

CREATE POLICY "Admin/manager view sync decisions"
ON public.coala_sync_decisions FOR SELECT
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role))
  AND (company_id IS NULL OR company_id = current_company_id() OR is_platform_admin(auth.uid()))
);

CREATE POLICY "Admin/manager insert sync decisions"
ON public.coala_sync_decisions FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role))
  AND (company_id IS NULL OR company_id = current_company_id() OR is_platform_admin(auth.uid()))
);

CREATE POLICY "Admin/manager update sync decisions"
ON public.coala_sync_decisions FOR UPDATE
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role))
  AND (company_id IS NULL OR company_id = current_company_id() OR is_platform_admin(auth.uid()))
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role))
  AND (company_id IS NULL OR company_id = current_company_id() OR is_platform_admin(auth.uid()))
);

CREATE POLICY "Admin/manager delete sync decisions"
ON public.coala_sync_decisions FOR DELETE
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role))
  AND (company_id IS NULL OR company_id = current_company_id() OR is_platform_admin(auth.uid()))
);