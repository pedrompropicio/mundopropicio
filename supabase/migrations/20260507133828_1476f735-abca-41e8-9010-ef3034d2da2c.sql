-- Coala Drive Sync: tabelas de configuração, runs e estado de linhas

CREATE TABLE IF NOT EXISTS public.coala_sync_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  drive_file_id text NOT NULL,
  file_label text,
  enabled boolean NOT NULL DEFAULT false,
  schedule_cron text NOT NULL DEFAULT '0 5 * * *',
  last_run_at timestamptz,
  last_run_status text,
  notify_whatsapp boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (event_id, drive_file_id)
);

CREATE TABLE IF NOT EXISTS public.coala_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid REFERENCES public.coala_sync_config(id) ON DELETE SET NULL,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('dry_run','apply')),
  triggered_by text NOT NULL CHECK (triggered_by IN ('cron','manual')),
  status text NOT NULL CHECK (status IN ('running','success','failed','blocked','skipped_unchanged')),
  xlsx_sha256 text,
  xlsx_size_bytes integer,
  file_version text,
  total_rows integer DEFAULT 0,
  new_count integer DEFAULT 0,
  updated_count integer DEFAULT 0,
  removed_count integer DEFAULT 0,
  conflict_count integer DEFAULT 0,
  diff jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  triggered_user_id uuid
);
CREATE INDEX IF NOT EXISTS idx_coala_sync_runs_event ON public.coala_sync_runs(event_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_coala_sync_runs_config ON public.coala_sync_runs(config_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.coala_sync_row_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.coala_sync_config(id) ON DELETE CASCADE,
  row_key text NOT NULL,
  last_seen_run_id uuid REFERENCES public.coala_sync_runs(id) ON DELETE SET NULL,
  last_xlsx_payload jsonb NOT NULL,
  forecast_id uuid,
  manual_override boolean NOT NULL DEFAULT false,
  manual_override_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (config_id, row_key)
);
CREATE INDEX IF NOT EXISTS idx_coala_sync_row_state_config ON public.coala_sync_row_state(config_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.coala_sync_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_coala_sync_config_updated ON public.coala_sync_config;
CREATE TRIGGER trg_coala_sync_config_updated BEFORE UPDATE ON public.coala_sync_config
  FOR EACH ROW EXECUTE FUNCTION public.coala_sync_touch_updated_at();

DROP TRIGGER IF EXISTS trg_coala_sync_row_state_updated ON public.coala_sync_row_state;
CREATE TRIGGER trg_coala_sync_row_state_updated BEFORE UPDATE ON public.coala_sync_row_state
  FOR EACH ROW EXECUTE FUNCTION public.coala_sync_touch_updated_at();

-- RLS: só admin/manager (multi-tenant via company_id)
ALTER TABLE public.coala_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coala_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coala_sync_row_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coala_sync_config_select_priv" ON public.coala_sync_config
  FOR SELECT USING (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'platform_admin'))
  );
CREATE POLICY "coala_sync_config_modify_priv" ON public.coala_sync_config
  FOR ALL USING (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'platform_admin'))
  ) WITH CHECK (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'platform_admin'))
  );

CREATE POLICY "coala_sync_runs_select_priv" ON public.coala_sync_runs
  FOR SELECT USING (
    company_id = current_company_id()
    AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'platform_admin'))
  );

CREATE POLICY "coala_sync_row_state_select_priv" ON public.coala_sync_row_state
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.coala_sync_config c
      WHERE c.id = coala_sync_row_state.config_id
        AND c.company_id = current_company_id()
        AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'platform_admin'))
    )
  );
CREATE POLICY "coala_sync_row_state_modify_priv" ON public.coala_sync_row_state
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.coala_sync_config c
      WHERE c.id = coala_sync_row_state.config_id
        AND c.company_id = current_company_id()
        AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'platform_admin'))
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coala_sync_config c
      WHERE c.id = coala_sync_row_state.config_id
        AND c.company_id = current_company_id()
        AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager') OR has_role(auth.uid(),'platform_admin'))
    )
  );