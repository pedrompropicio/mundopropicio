
-- =====================================================
-- 1. financial_account_access: restrict SELECT to own user or admin/manager
-- =====================================================
DROP POLICY IF EXISTS "Account access viewable by authenticated" ON public.financial_account_access;
CREATE POLICY "Account access viewable by own user or privileged"
  ON public.financial_account_access FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- =====================================================
-- 2. partner_event_access: restrict SELECT to own user or admin
-- =====================================================
DROP POLICY IF EXISTS "Partner access viewable by authenticated" ON public.partner_event_access;
CREATE POLICY "Partner access viewable by own user or admin"
  ON public.partner_event_access FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- =====================================================
-- 3. user_roles: restrict SELECT to own user or admin/manager
-- =====================================================
DROP POLICY IF EXISTS "Users can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;
-- Find and drop the existing permissive SELECT policy
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', pol.policyname);
  END LOOP;
END$$;

CREATE POLICY "User roles viewable by own user or privileged"
  ON public.user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- =====================================================
-- 4. user_permissions: restrict SELECT to own user or admin
-- =====================================================
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_permissions' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_permissions', pol.policyname);
  END LOOP;
END$$;

CREATE POLICY "User permissions viewable by own user or admin"
  ON public.user_permissions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- =====================================================
-- 5. transaction_audit_log: restrict INSERT to privileged roles
-- =====================================================
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transaction_audit_log' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.transaction_audit_log', pol.policyname);
  END LOOP;
END$$;

CREATE POLICY "Transaction audit log insertable by privileged roles"
  ON public.transaction_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- =====================================================
-- 6. system_audit_log: restrict INSERT to admin/manager + service_role
-- =====================================================
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'system_audit_log' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_audit_log', pol.policyname);
  END LOOP;
END$$;

CREATE POLICY "System audit log insertable by privileged roles"
  ON public.system_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- Keep service_role access for edge functions
CREATE POLICY "System audit log insertable by service role"
  ON public.system_audit_log FOR INSERT TO public
  WITH CHECK (auth.role() = 'service_role'::text);

-- =====================================================
-- 7. supplier_documents: restrict UPDATE to privileged roles
-- =====================================================
DROP POLICY IF EXISTS "Supplier documents updatable by authenticated" ON public.supplier_documents;
CREATE POLICY "Supplier documents updatable by privileged roles"
  ON public.supplier_documents FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- =====================================================
-- 8. event_cache_configs: restrict INSERT and UPDATE to admin/manager
-- =====================================================
DROP POLICY IF EXISTS "Cache configs insertable by authenticated" ON public.event_cache_configs;
CREATE POLICY "Cache configs insertable by admin or manager"
  ON public.event_cache_configs FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "Cache configs updatable by authenticated" ON public.event_cache_configs;
CREATE POLICY "Cache configs updatable by admin or manager"
  ON public.event_cache_configs FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- =====================================================
-- 9. event_cache_deductions: restrict all writes to admin/manager
-- =====================================================
DROP POLICY IF EXISTS "Cache deductions deletable by authenticated" ON public.event_cache_deductions;
CREATE POLICY "Cache deductions deletable by admin or manager"
  ON public.event_cache_deductions FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "Cache deductions insertable by authenticated" ON public.event_cache_deductions;
CREATE POLICY "Cache deductions insertable by admin or manager"
  ON public.event_cache_deductions FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

DROP POLICY IF EXISTS "Cache deductions updatable by authenticated" ON public.event_cache_deductions;
CREATE POLICY "Cache deductions updatable by admin or manager"
  ON public.event_cache_deductions FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

-- =====================================================
-- 10. Storage: remove permissive delete policies that override restrictive ones
-- =====================================================
DROP POLICY IF EXISTS "Authenticated users can delete supplier documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete transaction docs" ON storage.objects;
