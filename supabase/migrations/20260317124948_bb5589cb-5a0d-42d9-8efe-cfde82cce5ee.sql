-- Table for transaction document attachments
CREATE TABLE public.transaction_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  doc_type text NOT NULL DEFAULT 'comprovativo',
  uploaded_by text NOT NULL DEFAULT 'system',
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Transaction docs viewable by authenticated"
  ON public.transaction_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Transaction docs insertable by authenticated"
  ON public.transaction_documents FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Transaction docs deletable by authenticated"
  ON public.transaction_documents FOR DELETE TO authenticated
  USING (true);

-- Storage bucket for transaction documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('transaction-documents', 'transaction-documents', true);

CREATE POLICY "Authenticated users can upload transaction docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'transaction-documents');

CREATE POLICY "Anyone can view transaction docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'transaction-documents');

CREATE POLICY "Authenticated users can delete transaction docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'transaction-documents');