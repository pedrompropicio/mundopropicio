-- Add file_url column to supplier_credits
ALTER TABLE public.supplier_credits ADD COLUMN file_url text;

-- Create storage bucket for supplier credit documents
INSERT INTO storage.buckets (id, name, public) VALUES ('supplier-credit-documents', 'supplier-credit-documents', false);

-- RLS policies for supplier-credit-documents bucket
CREATE POLICY "Authenticated users can upload credit docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'supplier-credit-documents');

CREATE POLICY "Authenticated users can view credit docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'supplier-credit-documents');

CREATE POLICY "Admins and managers can delete credit docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'supplier-credit-documents'
  AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manager')
  )
);