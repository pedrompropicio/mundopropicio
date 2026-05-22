
-- 1) Drop debug tables
DROP TABLE IF EXISTS public._coala_debug2;
DROP TABLE IF EXISTS public._coala_partner_debug;

-- 2) Views → security_invoker
ALTER VIEW public.vw_tickets_v2_sync_would_create SET (security_invoker = true);
ALTER VIEW public.vw_tickets_v2_sync_warnings SET (security_invoker = true);
ALTER VIEW public.vw_tickets_v2_sync_summary_7d SET (security_invoker = true);
ALTER VIEW public.vw_tickets_v2_test_health SET (security_invoker = true);

-- 3) Function search_path
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN (
        '_test_tickets_v2_compute_function',
        '_test_tickets_v2_invariants',
        '_test_tickets_v2_trigger_log_only',
        'coala_sync_touch_updated_at',
        'compute_ticket_type_for_lot',
        'event_ticket_types_validate_depth',
        'tickets_v2_run_all_tests',
        'tickets_v2_sync_lot'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public', r.proname, r.args);
  END LOOP;
END $$;

-- 4) reimbursement_notes: tighten SELECT
DROP POLICY IF EXISTS "Reimbursement notes viewable by authenticated" ON public.reimbursement_notes;
CREATE POLICY "Reimbursement notes viewable by privileged roles"
ON public.reimbursement_notes
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role)
);

-- 5) suppliers: remove editor SELECT (regression from 2026-05-01 hardening)
DROP POLICY IF EXISTS "Suppliers viewable by editor" ON public.suppliers;

-- 6) notification_queue: restrict SELECT to admin/manager
DROP POLICY IF EXISTS "queue_read_company" ON public.notification_queue;
CREATE POLICY "queue_read_admin_manager"
ON public.notification_queue
FOR SELECT TO authenticated
USING (
  company_id IN (SELECT uc.company_id FROM public.user_companies uc WHERE uc.user_id = auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR is_platform_admin(auth.uid()))
);

-- 7) notification_optin: company-scope admin reads
DROP POLICY IF EXISTS "optin_self_read" ON public.notification_optin;
CREATE POLICY "optin_self_read"
ON public.notification_optin
FOR SELECT TO authenticated
USING (
  profile_id = auth.uid()
  OR is_platform_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = notification_optin.profile_id
        AND p.company_id = current_company_id()
    )
  )
);

DROP POLICY IF EXISTS "optin_self_write" ON public.notification_optin;
CREATE POLICY "optin_self_write"
ON public.notification_optin
FOR ALL TO authenticated
USING (
  profile_id = auth.uid()
  OR is_platform_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = notification_optin.profile_id
        AND p.company_id = current_company_id()
    )
  )
)
WITH CHECK (
  profile_id = auth.uid()
  OR is_platform_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = notification_optin.profile_id
        AND p.company_id = current_company_id()
    )
  )
);

-- 8) login_attempts: explicit admin-only SELECT as belt-and-suspenders
CREATE POLICY "Login attempts viewable by admin only"
ON public.login_attempts
FOR SELECT TO authenticated
USING (is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- 9) suppressed_emails: explicit admin-only SELECT
CREATE POLICY "Suppressed emails viewable by admin only"
ON public.suppressed_emails
FOR SELECT TO authenticated
USING (is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
