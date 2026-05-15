
-- Fix multi-tenant leak em financial_accounts: policies legacy não filtravam por empresa
DROP POLICY IF EXISTS "Financial accounts viewable by authorized users" ON public.financial_accounts;
DROP POLICY IF EXISTS "Financial accounts manageable by admin" ON public.financial_accounts;

-- SELECT: admin/manager OU acesso explícito, SEMPRE filtrado por empresa ativa
CREATE POLICY "Financial accounts viewable by authorized users"
ON public.financial_accounts
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.financial_account_access faa
      WHERE faa.account_id = financial_accounts.id
        AND faa.user_id = auth.uid()
    )
  )
);

-- ALL (manage): admin da empresa ativa
CREATE POLICY "Financial accounts manageable by admin"
ON public.financial_accounts
FOR ALL
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.has_role(auth.uid(), 'admin'::app_role)
);
