
-- 1) Tighten profiles SELECT: self + admin (same company) + platform_admin only
DROP POLICY IF EXISTS "Profiles visible by membership" ON public.profiles;

CREATE POLICY "Profiles visible to self or admins"
ON public.profiles
FOR SELECT
USING (
  id = auth.uid()
  OR is_platform_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND company_id = current_company_id()
  )
);

-- 2) operacao-media INSERT: enforce path-based company isolation
DROP POLICY IF EXISTS "operacao-media insert admin bypass" ON storage.objects;

CREATE POLICY "operacao-media insert admin bypass"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'operacao-media'
  AND (
    is_platform_admin()
    OR (
      EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role::text = ANY (ARRAY['admin','manager'])
      )
      AND (storage.foldername(name))[1] = current_company_id()::text
    )
  )
);
