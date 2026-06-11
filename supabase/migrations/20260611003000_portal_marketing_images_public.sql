-- Fix drift: keep portal-marketing-images public via tracked migration.
-- Reads must be public for CRM admin previews and the public portal.

UPDATE storage.buckets
   SET public = true
 WHERE id = 'portal-marketing-images';

-- Ensure write access is versioned and matches the event-images role pattern.
DROP POLICY IF EXISTS portal_marketing_images_insert ON storage.objects;
DROP POLICY IF EXISTS portal_marketing_images_update ON storage.objects;
DROP POLICY IF EXISTS portal_marketing_images_delete ON storage.objects;
DROP POLICY IF EXISTS "portal_marketing_images_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "portal_marketing_images_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "portal_marketing_images_auth_delete" ON storage.objects;

CREATE POLICY portal_marketing_images_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portal-marketing-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'platform_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'manager'::public.app_role) OR
      public.has_role(auth.uid(), 'content_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
    )
  );

CREATE POLICY portal_marketing_images_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portal-marketing-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'platform_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'manager'::public.app_role) OR
      public.has_role(auth.uid(), 'content_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'portal-marketing-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'platform_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'manager'::public.app_role) OR
      public.has_role(auth.uid(), 'content_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
    )
  );

CREATE POLICY portal_marketing_images_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'portal-marketing-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'platform_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'manager'::public.app_role) OR
      public.has_role(auth.uid(), 'content_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
    )
  );
