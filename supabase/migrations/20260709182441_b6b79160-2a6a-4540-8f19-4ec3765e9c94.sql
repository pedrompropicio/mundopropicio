-- =====================================================================
-- Card Sessions — Fase 2: RLS holder + storage card-documents
-- =====================================================================

-- 1) RLS holder para card_session_items (produtor submete / edita / apaga os seus)
CREATE POLICY card_session_items_holder_insert ON public.card_session_items
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND status = 'submitted'
    AND EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id = card_session_items.session_id
        AND s.status = 'open'
        AND s.holder_profile_id = auth.uid()
    )
  );

CREATE POLICY card_session_items_holder_update ON public.card_session_items
  FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid()
    AND status = 'submitted'
    AND EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id = card_session_items.session_id
        AND s.status = 'open'
        AND s.holder_profile_id = auth.uid()
    )
  )
  WITH CHECK (
    submitted_by = auth.uid()
    AND status = 'submitted'
  );

CREATE POLICY card_session_items_holder_delete ON public.card_session_items
  FOR DELETE TO authenticated
  USING (
    submitted_by = auth.uid()
    AND status = 'submitted'
    AND EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id = card_session_items.session_id
        AND s.status = 'open'
        AND s.holder_profile_id = auth.uid()
    )
  );

-- 2) Storage policies para bucket 'card-documents' (privado, já criado)
--    Path pattern: {sessionId}/{itemId}/{ts}.{ext}
--    Acesso: can_manage_cards OU holder da sessão do 1º segmento do path

CREATE POLICY "Card docs select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'card-documents' AND (
    public.can_manage_cards(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND s.holder_profile_id = auth.uid()
    )
  )
);

CREATE POLICY "Card docs insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'card-documents' AND (
    public.can_manage_cards(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND s.status = 'open'
        AND s.holder_profile_id = auth.uid()
    )
  )
);

CREATE POLICY "Card docs update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'card-documents' AND (
    public.can_manage_cards(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND s.status = 'open'
        AND s.holder_profile_id = auth.uid()
    )
  )
)
WITH CHECK (
  bucket_id = 'card-documents' AND (
    public.can_manage_cards(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND s.status = 'open'
        AND s.holder_profile_id = auth.uid()
    )
  )
);

CREATE POLICY "Card docs delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'card-documents' AND (
    public.can_manage_cards(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id::text = (storage.foldername(name))[1]
        AND s.status = 'open'
        AND s.holder_profile_id = auth.uid()
    )
  )
);
