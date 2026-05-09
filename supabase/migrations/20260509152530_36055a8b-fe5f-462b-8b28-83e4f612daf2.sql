-- Drop legacy leaky `auth.uid() IS NOT NULL` permissive SELECT policies that
-- coexisted with stricter permissives (Staff sees all / Only staff can view)
-- and bypassed them via PERMISSIVE OR-combine.
--
-- Tenant isolation was never compromised (RESTRICTIVE company_isolation_*
-- protects cross-tenant), but within-tenant: a partner could see all bp
-- versions (incl. archived/scenarios) and full audit log.
--
-- Idempotent — `IF EXISTS` so safe to re-run.

DROP POLICY IF EXISTS "Authenticated users can view bp_versions"
  ON public.bp_versions;

DROP POLICY IF EXISTS "Authenticated users can view bp_version_audit_log"
  ON public.bp_version_audit_log;

DROP POLICY IF EXISTS "Authenticated users can view supplier credits"
  ON public.supplier_credits;

DROP POLICY IF EXISTS "Admins and managers can delete supplier credits"
  ON public.supplier_credits;