-- ===== D17 — cartão pré-pago no modelo do camarim (aditivo) =====

-- 1) card_session_items: estado 'integrated' + aprovação sem documento
ALTER TABLE public.card_session_items
  DROP CONSTRAINT IF EXISTS card_session_items_status_check;
ALTER TABLE public.card_session_items
  ADD CONSTRAINT card_session_items_status_check
  CHECK (status IN ('submitted','approved','rejected','integrated'));

ALTER TABLE public.card_session_items
  ADD COLUMN IF NOT EXISTS approved_without_document boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_without_document_reason text;

-- 2) card_item_documents — N documentos por item
CREATE TABLE IF NOT EXISTS public.card_item_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.card_session_items(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  uploaded_by uuid REFERENCES public.profiles(id),
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_card_item_documents_item ON public.card_item_documents(item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_item_documents TO authenticated;
GRANT ALL ON public.card_item_documents TO service_role;

ALTER TABLE public.card_item_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_item_documents_select"
  ON public.card_item_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "card_item_documents_company_isolation"
  ON public.card_item_documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE POLICY "card_item_documents_write"
  ON public.card_item_documents FOR ALL TO authenticated
  USING (
    public.can_manage_cards(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.card_session_items i
      JOIN public.card_sessions s ON s.id = i.session_id
      WHERE i.id = card_item_documents.item_id
        AND (s.status <> 'closed'
             OR public.has_role(auth.uid(), 'admin'::app_role)
             OR public.has_role(auth.uid(), 'platform_admin'::app_role))
    )
  )
  WITH CHECK (
    public.can_manage_cards(auth.uid()) AND EXISTS (
      SELECT 1 FROM public.card_session_items i
      JOIN public.card_sessions s ON s.id = i.session_id
      WHERE i.id = card_item_documents.item_id
        AND (s.status <> 'closed'
             OR public.has_role(auth.uid(), 'admin'::app_role)
             OR public.has_role(auth.uid(), 'platform_admin'::app_role))
    )
  );

CREATE POLICY "card_item_documents_holder_insert"
  ON public.card_item_documents FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.card_session_items i
      JOIN public.card_sessions s ON s.id = i.session_id
      WHERE i.id = card_item_documents.item_id
        AND i.submitted_by = auth.uid()
        AND i.status = 'submitted'
        AND s.status = 'open'
        AND s.holder_profile_id = auth.uid()
    )
  );

CREATE POLICY "card_item_documents_holder_delete"
  ON public.card_item_documents FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.card_session_items i
      JOIN public.card_sessions s ON s.id = i.session_id
      WHERE i.id = card_item_documents.item_id
        AND i.submitted_by = auth.uid()
        AND i.status = 'submitted'
        AND s.status = 'open'
        AND s.holder_profile_id = auth.uid()
    )
  );

-- 3) card_sessions: resumo de integração
ALTER TABLE public.card_sessions
  ADD COLUMN IF NOT EXISTS integration_summary jsonb,
  ADD COLUMN IF NOT EXISTS integration_transaction_ids uuid[],
  ADD COLUMN IF NOT EXISTS integrated_at timestamptz,
  ADD COLUMN IF NOT EXISTS integrated_by uuid REFERENCES public.profiles(id);

-- 4) card_integrations — histórico de cada fecho (decalcado de camarim_integrations)
CREATE TABLE IF NOT EXISTS public.card_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.card_sessions(id) ON DELETE CASCADE,
  integration_type text NOT NULL DEFAULT 'financial_close',
  status text NOT NULL DEFAULT 'done',
  created_by uuid REFERENCES public.profiles(id),
  summary_payload jsonb,
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_card_integrations_session ON public.card_integrations(session_id);

GRANT SELECT ON public.card_integrations TO authenticated;
GRANT ALL ON public.card_integrations TO service_role;

ALTER TABLE public.card_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "card_integrations_select"
  ON public.card_integrations FOR SELECT TO authenticated USING (true);

CREATE POLICY "card_integrations_company_isolation"
  ON public.card_integrations AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

COMMENT ON TABLE public.card_item_documents IS 'D17 — N documentos por item de cartão (bucket card-documents).';
COMMENT ON TABLE public.card_integrations IS 'D17 — histórico das integrações (fechos) de sessões de cartão.';