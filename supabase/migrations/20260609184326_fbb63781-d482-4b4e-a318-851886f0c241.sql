-- Storage write policies for bucket `event-images`
-- Pattern based on existing portal-marketing-images policies.
-- Reads remain public via bucket setting; only write paths are added here.

DROP POLICY IF EXISTS event_images_insert ON storage.objects;
DROP POLICY IF EXISTS event_images_update ON storage.objects;
DROP POLICY IF EXISTS event_images_delete ON storage.objects;

CREATE POLICY event_images_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'platform_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'manager'::public.app_role) OR
      public.has_role(auth.uid(), 'content_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
    )
  );

CREATE POLICY event_images_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'platform_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'manager'::public.app_role) OR
      public.has_role(auth.uid(), 'content_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'event-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'platform_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'manager'::public.app_role) OR
      public.has_role(auth.uid(), 'content_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
    )
  );

CREATE POLICY event_images_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'platform_admin'::public.app_role) OR
      public.has_role(auth.uid(), 'manager'::public.app_role) OR
      public.has_role(auth.uid(), 'content_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role)
    )
  );
