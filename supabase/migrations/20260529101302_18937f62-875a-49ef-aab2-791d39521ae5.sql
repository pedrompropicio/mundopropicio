
-- 1. profiles.first_access_token: column-level revoke for authenticated/anon
REVOKE SELECT (first_access_token) ON public.profiles FROM authenticated;
REVOKE SELECT (first_access_token) ON public.profiles FROM anon;
-- service_role keeps full access (edge functions use it)

-- 2. operacao-media INSERT: add company path isolation
DROP POLICY IF EXISTS operacao_media_insert ON storage.objects;
CREATE POLICY operacao_media_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'operacao-media'
    AND has_permission(auth.uid(), 'register_operacao')
    AND (storage.foldername(name))[1] = (current_company_id())::text
  );

-- 3. operacao-media UPDATE: add company path isolation
DROP POLICY IF EXISTS operacao_media_update ON storage.objects;
CREATE POLICY operacao_media_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'operacao-media'
    AND has_permission(auth.uid(), 'register_operacao')
    AND (storage.foldername(name))[1] = (current_company_id())::text
  );
