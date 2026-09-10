CREATE TABLE public.bank_line_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL DEFAULT current_company_id(),
  name text NOT NULL,
  pattern text NOT NULL,
  match_type text NOT NULL DEFAULT 'contains',
  direction text NOT NULL DEFAULT 'any',
  amount_min numeric,
  amount_max numeric,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.account_categories(id) ON DELETE SET NULL,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  iva_rate numeric NOT NULL DEFAULT 0,
  description_template text,
  action text NOT NULL DEFAULT 'create_expense',
  target_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  hits integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_line_rules_match_type_chk CHECK (match_type IN ('contains','starts_with','regex')),
  CONSTRAINT bank_line_rules_direction_chk CHECK (direction IN ('debit','credit','any')),
  CONSTRAINT bank_line_rules_action_chk CHECK (action IN ('create_expense','create_income','create_transfer'))
);

CREATE INDEX idx_bank_line_rules_active ON public.bank_line_rules (company_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_line_rules TO authenticated;
GRANT ALL ON public.bank_line_rules TO service_role;

ALTER TABLE public.bank_line_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation_bank_line_rules" ON public.bank_line_rules
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY "Bank line rules viewable by authorized users" ON public.bank_line_rules
  FOR SELECT TO authenticated
  USING (
    is_platform_admin(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_permission(auth.uid(), 'manage_bank_reconciliation')
  );

CREATE POLICY "Bank line rules manageable by authorized users" ON public.bank_line_rules
  FOR ALL TO authenticated
  USING (
    is_platform_admin(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_permission(auth.uid(), 'manage_bank_reconciliation')
  )
  WITH CHECK (
    is_platform_admin(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_permission(auth.uid(), 'manage_bank_reconciliation')
  );

CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_created_tx
  ON public.bank_statement_lines (created_transaction_id);