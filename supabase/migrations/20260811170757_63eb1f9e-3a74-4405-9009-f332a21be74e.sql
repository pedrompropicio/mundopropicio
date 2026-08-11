CREATE TABLE public.accountant_transaction_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('conferido','pendente')),
  note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  response_note text,
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_atr_company_status ON public.accountant_transaction_reviews (company_id, status);
CREATE INDEX idx_atr_transaction ON public.accountant_transaction_reviews (transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accountant_transaction_reviews TO authenticated;
GRANT ALL ON public.accountant_transaction_reviews TO service_role;

ALTER TABLE public.accountant_transaction_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews viewable by accountant and staff"
ON public.accountant_transaction_reviews FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'accountant')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'platform_admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'editor')
);

CREATE POLICY "Reviews insertable by accountant and staff"
ON public.accountant_transaction_reviews FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'accountant')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'platform_admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'editor')
);

CREATE POLICY "Reviews updatable by accountant and staff"
ON public.accountant_transaction_reviews FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'accountant')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'platform_admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'editor')
)
WITH CHECK (
  public.has_role(auth.uid(), 'accountant')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'platform_admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'editor')
);

CREATE POLICY "Reviews deletable by admin"
ON public.accountant_transaction_reviews FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'platform_admin')
);

ALTER TABLE public.accountant_transaction_reviews
  ADD CONSTRAINT company_isolation_atr_check CHECK (company_id IS NOT NULL);

CREATE POLICY "company_isolation_accountant_transaction_reviews"
ON public.accountant_transaction_reviews AS RESTRICTIVE FOR ALL TO authenticated
USING (public.row_belongs_to_current_company(company_id))
WITH CHECK (public.row_belongs_to_current_company(company_id));

CREATE TRIGGER update_atr_updated_at
BEFORE UPDATE ON public.accountant_transaction_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();