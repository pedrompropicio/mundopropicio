
-- 1) Coluna events.ticketline_event_id
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS ticketline_event_id text;

-- 2) ticketline_sync_config
CREATE TABLE IF NOT EXISTS public.ticketline_sync_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id uuid NOT NULL UNIQUE REFERENCES public.events(id) ON DELETE CASCADE,
  vault_secret_name text NOT NULL,
  ticketline_event_id text NOT NULL,
  organization_name text NOT NULL DEFAULT 'Ticketline',
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticketline_sync_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticketline_sync_config_select_company" ON public.ticketline_sync_config
  FOR SELECT TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY "ticketline_sync_config_modify_admin_manager_editor" ON public.ticketline_sync_config
  TO authenticated
  USING (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)
      OR has_role(auth.uid(),'editor'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)
      OR has_role(auth.uid(),'editor'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role))
  );

CREATE TRIGGER ticketline_sync_config_set_updated_at
  BEFORE UPDATE ON public.ticketline_sync_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) ticketline_sync_runs
CREATE TABLE IF NOT EXISTS public.ticketline_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.ticketline_sync_config(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL,
  mode text NOT NULL,
  triggered_by text,
  error_message text,
  files_downloaded jsonb,
  import_audit jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticketline_sync_runs_config
  ON public.ticketline_sync_runs(config_id, started_at DESC);

ALTER TABLE public.ticketline_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticketline_sync_runs_select_company" ON public.ticketline_sync_runs
  FOR SELECT TO authenticated
  USING (company_id = current_company_id());

CREATE POLICY "ticketline_sync_runs_modify_admin_manager_editor" ON public.ticketline_sync_runs
  TO authenticated
  USING (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)
      OR has_role(auth.uid(),'editor'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role))
  )
  WITH CHECK (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)
      OR has_role(auth.uid(),'editor'::app_role) OR has_role(auth.uid(),'platform_admin'::app_role))
  );

-- Trigger de notificação igual ao Fever (se a função existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='notify_sync_action_needed') THEN
    EXECUTE 'CREATE TRIGGER trg_notify_sync_action_ticketline
      AFTER INSERT OR UPDATE OF status ON public.ticketline_sync_runs
      FOR EACH ROW EXECUTE FUNCTION public.notify_sync_action_needed()';
  END IF;
END$$;
