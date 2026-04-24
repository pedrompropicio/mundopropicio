-- Permitir membros com permissão camarim_team ver e fazer upload de documentos
DROP POLICY IF EXISTS "Camarim documents viewable by authenticated" ON storage.objects;
CREATE POLICY "Camarim documents viewable by authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'camarim-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_permission(auth.uid(), 'camarim_team')
  )
);

DROP POLICY IF EXISTS "Camarim documents insertable by admin or manager" ON storage.objects;
CREATE POLICY "Camarim documents insertable by team or manager"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'camarim-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_permission(auth.uid(), 'camarim_team')
  )
);

DROP POLICY IF EXISTS "Camarim documents updatable by admin or manager" ON storage.objects;
CREATE POLICY "Camarim documents updatable by team or manager"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'camarim-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR (has_permission(auth.uid(), 'camarim_team') AND owner = auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'camarim-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR (has_permission(auth.uid(), 'camarim_team') AND owner = auth.uid())
  )
);

DROP POLICY IF EXISTS "Camarim documents deletable by admin or manager" ON storage.objects;
CREATE POLICY "Camarim documents deletable by team or manager"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'camarim-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR (has_permission(auth.uid(), 'camarim_team') AND owner = auth.uid())
  )
);