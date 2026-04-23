-- Permitir que membros operacionais da sessão insiram itens
CREATE POLICY "Camarim items insert by session members"
ON public.camarim_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status IN ('open', 'in_review')
      AND (
        s.responsible_profile_id = auth.uid()
        OR s.created_by = auth.uid()
      )
  )
);

-- Permitir que esses mesmos utilizadores editem os próprios itens enquanto draft/submitted/pending_review
CREATE POLICY "Camarim items update by session members"
ON public.camarim_items
FOR UPDATE
TO authenticated
USING (
  status IN ('draft', 'submitted', 'pending_review')
  AND EXISTS (
    SELECT 1
    FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status IN ('open', 'in_review')
      AND (
        s.responsible_profile_id = auth.uid()
        OR s.created_by = auth.uid()
        OR camarim_items.created_by = auth.uid()
      )
  )
)
WITH CHECK (
  status IN ('draft', 'submitted', 'pending_review')
  AND EXISTS (
    SELECT 1
    FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status IN ('open', 'in_review')
      AND (
        s.responsible_profile_id = auth.uid()
        OR s.created_by = auth.uid()
        OR camarim_items.created_by = auth.uid()
      )
  )
);