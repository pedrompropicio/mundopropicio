-- Bucket público para logos de empresas (usado em headers da app e em emails de auth).
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública (necessária para os emails referenciarem por URL).
DROP POLICY IF EXISTS "Public read company-logos" ON storage.objects;
CREATE POLICY "Public read company-logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

-- Apenas platform_admin / admin podem fazer upload, update e delete.
DROP POLICY IF EXISTS "Admin write company-logos" ON storage.objects;
CREATE POLICY "Admin write company-logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role))
);

DROP POLICY IF EXISTS "Admin update company-logos" ON storage.objects;
CREATE POLICY "Admin update company-logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role))
);

DROP POLICY IF EXISTS "Admin delete company-logos" ON storage.objects;
CREATE POLICY "Admin delete company-logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (public.has_role(auth.uid(), 'platform_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role))
);