DROP POLICY IF EXISTS "Bank line documents viewable by authenticated" ON public.bank_line_documents;

CREATE POLICY "Bank line documents viewable by authorized users"
ON public.bank_line_documents
FOR SELECT
USING (
  is_platform_admin(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_permission(auth.uid(), 'manage_bank_reconciliation'::text)
  OR EXISTS (
    SELECT 1
    FROM public.bank_statement_lines bsl
    JOIN public.financial_account_access faa ON faa.account_id = bsl.financial_account_id
    WHERE bsl.id = bank_line_documents.line_id
      AND faa.user_id = auth.uid()
  )
);

DROP TRIGGER IF EXISTS trg_set_company_id ON public.bank_line_transactions;
CREATE TRIGGER trg_set_company_id
BEFORE INSERT ON public.bank_line_transactions
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_on_insert();