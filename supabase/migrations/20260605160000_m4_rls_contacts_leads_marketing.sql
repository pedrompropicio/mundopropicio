-- ============================================================
-- M4 RLS — Acesso CRM admin para marketing_manager + UPDATE (06/06/26)
-- 
-- Existente: contacts/leads têm SELECT para admin + editor (RESTRICTIVE
-- company_isolation aplicada). UPDATE não tem policy explícita.
-- 
-- Esta migration:
-- - Adiciona policy SELECT para marketing_manager (paridade com admin/editor)
-- - Adiciona policy UPDATE para admin + marketing_manager + editor
-- 
-- Necessário para:
-- - Revogar consents via /admin/contactos (ContactDrawer)
-- - Marketers (role marketing_manager) verem listas de contacts e leads
-- 
-- DELETE continua sem policy explícita (não permitido — preservação).
-- INSERT continua via edge functions service_role (lead_capture pipeline).
-- ============================================================

-- contacts: SELECT para marketing_manager
CREATE POLICY contacts_marketing_select ON public.contacts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'marketing_manager'::public.app_role));

-- contacts: UPDATE para admin / marketing_manager / editor
CREATE POLICY contacts_admin_marketing_update ON public.contacts
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR
    public.has_role(auth.uid(), 'editor'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR
    public.has_role(auth.uid(), 'editor'::public.app_role)
  );

-- leads: SELECT para marketing_manager
CREATE POLICY leads_marketing_select ON public.leads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'marketing_manager'::public.app_role));

-- leads: UPDATE para admin / marketing_manager / editor
CREATE POLICY leads_admin_marketing_update ON public.leads
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR
    public.has_role(auth.uid(), 'editor'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR
    public.has_role(auth.uid(), 'editor'::public.app_role)
  );
