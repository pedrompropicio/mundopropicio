-- ============================================================
-- M3 prep — Bucket Storage portal-marketing-images (05/06/26)
-- Para uploads de imagens curadas (hero, og, poster_vertical, gallery)
-- de event_marketing e static_pages via admin do portal novo.
--
-- Path convention: <company_id>/<purpose>/<event_id|slug>/<filename>
--   ex: 7c858982-6ccd-47ca-bd65-e0dd3eebf01c/event-marketing/<event_id>/hero.jpg
--   ex: 7c858982-6ccd-47ca-bd65-e0dd3eebf01c/static-pages/<slug>/og.jpg
-- ============================================================

-- Criar/actualizar bucket público com limite 10MB e mime types image/*
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portal-marketing-images',
  'portal-marketing-images',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================================
-- RLS policies em storage.objects para este bucket
-- ============================================================

-- SELECT público (bucket public=true mas explicitar)
CREATE POLICY portal_marketing_images_select
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'portal-marketing-images');

-- INSERT: authenticated + role admin/marketing_manager/editor + path começa com sua company_id
CREATE POLICY portal_marketing_images_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portal-marketing-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'editor'::public.app_role)
    )
    AND (storage.foldername(name))[1]::uuid = public.current_company_id()
  );

-- UPDATE: mesma regra
CREATE POLICY portal_marketing_images_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portal-marketing-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'editor'::public.app_role)
    )
    AND (storage.foldername(name))[1]::uuid = public.current_company_id()
  )
  WITH CHECK (
    bucket_id = 'portal-marketing-images'
    AND (storage.foldername(name))[1]::uuid = public.current_company_id()
  );

-- DELETE: mesma regra
CREATE POLICY portal_marketing_images_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'portal-marketing-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role) OR
      public.has_role(auth.uid(), 'marketing_manager'::public.app_role) OR
      public.has_role(auth.uid(), 'editor'::public.app_role)
    )
    AND (storage.foldername(name))[1]::uuid = public.current_company_id()
  );
