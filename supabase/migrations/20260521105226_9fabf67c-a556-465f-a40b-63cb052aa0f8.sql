DROP POLICY IF EXISTS "operacao-media insert admin bypass" ON storage.objects;
CREATE POLICY "operacao-media insert admin bypass"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'operacao-media'
  AND (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin', 'manager')
    )
  )
);