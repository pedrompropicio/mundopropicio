-- Corrigir permissões da tabela de metadados dos anexos do Camarim.
-- O upload para o bucket já permite camarim_manage; faltava permitir o INSERT/DELETE
-- correspondente em public.camarim_item_documents para editores/gestores do Camarim.

DROP POLICY IF EXISTS "Camarim item documents insert by team" ON public.camarim_item_documents;
CREATE POLICY "Camarim item documents insert by team or manager"
ON public.camarim_item_documents
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR (
    public.has_permission(auth.uid(), 'camarim_manage'::text)
    AND EXISTS (
      SELECT 1
      FROM public.camarim_items it
      JOIN public.camarim_sessions s ON s.id = it.session_id
      WHERE it.id = camarim_item_documents.item_id
        AND it.status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_review'::text, 'approved'::text, 'split'::text])
        AND s.status IN ('open', 'in_review')
    )
  )
  OR (
    public.has_permission(auth.uid(), 'camarim_team'::text)
    AND EXISTS (
      SELECT 1
      FROM public.camarim_items it
      JOIN public.camarim_sessions s ON s.id = it.session_id
      WHERE it.id = camarim_item_documents.item_id
        AND it.created_by = auth.uid()
        AND it.status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_review'::text])
        AND s.status IN ('open', 'in_review')
    )
  )
);

DROP POLICY IF EXISTS "Camarim item documents delete by team" ON public.camarim_item_documents;
CREATE POLICY "Camarim item documents delete by team or manager"
ON public.camarim_item_documents
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR (
    public.has_permission(auth.uid(), 'camarim_manage'::text)
    AND EXISTS (
      SELECT 1
      FROM public.camarim_items it
      JOIN public.camarim_sessions s ON s.id = it.session_id
      WHERE it.id = camarim_item_documents.item_id
        AND it.status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_review'::text, 'approved'::text, 'split'::text])
        AND s.status IN ('open', 'in_review')
    )
  )
  OR (
    public.has_permission(auth.uid(), 'camarim_team'::text)
    AND EXISTS (
      SELECT 1
      FROM public.camarim_items it
      JOIN public.camarim_sessions s ON s.id = it.session_id
      WHERE it.id = camarim_item_documents.item_id
        AND it.created_by = auth.uid()
        AND it.status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_review'::text])
        AND s.status IN ('open', 'in_review')
    )
  )
);