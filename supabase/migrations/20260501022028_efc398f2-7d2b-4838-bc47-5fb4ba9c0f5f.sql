-- ============================================================================
-- SECURITY HARDENING 2026-05-01 (post multi-tenant) — v2
-- ============================================================================

-- FIX 1: suppliers — viewer já não lê dados bancários
DROP POLICY IF EXISTS "Suppliers viewable by editor" ON public.suppliers;

CREATE POLICY "Suppliers viewable by editor"
ON public.suppliers
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'editor'::app_role));

-- FIX 2: storage — remover policies fracas que furam role check
DROP POLICY IF EXISTS "Authenticated users can upload supplier documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete supplier documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete transaction docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload credit docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload import reports" ON storage.objects;
DROP POLICY IF EXISTS "Supplier docs uploadable by privileged roles" ON storage.objects;
DROP POLICY IF EXISTS "Transaction docs uploadable by privileged roles" ON storage.objects;
DROP POLICY IF EXISTS "Credit docs uploadable by admin or manager" ON storage.objects;
DROP POLICY IF EXISTS "Import reports uploadable by privileged roles" ON storage.objects;

CREATE POLICY "Supplier docs uploadable by privileged roles"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'supplier-documents'
  AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'editor'::app_role))
);

CREATE POLICY "Transaction docs uploadable by privileged roles"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'transaction-documents'
  AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'editor'::app_role))
);

CREATE POLICY "Credit docs uploadable by admin or manager"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'supplier-credit-documents'
  AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role))
);

CREATE POLICY "Import reports uploadable by privileged roles"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'import-reports'
  AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'manager'::app_role) OR public.has_role(auth.uid(),'editor'::app_role))
);

-- FIX 3: Realtime — removido desta migração.
-- O schema `realtime` é reservado pela plataforma e não deve ser alterado em
-- migrações de publicação. Esta hardening fica documentada/gerida fora do
-- pipeline de publish para evitar bloqueio de deploy em Live.
