CREATE TABLE public.bank_statements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL DEFAULT current_company_id(),
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text,
  period_from date,
  period_to date,
  opening_balance numeric,
  closing_balance numeric,
  n_lines integer NOT NULL DEFAULT 0,
  imported_by text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'imported'
);

CREATE TABLE public.bank_statement_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL DEFAULT current_company_id(),
  statement_id uuid NOT NULL REFERENCES public.bank_statements(id) ON DELETE CASCADE,
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  booking_date date NOT NULL,
  value_date date,
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL,
  balance_after numeric,
  raw jsonb,
  line_hash text NOT NULL,
  status text NOT NULL DEFAULT 'unmatched',
  matched_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  matched_payment_list_id uuid REFERENCES public.payment_lists(id) ON DELETE SET NULL,
  matched_sepa_export_id uuid REFERENCES public.payment_list_sepa_exports(id) ON DELETE SET NULL,
  created_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  matched_by text,
  matched_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_statement_lines_status_chk CHECK (status IN ('unmatched','matched','ignored')),
  CONSTRAINT bank_statement_lines_hash_uniq UNIQUE (financial_account_id, line_hash)
);

CREATE INDEX idx_bank_statements_account ON public.bank_statements (financial_account_id, period_from);
CREATE INDEX idx_bank_statement_lines_account_date ON public.bank_statement_lines (financial_account_id, booking_date);
CREATE INDEX idx_bank_statement_lines_status ON public.bank_statement_lines (status);
CREATE INDEX idx_bank_statement_lines_statement ON public.bank_statement_lines (statement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statements TO authenticated;
GRANT ALL ON public.bank_statements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_lines TO authenticated;
GRANT ALL ON public.bank_statement_lines TO service_role;

ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_isolation_bank_statements" ON public.bank_statements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY "company_isolation_bank_statement_lines" ON public.bank_statement_lines
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY "Bank statements viewable by authorized users" ON public.bank_statements
  FOR SELECT TO authenticated
  USING (
    is_platform_admin(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.financial_account_access faa
      WHERE faa.account_id = bank_statements.financial_account_id AND faa.user_id = auth.uid()
    )
  );

CREATE POLICY "Bank statements manageable by admin and manager" ON public.bank_statements
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Bank statement lines viewable by authorized users" ON public.bank_statement_lines
  FOR SELECT TO authenticated
  USING (
    is_platform_admin(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.financial_account_access faa
      WHERE faa.account_id = bank_statement_lines.financial_account_id AND faa.user_id = auth.uid()
    )
  );

CREATE POLICY "Bank statement lines manageable by admin and manager" ON public.bank_statement_lines
  FOR ALL TO authenticated
  USING (is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (is_platform_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

INSERT INTO public.role_permissions (role, permission)
VALUES ('admin'::app_role, 'manage_bank_reconciliation'), ('manager'::app_role, 'manage_bank_reconciliation')
ON CONFLICT DO NOTHING;