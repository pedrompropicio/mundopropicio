ALTER TABLE public.payment_list_documents
ADD COLUMN sepa_export_id uuid NULL REFERENCES public.payment_list_sepa_exports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_list_documents_sepa_export
  ON public.payment_list_documents(sepa_export_id);