-- Permitir que a equipa do camarim e membros da sessão marquem itens como 'split'
-- ao dividir um talão misto. A transição submitted→split é parte do fluxo de divisão.

DROP POLICY IF EXISTS "Camarim items update own by team" ON public.camarim_items;
CREATE POLICY "Camarim items update own by team"
ON public.camarim_items
FOR UPDATE
USING (
  (created_by = auth.uid())
  AND (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_review'::text, 'split'::text]))
  AND has_permission(auth.uid(), 'camarim_team'::text)
  AND (EXISTS (
    SELECT 1 FROM camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status = ANY (ARRAY['open'::text, 'in_review'::text])
  ))
)
WITH CHECK (
  (created_by = auth.uid())
  AND (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_review'::text, 'split'::text]))
);

DROP POLICY IF EXISTS "Camarim items update by session members" ON public.camarim_items;
CREATE POLICY "Camarim items update by session members"
ON public.camarim_items
FOR UPDATE
USING (
  (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_review'::text, 'split'::text]))
  AND (EXISTS (
    SELECT 1 FROM camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status = ANY (ARRAY['open'::text, 'in_review'::text])
      AND (s.responsible_profile_id = auth.uid()
           OR s.created_by = auth.uid()
           OR camarim_items.created_by = auth.uid())
  ))
)
WITH CHECK (
  (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'pending_review'::text, 'split'::text]))
  AND (EXISTS (
    SELECT 1 FROM camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status = ANY (ARRAY['open'::text, 'in_review'::text])
      AND (s.responsible_profile_id = auth.uid()
           OR s.created_by = auth.uid()
           OR camarim_items.created_by = auth.uid())
  ))
);