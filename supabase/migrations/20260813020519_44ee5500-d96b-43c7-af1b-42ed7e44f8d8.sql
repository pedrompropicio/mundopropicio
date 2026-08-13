CREATE TABLE public.standalone_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT current_company_id(),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  supplier_name text,
  supplier_nif text,
  invoice_date date,
  total_amount numeric,
  iva_amount numeric,
  notes text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','processed')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.standalone_invoices TO authenticated;
GRANT ALL ON public.standalone_invoices TO service_role;

ALTER TABLE public.standalone_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "standalone_invoices_select"
  ON public.standalone_invoices FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "standalone_invoices_insert"
  ON public.standalone_invoices FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  );

CREATE POLICY "standalone_invoices_update"
  ON public.standalone_invoices FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "standalone_invoices_delete"
  ON public.standalone_invoices FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_admin'::app_role)
  );

CREATE POLICY "company_isolation_standalone_invoices"
  ON public.standalone_invoices AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE TRIGGER trg_standalone_invoices_updated_at
  BEFORE UPDATE ON public.standalone_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_standalone_invoices_company_date
  ON public.standalone_invoices (company_id, invoice_date DESC, created_at DESC);

-- Storage policies (bucket privado standalone-invoices, isolado por empresa)
CREATE POLICY "standalone_invoices_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'standalone-invoices'
    AND (storage.foldername(name))[1] = current_company_id()::text
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'platform_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
    )
  );

CREATE POLICY "standalone_invoices_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'standalone-invoices'
    AND (storage.foldername(name))[1] = current_company_id()::text
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'platform_admin'::app_role)
    )
  );

CREATE POLICY "standalone_invoices_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'standalone-invoices'
    AND (storage.foldername(name))[1] = current_company_id()::text
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'platform_admin'::app_role)
    )
  );