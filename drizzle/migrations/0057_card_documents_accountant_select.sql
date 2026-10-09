-- #234: contabilista lê talões de cartão da própria empresa. Só SELECT; DELETE intocado (#265).
CREATE POLICY "Card docs select accountant"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'card-documents'
  AND public.has_role(auth.uid(), 'accountant'::public.app_role)
  AND EXISTS (
    SELECT 1 FROM public.card_sessions s
    WHERE s.id::text = (storage.foldername(name))[1]
      AND public.row_belongs_to_current_company(s.company_id)
  )
);