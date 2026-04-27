-- Permitir que utilizadores com permissão camarim_manage (ex: Editores) também possam fazer upload, ver, atualizar e eliminar ficheiros no bucket camarim-documents
DROP POLICY IF EXISTS "Camarim documents viewable by authenticated" ON storage.objects;
DROP POLICY IF EXISTS "Camarim documents insertable by team or manager" ON storage.objects;
DROP POLICY IF EXISTS "Camarim documents updatable by team or manager" ON storage.objects;
DROP POLICY IF EXISTS "Camarim documents deletable by team or manager" ON storage.objects;

CREATE POLICY "Camarim documents viewable by authenticated"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'camarim-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_permission(auth.uid(), 'camarim_team'::text)
    OR has_permission(auth.uid(), 'camarim_manage'::text)
  )
);

CREATE POLICY "Camarim documents insertable by team or manager"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'camarim-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_permission(auth.uid(), 'camarim_team'::text)
    OR has_permission(auth.uid(), 'camarim_manage'::text)
  )
);

CREATE POLICY "Camarim documents updatable by team or manager"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'camarim-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR (has_permission(auth.uid(), 'camarim_team'::text) AND owner = auth.uid())
    OR has_permission(auth.uid(), 'camarim_manage'::text)
  )
)
WITH CHECK (
  bucket_id = 'camarim-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR (has_permission(auth.uid(), 'camarim_team'::text) AND owner = auth.uid())
    OR has_permission(auth.uid(), 'camarim_manage'::text)
  )
);

CREATE POLICY "Camarim documents deletable by team or manager"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'camarim-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR (has_permission(auth.uid(), 'camarim_team'::text) AND owner = auth.uid())
    OR has_permission(auth.uid(), 'camarim_manage'::text)
  )
);