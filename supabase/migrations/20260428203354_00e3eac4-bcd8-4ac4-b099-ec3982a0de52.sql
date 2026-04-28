
-- Camarim items: restringir policies de "team" e "session members" a sessões 'open' apenas
DROP POLICY IF EXISTS "Camarim items insert by team permission" ON public.camarim_items;
CREATE POLICY "Camarim items insert by team permission"
ON public.camarim_items
FOR INSERT
WITH CHECK (
  has_permission(auth.uid(), 'camarim_team'::text)
  AND EXISTS (
    SELECT 1 FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status = 'open'
  )
);

DROP POLICY IF EXISTS "Camarim items insert by session members" ON public.camarim_items;
CREATE POLICY "Camarim items insert by session members"
ON public.camarim_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status = 'open'
      AND (s.responsible_profile_id = auth.uid() OR s.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Camarim items update own by team" ON public.camarim_items;
CREATE POLICY "Camarim items update own by team"
ON public.camarim_items
FOR UPDATE
USING (
  created_by = auth.uid()
  AND status = ANY (ARRAY['draft','submitted','pending_review','split'])
  AND has_permission(auth.uid(), 'camarim_team'::text)
  AND EXISTS (
    SELECT 1 FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status = 'open'
  )
)
WITH CHECK (
  created_by = auth.uid()
  AND status = ANY (ARRAY['draft','submitted','pending_review','split'])
);

DROP POLICY IF EXISTS "Camarim items update by session members" ON public.camarim_items;
CREATE POLICY "Camarim items update by session members"
ON public.camarim_items
FOR UPDATE
USING (
  status = ANY (ARRAY['draft','submitted','pending_review','split'])
  AND EXISTS (
    SELECT 1 FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status = 'open'
      AND (s.responsible_profile_id = auth.uid()
           OR s.created_by = auth.uid()
           OR camarim_items.created_by = auth.uid())
  )
)
WITH CHECK (
  status = ANY (ARRAY['draft','submitted','pending_review','split'])
  AND EXISTS (
    SELECT 1 FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status = 'open'
      AND (s.responsible_profile_id = auth.uid()
           OR s.created_by = auth.uid()
           OR camarim_items.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "Camarim items delete own by team" ON public.camarim_items;
CREATE POLICY "Camarim items delete own by team"
ON public.camarim_items
FOR DELETE
USING (
  created_by = auth.uid()
  AND status = ANY (ARRAY['draft','submitted','pending_review'])
  AND has_permission(auth.uid(), 'camarim_team'::text)
  AND EXISTS (
    SELECT 1 FROM public.camarim_sessions s
    WHERE s.id = camarim_items.session_id
      AND s.status = 'open'
  )
);
