-- Cobertura primeiro: incluir content_manager (quem realmente carrega arte do portal)
DROP POLICY IF EXISTS portal_marketing_images_insert ON storage.objects;
CREATE POLICY portal_marketing_images_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portal-marketing-images'
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
      OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'marketing_manager'::app_role)
      OR has_role(auth.uid(),'content_manager'::app_role) OR has_role(auth.uid(),'editor'::app_role))
    AND ((storage.foldername(name))[1])::uuid = current_company_id()
  );

DROP POLICY IF EXISTS portal_marketing_images_update ON storage.objects;
CREATE POLICY portal_marketing_images_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portal-marketing-images'
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
      OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'marketing_manager'::app_role)
      OR has_role(auth.uid(),'content_manager'::app_role) OR has_role(auth.uid(),'editor'::app_role))
    AND ((storage.foldername(name))[1])::uuid = current_company_id()
  )
  WITH CHECK (
    bucket_id = 'portal-marketing-images'
    AND ((storage.foldername(name))[1])::uuid = current_company_id()
  );

DROP POLICY IF EXISTS portal_marketing_images_delete ON storage.objects;
CREATE POLICY portal_marketing_images_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'portal-marketing-images'
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role)
      OR has_role(auth.uid(),'manager'::app_role) OR has_role(auth.uid(),'marketing_manager'::app_role)
      OR has_role(auth.uid(),'content_manager'::app_role) OR has_role(auth.uid(),'editor'::app_role))
    AND ((storage.foldername(name))[1])::uuid = current_company_id()
  );

-- Só agora o corte das largas (write/delete). A leitura pública mantém-se: bucket é público.
DROP POLICY IF EXISTS portal_marketing_images_auth_insert ON storage.objects;
DROP POLICY IF EXISTS portal_marketing_images_auth_update ON storage.objects;
DROP POLICY IF EXISTS portal_marketing_images_auth_delete ON storage.objects;