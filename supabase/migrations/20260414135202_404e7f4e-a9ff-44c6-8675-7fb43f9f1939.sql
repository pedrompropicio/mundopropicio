
-- Update DB table RLS policy to include editor role
DROP POLICY IF EXISTS "Transaction docs deletable by admin or manager" ON public.transaction_documents;
CREATE POLICY "Transaction docs deletable by privileged roles" ON public.transaction_documents
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  );

-- Update storage policy to include editor role
DROP POLICY IF EXISTS "Transaction docs deletable by admin or manager" ON storage.objects;
CREATE POLICY "Transaction docs deletable by privileged roles" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'transaction-documents'
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'editor'::app_role)
    )
  );
