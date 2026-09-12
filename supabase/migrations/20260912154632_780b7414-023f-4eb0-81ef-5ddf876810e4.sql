ALTER TABLE public.transaction_documents ADD COLUMN IF NOT EXISTS partner_visible boolean NOT NULL DEFAULT true;

DROP POLICY IF EXISTS transaction_documents_select_partner ON public.transaction_documents;

CREATE POLICY transaction_documents_select_partner
ON public.transaction_documents
FOR SELECT
USING (
  (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_documents.transaction_id
      AND t.event_id IS NOT NULL
      AND user_has_event_access(auth.uid(), t.event_id)
  ))
  AND has_permission(auth.uid(), 'view_partner_documents'::text)
  AND transaction_documents.partner_visible = true
);