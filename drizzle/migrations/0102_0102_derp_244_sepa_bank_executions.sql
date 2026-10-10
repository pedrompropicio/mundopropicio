-- D-ERP244 / #37 ponto 3: retorno do banco por linha da lista SEPA.
-- A sugestão é calculada no ecrã; esta tabela só guarda o que um humano CONFIRMOU.
-- Nunca altera transactions (status/paid_amount) nem bank_statement_lines.
CREATE TABLE public.payment_list_bank_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_list_id uuid NOT NULL REFERENCES public.payment_lists(id) ON DELETE CASCADE,
  sepa_export_id uuid NOT NULL REFERENCES public.payment_list_sepa_exports(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  bank_statement_line_id uuid NOT NULL,
  match_kind text NOT NULL CHECK (match_kind IN ('lote','linha')),
  confirmed_by uuid NOT NULL DEFAULT auth.uid(),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_list_bank_executions_line_fkey FOREIGN KEY (bank_statement_line_id) REFERENCES public.bank_statement_lines(id) ON DELETE CASCADE,
  UNIQUE (sepa_export_id, transaction_id)
);
CREATE INDEX payment_list_bank_executions_list_idx ON public.payment_list_bank_executions(payment_list_id);
CREATE INDEX payment_list_bank_executions_tx_idx ON public.payment_list_bank_executions(transaction_id);

GRANT SELECT, INSERT, DELETE ON public.payment_list_bank_executions TO authenticated;
GRANT ALL ON public.payment_list_bank_executions TO service_role;
ALTER TABLE public.payment_list_bank_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_isolation_payment_list_bank_executions ON public.payment_list_bank_executions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id()) WITH CHECK (company_id = public.current_company_id());
CREATE POLICY "Bank executions viewable by authorized users" ON public.payment_list_bank_executions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_permission((SELECT auth.uid()), 'manage_bank_reconciliation'::text));
CREATE POLICY "Bank executions confirmable by authorized users" ON public.payment_list_bank_executions
  FOR INSERT TO authenticated
  WITH CHECK (confirmed_by = (SELECT auth.uid()) AND (public.is_platform_admin((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_permission((SELECT auth.uid()), 'manage_bank_reconciliation'::text)));
CREATE POLICY "Bank executions removable by authorized users" ON public.payment_list_bank_executions
  FOR DELETE TO authenticated
  USING (public.is_platform_admin((SELECT auth.uid())) OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
      OR public.has_role((SELECT auth.uid()), 'manager'::app_role) OR public.has_permission((SELECT auth.uid()), 'manage_bank_reconciliation'::text));

COMMENT ON TABLE public.payment_list_bank_executions IS 'D-ERP244: confirmação humana de que o banco executou a linha da exportação SEPA. Sugestões não se gravam.';