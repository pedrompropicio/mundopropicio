CREATE TABLE public.entity_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  document_type text NOT NULL,
  company_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  notes text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_documents_entity_type_check CHECK (entity_type IN ('event')),
  CONSTRAINT entity_documents_document_type_check CHECK (document_type IN ('fecho','ata','contrato','acerto_socio','licenca','seguro','outro')),
  CONSTRAINT entity_documents_storage_path_key UNIQUE (storage_path)
);

CREATE INDEX idx_entity_documents_entity ON public.entity_documents (entity_type, entity_id);

GRANT SELECT, INSERT, DELETE ON public.entity_documents TO authenticated;
GRANT ALL ON public.entity_documents TO service_role;

ALTER TABLE public.entity_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation_entity_documents"
ON public.entity_documents
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.row_belongs_to_current_company(company_id))
WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE POLICY "ed select members"
ON public.entity_documents
FOR SELECT
TO authenticated
USING (public.is_platform_admin() OR company_id = public.current_company_id());

CREATE POLICY "ed insert privileged"
ON public.entity_documents
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_platform_admin() OR (
    company_id = public.current_company_id() AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'editor'::app_role)
    )
  )
);

CREATE POLICY "ed delete privileged"
ON public.entity_documents
FOR DELETE
TO authenticated
USING (
  public.is_platform_admin() OR (
    company_id = public.current_company_id() AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
    )
  )
);

CREATE TRIGGER trg_set_company_id
BEFORE INSERT ON public.entity_documents
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();

CREATE POLICY "ed-storage select members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'entity-documents' AND (
    public.is_platform_admin()
    OR (storage.foldername(name))[1] = (public.current_company_id())::text
  )
);

CREATE POLICY "ed-storage insert privileged"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'entity-documents' AND (
    public.is_platform_admin() OR (
      (storage.foldername(name))[1] = (public.current_company_id())::text AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role)
        OR public.has_role(auth.uid(), 'editor'::app_role)
      )
    )
  )
);

CREATE POLICY "ed-storage delete privileged"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'entity-documents' AND (
    public.is_platform_admin() OR (
      (storage.foldername(name))[1] = (public.current_company_id())::text AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'manager'::app_role)
      )
    )
  )
);