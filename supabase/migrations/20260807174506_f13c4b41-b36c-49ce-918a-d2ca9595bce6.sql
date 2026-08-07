CREATE TABLE public.payment_list_sepa_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_list_id uuid NOT NULL REFERENCES public.payment_lists(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  exported_by text NOT NULL DEFAULT 'sistema',
  exported_at timestamptz NOT NULL DEFAULT now(),
  file_name text NOT NULL,
  msg_id text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  n_transactions integer NOT NULL DEFAULT 0,
  transaction_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
);

CREATE INDEX payment_list_sepa_exports_list_idx ON public.payment_list_sepa_exports(payment_list_id, exported_at DESC);
CREATE INDEX payment_list_sepa_exports_company_idx ON public.payment_list_sepa_exports(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_list_sepa_exports TO authenticated;
GRANT ALL ON public.payment_list_sepa_exports TO service_role;

ALTER TABLE public.payment_list_sepa_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sepa exports viewable by authenticated" ON public.payment_list_sepa_exports
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Sepa exports insertable by privileged roles" ON public.payment_list_sepa_exports
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Sepa exports updatable by admin or manager" ON public.payment_list_sepa_exports
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Sepa exports deletable by admin or manager" ON public.payment_list_sepa_exports
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "company_isolation_payment_list_sepa_exports" ON public.payment_list_sepa_exports
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE TABLE public.payment_list_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_list_id uuid NOT NULL REFERENCES public.payment_lists(id) ON DELETE CASCADE,
  company_id uuid NOT NULL DEFAULT current_company_id() REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  doc_type text NOT NULL DEFAULT 'comprovativo',
  uploaded_by text NOT NULL DEFAULT 'sistema',
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_list_documents_list_idx ON public.payment_list_documents(payment_list_id, uploaded_at DESC);
CREATE INDEX payment_list_documents_company_idx ON public.payment_list_documents(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_list_documents TO authenticated;
GRANT ALL ON public.payment_list_documents TO service_role;

ALTER TABLE public.payment_list_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payment list documents viewable by authenticated" ON public.payment_list_documents
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "Payment list documents insertable by privileged roles" ON public.payment_list_documents
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role));
CREATE POLICY "Payment list documents updatable by admin or manager" ON public.payment_list_documents
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "Payment list documents deletable by admin or manager" ON public.payment_list_documents
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));
CREATE POLICY "company_isolation_payment_list_documents" ON public.payment_list_documents
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());