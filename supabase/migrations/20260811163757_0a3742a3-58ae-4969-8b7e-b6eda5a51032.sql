-- 1) Auditoria de downloads: aceitar documentos de camarim
ALTER TABLE public.document_download_audit
  DROP CONSTRAINT IF EXISTS document_download_audit_resource_type_check;

ALTER TABLE public.document_download_audit
  ADD CONSTRAINT document_download_audit_resource_type_check
  CHECK (resource_type IN ('transaction_document','zip_export','supplier_document','camarim_document'));

-- 2) Storage: leitura do bucket camarim-documents para o contabilista da empresa
DROP POLICY IF EXISTS "Camarim documents viewable by accountant" ON storage.objects;
CREATE POLICY "Camarim documents viewable by accountant"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'camarim-documents'
  AND has_role(auth.uid(), 'accountant'::app_role)
  AND public.row_belongs_to_current_company(
    NULLIF(split_part(name, '/', 1), '')::uuid
  )
);