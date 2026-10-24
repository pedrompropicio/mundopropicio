-- Revisão: https://github.com/pedrompropicio/mundopropicio/issues/352#issuecomment-6387254548
-- Versão: 20260814221539; original SHA256: a909bd3f34cd317d991f5556f23e518f185baf9cdef6ff350e5159171d998eb4
-- só DDL; remover INSERT operacional
-- Prova: versão no ledger Live; SELECT 2026-10-24 17:58:41.361067+00: linhas=3
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
