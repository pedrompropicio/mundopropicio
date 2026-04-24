-- UPDATE alargado: equipa pode editar o próprio item enquanto sessão está aberta/in_review
-- e o item ainda não foi aprovado/rejeitado/integrado.
DROP POLICY IF EXISTS "Camarim items update own by team" ON public.camarim_items;
CREATE POLICY "Camarim items update own by team"
ON public.camarim_items
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  AND status = ANY (ARRAY['draft','submitted','pending_review'])
  AND public.has_permission(auth.uid(), 'camarim_team')
  AND EXISTS (
    SELECT 1 FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status IN ('open','in_review')
  )
)
WITH CHECK (
  created_by = auth.uid()
  AND status = ANY (ARRAY['draft','submitted','pending_review'])
);

-- DELETE: equipa pode eliminar os próprios lançamentos enquanto sessão aberta/in_review
-- e o item ainda não foi aprovado/integrado.
DROP POLICY IF EXISTS "Camarim items delete own by team" ON public.camarim_items;
CREATE POLICY "Camarim items delete own by team"
ON public.camarim_items
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  AND status = ANY (ARRAY['draft','submitted','pending_review'])
  AND public.has_permission(auth.uid(), 'camarim_team')
  AND EXISTS (
    SELECT 1 FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status IN ('open','in_review')
  )
);

-- Documentos do item: equipa pode inserir/eliminar enquanto pode editar o próprio item.
DROP POLICY IF EXISTS "Camarim item documents insert by team" ON public.camarim_item_documents;
CREATE POLICY "Camarim item documents insert by team"
ON public.camarim_item_documents
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_permission(auth.uid(), 'camarim_team')
  AND EXISTS (
    SELECT 1
    FROM public.camarim_items it
    JOIN public.camarim_sessions s ON s.id = it.session_id
    WHERE it.id = camarim_item_documents.item_id
      AND it.created_by = auth.uid()
      AND it.status = ANY (ARRAY['draft','submitted','pending_review'])
      AND s.status IN ('open','in_review')
  )
);

DROP POLICY IF EXISTS "Camarim item documents delete by team" ON public.camarim_item_documents;
CREATE POLICY "Camarim item documents delete by team"
ON public.camarim_item_documents
FOR DELETE
TO authenticated
USING (
  public.has_permission(auth.uid(), 'camarim_team')
  AND EXISTS (
    SELECT 1
    FROM public.camarim_items it
    JOIN public.camarim_sessions s ON s.id = it.session_id
    WHERE it.id = camarim_item_documents.item_id
      AND it.created_by = auth.uid()
      AND it.status = ANY (ARRAY['draft','submitted','pending_review'])
      AND s.status IN ('open','in_review')
  )
);