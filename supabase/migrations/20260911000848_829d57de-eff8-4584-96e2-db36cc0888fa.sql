INSERT INTO public.role_permissions (role, permission)
SELECT r, 'view_confidential' FROM (VALUES ('admin'::app_role), ('accountant'::app_role)) v(r)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp WHERE rp.role = v.r AND rp.permission = 'view_confidential'
);

ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS is_restricted boolean NOT NULL DEFAULT false;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_confidential boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_is_confidential
  ON public.transactions (is_confidential) WHERE is_confidential;

CREATE OR REPLACE FUNCTION public.can_see_confidential(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user)
      OR public.has_role(_user, 'admin'::app_role)
      OR public.has_permission(_user, 'view_confidential');
$$;

REVOKE EXECUTE ON FUNCTION public.can_see_confidential(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_see_confidential(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Financial accounts viewable by authorized users" ON public.financial_accounts;
CREATE POLICY "Financial accounts viewable by authorized users"
ON public.financial_accounts FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR (
    company_id = public.current_company_id()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.can_see_confidential(auth.uid())
      OR (COALESCE(is_restricted, false) = false AND public.has_role(auth.uid(), 'manager'::app_role))
      OR EXISTS (
        SELECT 1 FROM public.financial_account_access faa
        WHERE faa.account_id = financial_accounts.id AND faa.user_id = auth.uid()
      )
    )
  )
);

DROP POLICY IF EXISTS transactions_confidential_guard ON public.transactions;
CREATE POLICY transactions_confidential_guard
ON public.transactions AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.can_see_confidential(auth.uid())
  OR (
    COALESCE(is_confidential, false) = false
    AND (account_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.financial_accounts a
      WHERE a.id = transactions.account_id AND a.is_restricted
    ))
  )
);