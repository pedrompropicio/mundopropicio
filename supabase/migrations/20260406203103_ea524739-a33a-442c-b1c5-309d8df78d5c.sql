
CREATE TABLE public.financial_account_access (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_id)
);

ALTER TABLE public.financial_account_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account access viewable by authenticated"
  ON public.financial_account_access FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Account access manageable by admin"
  ON public.financial_account_access FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Update financial_accounts SELECT policy to filter by access
DROP POLICY IF EXISTS "Financial accounts viewable by authenticated" ON public.financial_accounts;
CREATE POLICY "Financial accounts viewable by authorized users"
  ON public.financial_accounts FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.financial_account_access
      WHERE financial_account_access.account_id = financial_accounts.id
        AND financial_account_access.user_id = auth.uid()
    )
  );
