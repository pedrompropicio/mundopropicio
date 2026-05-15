
CREATE TABLE public.fever_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  vault_secret_name TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  venue_id TEXT NOT NULL,
  city_id TEXT NOT NULL,
  organization_name TEXT NOT NULL DEFAULT 'Cloudscape Eventos',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id)
);

ALTER TABLE public.fever_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fever_sync_config_select_company"
  ON public.fever_sync_config FOR SELECT TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY "fever_sync_config_modify_admin_manager_editor"
  ON public.fever_sync_config FOR ALL TO authenticated
  USING (company_id = current_company_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'editor') OR has_role(auth.uid(),'platform_admin')))
  WITH CHECK (company_id = current_company_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'editor') OR has_role(auth.uid(),'platform_admin')));

CREATE TRIGGER fever_sync_config_set_updated_at
  BEFORE UPDATE ON public.fever_sync_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.fever_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES public.fever_sync_config(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  triggered_by TEXT,
  error_message TEXT,
  files_downloaded JSONB,
  import_audit JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fever_sync_runs_config ON public.fever_sync_runs(config_id, started_at DESC);

ALTER TABLE public.fever_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fever_sync_runs_select_company"
  ON public.fever_sync_runs FOR SELECT TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY "fever_sync_runs_modify_admin_manager_editor"
  ON public.fever_sync_runs FOR ALL TO authenticated
  USING (company_id = current_company_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'editor') OR has_role(auth.uid(),'platform_admin')))
  WITH CHECK (company_id = current_company_id() AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'editor') OR has_role(auth.uid(),'platform_admin')));

-- Seed condicional: só insere se evento existir nesta DB (Live tem, Test não)
DO $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id FROM public.events WHERE id='5a1da5fb-3115-4ae3-af50-15ce1f869a5c';
  IF v_company_id IS NOT NULL THEN
    INSERT INTO public.fever_sync_config (
      company_id, event_id, vault_secret_name, plan_id, venue_id, city_id,
      organization_name, enabled
    ) VALUES (
      v_company_id,
      '5a1da5fb-3115-4ae3-af50-15ce1f869a5c',
      'fever_credentials_coala_2026',
      '521674','108130','1011739','Cloudscape Eventos', false
    )
    ON CONFLICT (event_id) DO NOTHING;
  END IF;
END $$;
