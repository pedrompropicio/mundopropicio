CREATE TABLE public.camarim_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'single_event',
  status TEXT NOT NULL DEFAULT 'open',
  master_event_id UUID NULL REFERENCES public.events(id) ON DELETE SET NULL,
  responsible_profile_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  budget_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  notes TEXT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ NULL,
  integrated_at TIMESTAMPTZ NULL,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT camarim_sessions_mode_check CHECK (mode IN ('single_event', 'tour_consolidated', 'city_session')),
  CONSTRAINT camarim_sessions_status_check CHECK (status IN ('open', 'in_review', 'closed', 'integrated')),
  CONSTRAINT camarim_sessions_currency_check CHECK (char_length(currency) = 3)
);

CREATE TABLE public.camarim_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.camarim_sessions(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, event_id)
);

CREATE TABLE public.camarim_fund_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.camarim_sessions(id) ON DELETE CASCADE,
  event_id UUID NULL REFERENCES public.events(id) ON DELETE SET NULL,
  move_type TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  financial_account_id UUID NULL REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  notes TEXT NULL,
  move_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT camarim_fund_moves_type_check CHECK (move_type IN ('advance', 'cash_reinforcement', 'company_card_use', 'refund_to_company', 'reimbursement_to_buyer', 'manual_adjustment')),
  CONSTRAINT camarim_fund_moves_currency_check CHECK (char_length(currency) = 3)
);

CREATE TABLE public.camarim_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.camarim_sessions(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE RESTRICT,
  supplier_id UUID NULL REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name_raw TEXT NULL,
  document_type TEXT NOT NULL DEFAULT 'invoice',
  document_number TEXT NULL,
  document_date DATE NULL,
  service_description TEXT NULL,
  category_id UUID NULL REFERENCES public.account_categories(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  base_amount NUMERIC NOT NULL DEFAULT 0,
  iva_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  payment_origin TEXT NOT NULL,
  buyer_profile_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ocr_confidence TEXT NULL,
  ocr_raw_payload JSONB NULL,
  status TEXT NOT NULL DEFAULT 'new',
  has_document BOOLEAN NOT NULL DEFAULT true,
  document_issue_reason TEXT NULL,
  needs_accounting_review BOOLEAN NOT NULL DEFAULT false,
  bp_scope TEXT NOT NULL DEFAULT 'local_city',
  bp_forecast_id UUID NULL REFERENCES public.event_forecasts(id) ON DELETE SET NULL,
  integration_mode TEXT NOT NULL DEFAULT 'none',
  transaction_id UUID NULL REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT camarim_items_document_type_check CHECK (document_type IN ('invoice', 'receipt', 'ticket', 'other')),
  CONSTRAINT camarim_items_type_check CHECK (type = 'expense'),
  CONSTRAINT camarim_items_currency_check CHECK (char_length(currency) = 3),
  CONSTRAINT camarim_items_payment_origin_check CHECK (payment_origin IN ('advance', 'company_card', 'out_of_pocket')),
  CONSTRAINT camarim_items_ocr_confidence_check CHECK (ocr_confidence IS NULL OR ocr_confidence IN ('high', 'medium', 'low')),
  CONSTRAINT camarim_items_status_check CHECK (status IN ('new', 'ocr_read', 'pending_review', 'validated', 'issue', 'closed', 'integrated')),
  CONSTRAINT camarim_items_bp_scope_check CHECK (bp_scope IN ('master_common', 'local_city')),
  CONSTRAINT camarim_items_integration_mode_check CHECK (integration_mode IN ('none', 'draft_transaction', 'accounting_only'))
);

CREATE TABLE public.camarim_item_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.camarim_items(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NULL,
  document_source TEXT NOT NULL DEFAULT 'upload',
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT camarim_item_documents_source_check CHECK (document_source IN ('upload', 'camera', 'imported_drive'))
);

CREATE TABLE public.camarim_item_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.camarim_items(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL,
  old_data JSONB NULL,
  new_data JSONB NULL,
  comment TEXT NULL,
  reviewed_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT camarim_item_reviews_type_check CHECK (review_type IN ('ocr_adjustment', 'category_review', 'accounting_review', 'exception_approval'))
);

CREATE TABLE public.camarim_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.camarim_sessions(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  summary_payload JSONB NULL,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT camarim_integrations_type_check CHECK (integration_type IN ('financial_close', 'draft_transactions', 'accounting_export')),
  CONSTRAINT camarim_integrations_status_check CHECK (status IN ('pending', 'done', 'failed'))
);

CREATE INDEX idx_camarim_sessions_master_event_id ON public.camarim_sessions(master_event_id);
CREATE INDEX idx_camarim_sessions_status ON public.camarim_sessions(status);
CREATE INDEX idx_camarim_session_events_session_id ON public.camarim_session_events(session_id);
CREATE INDEX idx_camarim_session_events_event_id ON public.camarim_session_events(event_id);
CREATE INDEX idx_camarim_fund_moves_session_id ON public.camarim_fund_moves(session_id);
CREATE INDEX idx_camarim_fund_moves_event_id ON public.camarim_fund_moves(event_id);
CREATE INDEX idx_camarim_items_session_id ON public.camarim_items(session_id);
CREATE INDEX idx_camarim_items_event_id ON public.camarim_items(event_id);
CREATE INDEX idx_camarim_items_status ON public.camarim_items(status);
CREATE INDEX idx_camarim_items_bp_scope ON public.camarim_items(bp_scope);
CREATE INDEX idx_camarim_items_bp_forecast_id ON public.camarim_items(bp_forecast_id);
CREATE INDEX idx_camarim_item_documents_item_id ON public.camarim_item_documents(item_id);
CREATE INDEX idx_camarim_item_reviews_item_id ON public.camarim_item_reviews(item_id);
CREATE INDEX idx_camarim_integrations_session_id ON public.camarim_integrations(session_id);

ALTER TABLE public.camarim_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camarim_session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camarim_fund_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camarim_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camarim_item_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camarim_item_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camarim_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Camarim sessions viewable by authenticated"
ON public.camarim_sessions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Camarim sessions manageable by admin or manager"
ON public.camarim_sessions
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Camarim session events viewable by authenticated"
ON public.camarim_session_events
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Camarim session events manageable by admin or manager"
ON public.camarim_session_events
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Camarim fund moves viewable by authenticated"
ON public.camarim_fund_moves
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Camarim fund moves manageable by admin or manager"
ON public.camarim_fund_moves
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Camarim items viewable by authenticated"
ON public.camarim_items
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Camarim items manageable by admin or manager"
ON public.camarim_items
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Camarim item documents viewable by authenticated"
ON public.camarim_item_documents
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Camarim item documents manageable by admin or manager"
ON public.camarim_item_documents
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Camarim item reviews viewable by authenticated"
ON public.camarim_item_reviews
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Camarim item reviews manageable by admin or manager"
ON public.camarim_item_reviews
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Camarim integrations viewable by authenticated"
ON public.camarim_integrations
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Camarim integrations manageable by admin or manager"
ON public.camarim_integrations
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_camarim_sessions_updated_at
BEFORE UPDATE ON public.camarim_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_camarim_fund_moves_updated_at
BEFORE UPDATE ON public.camarim_fund_moves
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_camarim_items_updated_at
BEFORE UPDATE ON public.camarim_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('camarim-documents', 'camarim-documents', false);

CREATE POLICY "Camarim documents viewable by authenticated"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'camarim-documents'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Camarim documents insertable by admin or manager"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'camarim-documents'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Camarim documents updatable by admin or manager"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'camarim-documents'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
)
WITH CHECK (
  bucket_id = 'camarim-documents'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Camarim documents deletable by admin or manager"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'camarim-documents'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);