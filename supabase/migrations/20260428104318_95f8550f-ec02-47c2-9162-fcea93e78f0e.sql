ALTER TABLE public.camarim_sessions
  ADD COLUMN IF NOT EXISTS integration_summary jsonb,
  ADD COLUMN IF NOT EXISTS integration_transaction_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.camarim_sessions.integration_summary IS
  'Snapshot do resumo gerado no fecho/integração (totais, grupos, settlement, parqueados, erros).';
COMMENT ON COLUMN public.camarim_sessions.integration_transaction_ids IS
  'IDs das transações consolidadas geradas no fecho (incluindo settlement, se houver).';

ALTER TABLE public.camarim_integrations
  DROP CONSTRAINT IF EXISTS camarim_integrations_status_check;
ALTER TABLE public.camarim_integrations
  ADD CONSTRAINT camarim_integrations_status_check
  CHECK (status = ANY (ARRAY['pending','done','failed','partial']));

DROP POLICY IF EXISTS "Camarim items manageable by admin or manager" ON public.camarim_items;
CREATE POLICY "Camarim items manageable by admin or manager"
  ON public.camarim_items
  FOR ALL
  TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'manager'::app_role)
      OR has_permission(auth.uid(),'camarim_manage'::text))
    AND EXISTS (
      SELECT 1 FROM public.camarim_sessions s
      WHERE s.id = camarim_items.session_id
        AND s.status <> 'integrated'
    )
  )
  WITH CHECK (
    (has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'manager'::app_role)
      OR has_permission(auth.uid(),'camarim_manage'::text))
    AND EXISTS (
      SELECT 1 FROM public.camarim_sessions s
      WHERE s.id = camarim_items.session_id
        AND s.status <> 'integrated'
    )
  );

DROP POLICY IF EXISTS "Camarim fund moves manageable by admin or manager" ON public.camarim_fund_moves;
CREATE POLICY "Camarim fund moves manageable by admin or manager"
  ON public.camarim_fund_moves
  FOR ALL
  TO authenticated
  USING (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.camarim_sessions s
      WHERE s.id = camarim_fund_moves.session_id
        AND s.status <> 'integrated'
    )
  )
  WITH CHECK (
    (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.camarim_sessions s
      WHERE s.id = camarim_fund_moves.session_id
        AND s.status <> 'integrated'
    )
  );

DROP POLICY IF EXISTS "Camarim sessions manageable by admin or manager" ON public.camarim_sessions;
CREATE POLICY "Camarim sessions manageable by admin or manager"
  ON public.camarim_sessions
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR (
      (has_role(auth.uid(),'manager'::app_role)
        OR has_permission(auth.uid(),'camarim_manage'::text))
      AND status <> 'integrated'
    )
  )
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR (
      (has_role(auth.uid(),'manager'::app_role)
        OR has_permission(auth.uid(),'camarim_manage'::text))
      AND status <> 'integrated'
    )
  );