CREATE TABLE public.bol_sync_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  bol_event_id text NOT NULL,
  organization_name text NOT NULL DEFAULT 'BOL',
  vault_secret_name text NOT NULL DEFAULT 'bol_master',
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.bol_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id uuid REFERENCES public.bol_sync_config(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'started',
  mode text NOT NULL DEFAULT 'manual',
  triggered_by text,
  error_message text,
  files_downloaded jsonb,
  import_audit jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bol_sync_config_company ON public.bol_sync_config(company_id);
CREATE INDEX idx_bol_sync_runs_config ON public.bol_sync_runs(config_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bol_sync_config TO authenticated;
GRANT ALL ON public.bol_sync_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bol_sync_runs TO authenticated;
GRANT ALL ON public.bol_sync_runs TO service_role;

ALTER TABLE public.bol_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bol_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY bol_sync_config_select_company ON public.bol_sync_config
  FOR SELECT TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY bol_sync_config_modify_admin_manager_editor ON public.bol_sync_config
  FOR ALL TO authenticated
  USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role)))
  WITH CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role)));

CREATE POLICY bol_sync_runs_select_company ON public.bol_sync_runs
  FOR SELECT TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY bol_sync_runs_modify_admin_manager_editor ON public.bol_sync_runs
  FOR ALL TO authenticated
  USING ((company_id = current_company_id()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role)))
  WITH CHECK ((company_id = current_company_id()) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'editor'::app_role) OR has_role(auth.uid(), 'platform_admin'::app_role)));

CREATE TRIGGER update_bol_sync_config_updated_at
  BEFORE UPDATE ON public.bol_sync_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.bol_sync_config (company_id, event_id, bol_event_id, organization_name, vault_secret_name, enabled) VALUES
  ('7c858982-6ccd-47ca-bd65-e0dd3eebf01c', 'b7e0407d-0b16-4c95-91a4-8c1d6b333c26', '178134', 'BOL — Deive Leonardo Lisboa', 'bol_master', true),
  ('7c858982-6ccd-47ca-bd65-e0dd3eebf01c', '5531f819-af0d-4e8a-a36d-c460f72aaa90', '178165', 'BOL — Conferência de Mulheres Plenitude', 'bol_master', true),
  ('7c858982-6ccd-47ca-bd65-e0dd3eebf01c', '8cefe488-30ad-4484-9ba3-9b4ad90fd989', '181437', 'BOL — RG Santa Maria da Feira', 'bol_master', true);