CREATE TABLE public.invoice_group_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  transaction_id uuid,
  invoice_group_id uuid,
  file_url text,
  ref_atual text,
  numero_lido text,
  document_type text,
  confidence text,
  veredicto text,
  aplicado boolean NOT NULL DEFAULT false,
  company_id uuid DEFAULT current_company_id()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_group_audit TO authenticated;
GRANT ALL ON public.invoice_group_audit TO service_role;

ALTER TABLE public.invoice_group_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_group_audit_select ON public.invoice_group_audit
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY invoice_group_audit_insert ON public.invoice_group_audit
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY invoice_group_audit_update ON public.invoice_group_audit
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY invoice_group_audit_delete ON public.invoice_group_audit
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role));

CREATE POLICY company_isolation_invoice_group_audit ON public.invoice_group_audit
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (row_belongs_to_current_company(company_id))
  WITH CHECK (row_belongs_to_current_company(company_id));

CREATE INDEX idx_invoice_group_audit_run_at ON public.invoice_group_audit (run_at DESC);
CREATE INDEX idx_invoice_group_audit_group ON public.invoice_group_audit (invoice_group_id);