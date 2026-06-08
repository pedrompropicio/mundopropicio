-- Fase 1 RBAC (extensão): content_manager com escrita ampla no MP CRM.
-- Replica padrão existente. Mantém RESTRICTIVE company_isolation_* intactas.
-- Exceções: NÃO concede DELETE em contacts/leads/lead_capture; NÃO concede DELETE em events.
-- Não toca em tabelas financeiras/operacionais do ERP.

-- ============================================================
-- contacts: estender SELECT e UPDATE (sem DELETE, sem INSERT direto)
-- ============================================================
DROP POLICY IF EXISTS contacts_admin_editor_select ON public.contacts;
CREATE POLICY contacts_admin_editor_select
  ON public.contacts
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

DROP POLICY IF EXISTS contacts_admin_marketing_update ON public.contacts;
CREATE POLICY contacts_admin_marketing_update
  ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

-- ============================================================
-- leads: estender SELECT e UPDATE (sem DELETE, sem INSERT direto)
-- ============================================================
DROP POLICY IF EXISTS leads_admin_editor_select ON public.leads;
CREATE POLICY leads_admin_editor_select
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

DROP POLICY IF EXISTS leads_admin_marketing_update ON public.leads;
CREATE POLICY leads_admin_marketing_update
  ON public.leads
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

-- ============================================================
-- audiences / audience_snapshots / audience_members
-- (estender *_write ALL — inclui DELETE, permitido em públicos)
-- ============================================================
DROP POLICY IF EXISTS audiences_write ON public.audiences;
CREATE POLICY audiences_write
  ON public.audiences
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

DROP POLICY IF EXISTS audience_snapshots_write ON public.audience_snapshots;
CREATE POLICY audience_snapshots_write
  ON public.audience_snapshots
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

DROP POLICY IF EXISTS audience_members_write ON public.audience_members;
CREATE POLICY audience_members_write
  ON public.audience_members
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'marketing_manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

-- ============================================================
-- events: estender INSERT e UPDATE (sem DELETE — admin only)
-- ============================================================
DROP POLICY IF EXISTS "Events insertable by privileged roles" ON public.events;
CREATE POLICY "Events insertable by privileged roles"
  ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

DROP POLICY IF EXISTS "Events updatable by privileged roles" ON public.events;
CREATE POLICY "Events updatable by privileged roles"
  ON public.events
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'content_manager'::app_role)
  );

NOTIFY pgrst, 'reload schema';