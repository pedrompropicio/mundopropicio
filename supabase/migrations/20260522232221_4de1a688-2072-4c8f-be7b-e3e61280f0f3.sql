
-- Helper inline: checa admin/manager/editor da empresa atual
-- Usa has_role já existente

-- ===== supplier-credit-documents =====
DROP POLICY IF EXISTS "Authenticated users can view credit docs" ON storage.objects;
CREATE POLICY "Staff can view supplier credit docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'supplier-credit-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  )
);

-- ===== supplier-documents =====
DROP POLICY IF EXISTS "Authenticated users can view supplier documents" ON storage.objects;
CREATE POLICY "Staff can view supplier documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'supplier-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  )
);

-- ===== transaction-documents =====
DROP POLICY IF EXISTS "Anyone can view transaction docs" ON storage.objects;
CREATE POLICY "Staff can view transaction docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'transaction-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  )
);

-- ===== cache-extra-documents =====
DROP POLICY IF EXISTS "Cache extra docs viewable by authenticated" ON storage.objects;
CREATE POLICY "Staff can view cache extra docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'cache-extra-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

-- ===== closing-cost-documents (SELECT/INSERT/UPDATE) =====
DROP POLICY IF EXISTS "Closing cost docs viewable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Closing cost docs uploadable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Closing cost docs updatable by authenticated" ON storage.objects;

CREATE POLICY "Staff can view closing cost docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'closing-cost-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY "Staff can upload closing cost docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'closing-cost-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

CREATE POLICY "Staff can update closing cost docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'closing-cost-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'closing-cost-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

-- ===== import-reports =====
DROP POLICY IF EXISTS "Authenticated users can view import reports" ON storage.objects;
CREATE POLICY "Staff can view import reports"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'import-reports'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
  )
);

-- ===== partner-extra-documents =====
DROP POLICY IF EXISTS "Partner extra docs viewable by authenticated" ON storage.objects;
CREATE POLICY "Staff can view partner extra docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'partner-extra-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  )
);

-- ===== crm-meta-creatives (remover acesso anónimo) =====
DROP POLICY IF EXISTS "public_select_creatives" ON storage.objects;
CREATE POLICY "Authenticated can view crm creatives"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'crm-meta-creatives');
