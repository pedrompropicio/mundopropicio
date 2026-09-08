CREATE TABLE public.onebox_daily_sales (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  sale_date date NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX onebox_daily_sales_event_date_unique ON public.onebox_daily_sales USING btree (event_id, sale_date);
CREATE INDEX onebox_daily_sales_event_date_idx ON public.onebox_daily_sales USING btree (event_id, sale_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onebox_daily_sales TO authenticated;
GRANT ALL ON public.onebox_daily_sales TO service_role;

ALTER TABLE public.onebox_daily_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY onebox_daily_sales_select_company
  ON public.onebox_daily_sales
  FOR SELECT TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY onebox_daily_sales_modify_admin_manager_editor
  ON public.onebox_daily_sales
  FOR ALL TO authenticated
  USING (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'manager'::app_role)
      OR has_role(auth.uid(),'editor'::app_role)
      OR has_role(auth.uid(),'platform_admin'::app_role))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'manager'::app_role)
      OR has_role(auth.uid(),'editor'::app_role)
      OR has_role(auth.uid(),'platform_admin'::app_role))
  );

CREATE TABLE public.onebox_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL,
  mode text NOT NULL,
  triggered_by text,
  error_message text,
  import_audit jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onebox_sync_runs_started ON public.onebox_sync_runs USING btree (started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onebox_sync_runs TO authenticated;
GRANT ALL ON public.onebox_sync_runs TO service_role;

ALTER TABLE public.onebox_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY onebox_sync_runs_select_company
  ON public.onebox_sync_runs
  FOR SELECT TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY onebox_sync_runs_modify_admin_manager_editor
  ON public.onebox_sync_runs
  FOR ALL TO authenticated
  USING (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'manager'::app_role)
      OR has_role(auth.uid(),'editor'::app_role)
      OR has_role(auth.uid(),'platform_admin'::app_role))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin'::app_role)
      OR has_role(auth.uid(),'manager'::app_role)
      OR has_role(auth.uid(),'editor'::app_role)
      OR has_role(auth.uid(),'platform_admin'::app_role))
  );