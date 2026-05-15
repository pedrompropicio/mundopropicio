
DROP POLICY IF EXISTS "Financial accounts viewable by authorized users" ON public.financial_accounts;
DROP POLICY IF EXISTS "Financial accounts manageable by admin" ON public.financial_accounts;

CREATE POLICY "Financial accounts viewable by authorized users"
ON public.financial_accounts
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR (
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
  )
);

CREATE POLICY "Financial accounts manageable by admin"
ON public.financial_accounts
FOR ALL
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))
);
