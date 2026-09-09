ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS bank_ref text;
CREATE INDEX IF NOT EXISTS idx_bank_statement_lines_bank_ref ON public.bank_statement_lines (statement_id, bank_ref);

DROP POLICY IF EXISTS "Bank statements manageable by admin and manager" ON public.bank_statements;
CREATE POLICY "Bank statements manageable by authorized users"
ON public.bank_statements FOR ALL TO authenticated
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

DROP POLICY IF EXISTS "Bank statement lines manageable by admin and manager" ON public.bank_statement_lines;
CREATE POLICY "Bank statement lines manageable by authorized users"
ON public.bank_statement_lines FOR ALL TO authenticated
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

DROP POLICY IF EXISTS "Bank statements viewable by authorized users" ON public.bank_statements;
CREATE POLICY "Bank statements viewable by authorized users"
ON public.bank_statements FOR SELECT TO authenticated
USING (
  is_platform_admin(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_permission(auth.uid(), 'manage_bank_reconciliation')
  OR EXISTS (
    SELECT 1 FROM public.financial_account_access faa
    WHERE faa.account_id = bank_statements.financial_account_id AND faa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Bank statement lines viewable by authorized users" ON public.bank_statement_lines;
CREATE POLICY "Bank statement lines viewable by authorized users"
ON public.bank_statement_lines FOR SELECT TO authenticated
USING (
  is_platform_admin(auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_permission(auth.uid(), 'manage_bank_reconciliation')
  OR EXISTS (
    SELECT 1 FROM public.financial_account_access faa
    WHERE faa.account_id = bank_statement_lines.financial_account_id AND faa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS bank_statements_storage_select ON storage.objects;
CREATE POLICY bank_statements_storage_select ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'bank-statements'
  AND (storage.foldername(name))[1] = (current_company_id())::text
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role)
    OR has_permission(auth.uid(), 'manage_bank_reconciliation')
  )
);

DROP POLICY IF EXISTS bank_statements_storage_insert ON storage.objects;
CREATE POLICY bank_statements_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'bank-statements'
  AND (storage.foldername(name))[1] = (current_company_id())::text
  AND (
    has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role)
    OR has_permission(auth.uid(), 'manage_bank_reconciliation')
  )
);

DROP POLICY IF EXISTS bank_statements_storage_delete ON storage.objects;
CREATE POLICY bank_statements_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'bank-statements'
  AND (storage.foldername(name))[1] = (current_company_id())::text
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);