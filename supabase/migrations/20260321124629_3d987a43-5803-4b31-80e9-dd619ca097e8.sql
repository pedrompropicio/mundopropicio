
-- Restringir DELETE no bucket transaction-documents a admin/manager
DROP POLICY IF EXISTS "Authenticated users can delete transaction docs" ON storage.objects;
CREATE POLICY "Transaction docs deletable by admin or manager"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'transaction-documents'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );

-- Restringir DELETE no bucket supplier-documents a admin/manager
DROP POLICY IF EXISTS "Authenticated users can delete supplier documents" ON storage.objects;
CREATE POLICY "Supplier docs deletable by admin or manager"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'supplier-documents'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  );
