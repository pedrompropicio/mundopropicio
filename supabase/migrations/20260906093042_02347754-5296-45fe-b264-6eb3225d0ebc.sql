CREATE TABLE public.ads_invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('meta','google')),
  invoice_number text NOT NULL,
  billing_period date NOT NULL,
  issue_date date,
  currency text NOT NULL DEFAULT 'EUR',
  total_amount numeric(14,2) NOT NULL,
  lines_sum numeric(14,2),
  source text NOT NULL CHECK (source IN ('pdf','mirror')),
  source_ref text,
  file_path text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','applied','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, platform, invoice_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_invoice TO authenticated;
GRANT ALL ON public.ads_invoice TO service_role;
ALTER TABLE public.ads_invoice ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_isolation_ads_invoice ON public.ads_invoice
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY ads_invoice_select_privileged_roles ON public.ads_invoice
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY ads_invoice_insert_privileged_roles ON public.ads_invoice
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY ads_invoice_update_privileged_roles ON public.ads_invoice
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY ads_invoice_delete_privileged_roles ON public.ads_invoice
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE INDEX idx_ads_invoice_company_period ON public.ads_invoice (company_id, billing_period);

CREATE TRIGGER update_ads_invoice_updated_at
  BEFORE UPDATE ON public.ads_invoice
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.ads_invoice_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.ads_invoice(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  line_no int NOT NULL,
  raw_description text NOT NULL,
  placement text,
  campaign_name text,
  external_campaign_id text,
  event_id uuid REFERENCES public.events(id),
  match_source text NOT NULL DEFAULT 'none' CHECK (match_source IN ('erp_link','fuzzy','manual','none')),
  amount numeric(14,2) NOT NULL,
  is_adjustment boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_invoice_line TO authenticated;
GRANT ALL ON public.ads_invoice_line TO service_role;
ALTER TABLE public.ads_invoice_line ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_isolation_ads_invoice_line ON public.ads_invoice_line
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

CREATE POLICY ads_invoice_line_select_privileged_roles ON public.ads_invoice_line
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY ads_invoice_line_insert_privileged_roles ON public.ads_invoice_line
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY ads_invoice_line_update_privileged_roles ON public.ads_invoice_line
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY ads_invoice_line_delete_privileged_roles ON public.ads_invoice_line
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'editor'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE INDEX idx_ads_invoice_line_invoice ON public.ads_invoice_line (invoice_id);
CREATE INDEX idx_ads_invoice_line_company_event ON public.ads_invoice_line (company_id, event_id);

CREATE TRIGGER update_ads_invoice_line_updated_at
  BEFORE UPDATE ON public.ads_invoice_line
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage: bucket ads-invoices (mesmo padrão do transaction-documents)
CREATE POLICY "Ads invoices viewable by privileged roles" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ads-invoices'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'platform_admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'editor'::app_role)
      OR public.has_role(auth.uid(), 'accountant'::app_role)
    )
  );

CREATE POLICY "Ads invoices uploadable by privileged roles" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ads-invoices'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'platform_admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'editor'::app_role)
      OR public.has_role(auth.uid(), 'accountant'::app_role)
    )
  );

CREATE POLICY "Ads invoices deletable by privileged roles" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ads-invoices'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'platform_admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'editor'::app_role)
      OR public.has_role(auth.uid(), 'accountant'::app_role)
    )
  );

CREATE POLICY company_isolation_ads_invoices_select ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'ads-invoices' OR public.storage_path_belongs_to_current_company(name));

CREATE POLICY company_isolation_ads_invoices_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id <> 'ads-invoices' OR public.storage_path_belongs_to_current_company(name));

CREATE POLICY company_isolation_ads_invoices_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id <> 'ads-invoices' OR public.storage_path_belongs_to_current_company(name))
  WITH CHECK (bucket_id <> 'ads-invoices' OR public.storage_path_belongs_to_current_company(name));

CREATE POLICY company_isolation_ads_invoices_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id <> 'ads-invoices' OR public.storage_path_belongs_to_current_company(name));