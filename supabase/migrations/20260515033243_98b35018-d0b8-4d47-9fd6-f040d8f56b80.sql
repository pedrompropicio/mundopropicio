
-- =========================================================
-- COALA SYNC AUTOMATION (Fase B1)
-- =========================================================

-- 1) Audit tables
CREATE TABLE IF NOT EXISTS public.coala_sync_deletes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES public.coala_sync_config(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.coala_sync_runs(id) ON DELETE SET NULL,
  target_table TEXT NOT NULL CHECK (target_table IN ('event_forecasts','transactions')),
  target_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  reason TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coala_sync_deletes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coala_sync_deletes_select ON public.coala_sync_deletes;
CREATE POLICY coala_sync_deletes_select ON public.coala_sync_deletes FOR SELECT
USING (
  public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.coala_sync_config c
    WHERE c.id = coala_sync_deletes.config_id AND c.company_id = public.current_company_id()
  )
);

CREATE TABLE IF NOT EXISTS public.coala_sync_value_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES public.coala_sync_config(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.coala_sync_runs(id) ON DELETE SET NULL,
  target_table TEXT NOT NULL,
  target_id UUID NOT NULL,
  field TEXT NOT NULL,
  old_value JSONB NOT NULL,
  new_value JSONB NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.coala_sync_value_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coala_sync_value_changes_select ON public.coala_sync_value_changes;
CREATE POLICY coala_sync_value_changes_select ON public.coala_sync_value_changes FOR SELECT
USING (
  public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.coala_sync_config c
    WHERE c.id = coala_sync_value_changes.config_id AND c.company_id = public.current_company_id()
  )
);

-- 2) Auto-apply toggle in config
ALTER TABLE public.coala_sync_config
  ADD COLUMN IF NOT EXISTS auto_apply_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- 3) Relax check constraints to allow auto_apply / auto_applied / needs_review
ALTER TABLE public.coala_sync_runs DROP CONSTRAINT IF EXISTS coala_sync_runs_mode_check;
ALTER TABLE public.coala_sync_runs ADD CONSTRAINT coala_sync_runs_mode_check
  CHECK (mode = ANY (ARRAY['dry_run','apply','auto_apply']));

ALTER TABLE public.coala_sync_runs DROP CONSTRAINT IF EXISTS coala_sync_runs_status_check;
ALTER TABLE public.coala_sync_runs ADD CONSTRAINT coala_sync_runs_status_check
  CHECK (status = ANY (ARRAY['running','success','failed','blocked','skipped_unchanged','auto_applied','needs_review']));

-- 4) Cron job: */15 min, calls sync-coala-from-drive in dry_run + auto_apply escalation
-- Auth pattern: service_role JWT via vault (same as process-email-queue)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'coala-sync-auto') THEN
    PERFORM cron.unschedule('coala-sync-auto');
  END IF;
END $$;

SELECT cron.schedule(
  'coala-sync-auto',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := (SELECT 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co/functions/v1/sync-coala-from-drive'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := jsonb_build_object('mode','dry_run','triggeredBy','cron')
  );
  $cron$
);
