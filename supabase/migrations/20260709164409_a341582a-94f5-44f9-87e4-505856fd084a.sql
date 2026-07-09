-- =====================================================================
-- Card Sessions (Sessões de Cartão) — Fase 1
-- =====================================================================

-- 1) card_sessions
CREATE TABLE public.card_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  card_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  holder_profile_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  holder_name TEXT NOT NULL,
  primary_event_id UUID NULL REFERENCES public.events(id) ON DELETE SET NULL,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ NULL,
  closed_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  closing_balance_confirmed NUMERIC NULL,
  closing_summary JSONB NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_card_sessions_company ON public.card_sessions(company_id);
CREATE INDEX idx_card_sessions_card ON public.card_sessions(card_account_id);
CREATE INDEX idx_card_sessions_status ON public.card_sessions(status);
CREATE UNIQUE INDEX ux_card_sessions_active_per_card
  ON public.card_sessions(card_account_id)
  WHERE status <> 'closed';

CREATE TRIGGER trg_card_sessions_updated_at
BEFORE UPDATE ON public.card_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) card_session_loads
CREATE TABLE public.card_session_loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  session_id UUID NOT NULL REFERENCES public.card_sessions(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  load_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source_account_id UUID NULL REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  out_transaction_id UUID NULL REFERENCES public.transactions(id) ON DELETE SET NULL,
  in_transaction_id UUID NULL REFERENCES public.transactions(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_card_session_loads_session ON public.card_session_loads(session_id);
CREATE INDEX idx_card_session_loads_company ON public.card_session_loads(company_id);

-- 3) card_session_items (espelho do camarim para Fase 2)
CREATE TABLE public.card_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id),
  session_id UUID NOT NULL REFERENCES public.card_sessions(id) ON DELETE CASCADE,
  submitted_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  item_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_name TEXT NULL,
  description TEXT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  iva_rate NUMERIC NOT NULL DEFAULT 0,
  event_id UUID NULL REFERENCES public.events(id) ON DELETE SET NULL,
  category_id UUID NULL REFERENCES public.account_categories(id) ON DELETE SET NULL,
  document_path TEXT NULL,
  ocr_raw_payload JSONB NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  rejection_reason TEXT NULL,
  transaction_id UUID NULL UNIQUE REFERENCES public.transactions(id) ON DELETE SET NULL,
  reviewed_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_card_session_items_session ON public.card_session_items(session_id);
CREATE INDEX idx_card_session_items_status ON public.card_session_items(status);
CREATE INDEX idx_card_session_items_company ON public.card_session_items(company_id);

CREATE TRIGGER trg_card_session_items_updated_at
BEFORE UPDATE ON public.card_session_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) carimbo em transactions
ALTER TABLE public.transactions
  ADD COLUMN card_session_id UUID NULL REFERENCES public.card_sessions(id) ON DELETE SET NULL;
CREATE INDEX idx_transactions_card_session ON public.transactions(card_session_id) WHERE card_session_id IS NOT NULL;

-- =====================================================================
-- GRANTS
-- =====================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_sessions TO authenticated;
GRANT ALL ON public.card_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_session_loads TO authenticated;
GRANT ALL ON public.card_session_loads TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_session_items TO authenticated;
GRANT ALL ON public.card_session_items TO service_role;

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.card_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_session_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_session_items ENABLE ROW LEVEL SECURITY;

-- Helper inline: quem pode gerir cartões
-- (admin/manager OU permissão card_manage no user_permissions)
CREATE OR REPLACE FUNCTION public.can_manage_cards(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'platform_admin'::app_role)
    OR public.has_role(_user_id, 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions
      WHERE user_id = _user_id AND permission = 'card_manage' AND granted = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_cards(uuid) TO authenticated;

-- SELECT — qualquer autenticado da company
CREATE POLICY card_sessions_select ON public.card_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY card_sessions_write ON public.card_sessions
  FOR ALL TO authenticated
  USING (
    public.can_manage_cards(auth.uid())
    AND (status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role))
  )
  WITH CHECK (
    public.can_manage_cards(auth.uid())
    AND (status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role))
  );

CREATE POLICY card_sessions_company_isolation ON public.card_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

-- loads
CREATE POLICY card_session_loads_select ON public.card_session_loads
  FOR SELECT TO authenticated USING (true);

CREATE POLICY card_session_loads_write ON public.card_session_loads
  FOR ALL TO authenticated
  USING (
    public.can_manage_cards(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id = card_session_loads.session_id
        AND (s.status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role))
    )
  )
  WITH CHECK (
    public.can_manage_cards(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id = card_session_loads.session_id
        AND (s.status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role))
    )
  );

CREATE POLICY card_session_loads_company_isolation ON public.card_session_loads
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

-- items
CREATE POLICY card_session_items_select ON public.card_session_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY card_session_items_write ON public.card_session_items
  FOR ALL TO authenticated
  USING (
    public.can_manage_cards(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id = card_session_items.session_id
        AND (s.status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role))
    )
  )
  WITH CHECK (
    public.can_manage_cards(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.card_sessions s
      WHERE s.id = card_session_items.session_id
        AND (s.status <> 'closed' OR public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'platform_admin'::app_role))
    )
  );

CREATE POLICY card_session_items_company_isolation ON public.card_session_items
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.row_belongs_to_current_company(company_id))
  WITH CHECK (public.row_belongs_to_current_company(company_id));

-- =====================================================================
-- Seed permissões (manager por defeito; admin auto)
-- =====================================================================
INSERT INTO public.role_permissions (role, permission) VALUES
  ('manager'::app_role, 'card_manage'),
  ('manager'::app_role, 'card_team')
ON CONFLICT DO NOTHING;
