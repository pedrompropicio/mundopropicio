-- #209 — Retenção de criativos Meta: registo das corridas + cron semanal (dry-run).

CREATE TABLE IF NOT EXISTS crm.meta_creatives_retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  dry_run boolean NOT NULL DEFAULT true,
  days integer NOT NULL DEFAULT 30,
  max_delete integer NOT NULL DEFAULT 500,
  files_scanned integer NOT NULL DEFAULT 0,
  class_a_count integer NOT NULL DEFAULT 0,
  class_a_bytes bigint NOT NULL DEFAULT 0,
  class_b_orphan_count integer NOT NULL DEFAULT 0,
  class_b_orphan_bytes bigint NOT NULL DEFAULT 0,
  class_b_duplicate_count integer NOT NULL DEFAULT 0,
  class_b_duplicate_bytes bigint NOT NULL DEFAULT 0,
  class_b_repointed_count integer NOT NULL DEFAULT 0,
  class_c_count integer NOT NULL DEFAULT 0,
  class_c_bytes bigint NOT NULL DEFAULT 0,
  skipped_active_count integer NOT NULL DEFAULT 0,
  deleted_count integer NOT NULL DEFAULT 0,
  deleted_bytes bigint NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON crm.meta_creatives_retention_runs TO authenticated;
GRANT ALL ON crm.meta_creatives_retention_runs TO service_role;

ALTER TABLE crm.meta_creatives_retention_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass ON crm.meta_creatives_retention_runs;
CREATE POLICY service_role_bypass ON crm.meta_creatives_retention_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation_select ON crm.meta_creatives_retention_runs;
CREATE POLICY tenant_isolation_select ON crm.meta_creatives_retention_runs
  FOR SELECT TO authenticated
  USING (company_id IS NULL OR company_id = current_company_id());

-- Cron semanal: domingo 04:10 UTC, sempre em dry_run nesta fase.
DO $$ BEGIN
  PERFORM cron.unschedule('meta-creatives-retention');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'meta-creatives-retention não estava agendado; continuar.';
END $$;

SELECT cron.schedule(
  'meta-creatives-retention',
  '10 4 * * 0',
  $cron$
  SELECT net.http_post(
    url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/crm-meta-creatives-retention',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key' LIMIT 1
      )
    ),
    body := jsonb_build_object('dry_run', true, 'days', 30, 'max_delete', 500)
  );
  $cron$
);