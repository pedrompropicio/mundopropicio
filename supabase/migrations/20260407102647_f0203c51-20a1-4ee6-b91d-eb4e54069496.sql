
INSERT INTO storage.buckets (id, name, public)
VALUES ('closing-cost-documents', 'closing-cost-documents', false);

CREATE POLICY "Closing cost docs viewable by authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'closing-cost-documents');

CREATE POLICY "Closing cost docs uploadable by authenticated"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'closing-cost-documents');

CREATE POLICY "Closing cost docs updatable by authenticated"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'closing-cost-documents');

CREATE POLICY "Closing cost docs deletable by admin or manager"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'closing-cost-documents'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);
