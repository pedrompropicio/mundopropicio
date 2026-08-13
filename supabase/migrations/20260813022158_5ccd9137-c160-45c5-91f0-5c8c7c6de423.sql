-- Table policies
DROP POLICY IF EXISTS standalone_invoices_select ON public.standalone_invoices;
CREATE POLICY standalone_invoices_select ON public.standalone_invoices
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'platform_admin'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role)
);

DROP POLICY IF EXISTS standalone_invoices_insert ON public.standalone_invoices;
CREATE POLICY standalone_invoices_insert ON public.standalone_invoices
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'platform_admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'editor'::app_role)
);

DROP POLICY IF EXISTS standalone_invoices_update ON public.standalone_invoices;
CREATE POLICY standalone_invoices_update ON public.standalone_invoices
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'platform_admin'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
  OR created_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'platform_admin'::app_role)
  OR has_role(auth.uid(), 'accountant'::app_role)
  OR created_by = auth.uid()
);

-- Storage policies
DROP POLICY IF EXISTS standalone_invoices_storage_select ON storage.objects;
CREATE POLICY standalone_invoices_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'standalone-invoices'
  AND (storage.foldername(name))[1] = (current_company_id())::text
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  )
);

DROP POLICY IF EXISTS standalone_invoices_storage_insert ON storage.objects;
CREATE POLICY standalone_invoices_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'standalone-invoices'
  AND (storage.foldername(name))[1] = (current_company_id())::text
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'editor'::app_role)
  )
);