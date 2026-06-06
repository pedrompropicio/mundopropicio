CREATE POLICY contacts_marketing_select ON public.contacts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'marketing_manager'::public.app_role));

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

CREATE POLICY leads_marketing_select ON public.leads
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'marketing_manager'::public.app_role));

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