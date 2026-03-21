UPDATE storage.buckets SET public = false WHERE id = 'transaction-documents';

-- Drop the anonymous read policy
DROP POLICY IF EXISTS "Anyone can view transaction docs" ON storage.objects;

-- Replace with authenticated-only read policy
CREATE POLICY "Authenticated users can view transaction docs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'transaction-documents');