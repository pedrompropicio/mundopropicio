-- 1) COBERTURA PRIMEIRO: papéis que hoje dependiam da policy larga
CREATE POLICY "Accountant and viewer can view transaction docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'transaction-documents'
  AND (
    has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'viewer'::app_role)
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  )
);

CREATE POLICY "Accountant can view supplier documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'supplier-documents'
  AND (
    has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  )
);

-- 2) SÓ DEPOIS: remover as policies largas (bucket_id = ... sem papel nem empresa)
DROP POLICY IF EXISTS "Anyone can view transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view supplier documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload supplier documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete supplier documents" ON storage.objects;
