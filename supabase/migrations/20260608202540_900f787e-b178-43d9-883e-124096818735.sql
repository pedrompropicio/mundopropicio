
CREATE POLICY "accountant_exports_select_admin_manager"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'accountant-exports'
    AND (
      public.has_role(auth.uid(), 'platform_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'accountant'::app_role)
    )
  );
