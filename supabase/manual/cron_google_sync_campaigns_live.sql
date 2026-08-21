-- ============================================================================
-- CRON diário `crm-google-sync-campaigns` — Live-only.
-- NÃO é uma migration: os crons são geridos APENAS no Live SQL Editor
-- (pg_cron não propaga Test→Live via Publish). Colar este bloco no Live SQL
-- Editor. Mesmo padrão de fix_cron_meta_sync_creatives_live.sql.
--
-- Objectivo: os insights diários do Google deixam de depender de alguém
-- carregar no botão. Corre às 05:30 UTC (antes do cron de criativos, 06:00).
-- days_back=7 dá margem para o Google reprocessar conversões atrasadas — o
-- upsert por (connection_id, external_campaign_id, date_start) reescreve os
-- dias já existentes sem duplicar. Backfill histórico continua a ser manual
-- (mode='full').
--
-- Idempotente: unschedule + schedule POR JOBNAME (nunca por jobid, nunca
-- cron.alter_job que exige owner postgres).
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-google-sync-campaigns') THEN
    PERFORM cron.unschedule('crm-google-sync-campaigns');
  END IF;
END $$;

SELECT cron.schedule(
  'crm-google-sync-campaigns',
  '30 5 * * *',
  $cmd$
  DO $body$
  DECLARE
    v_conn RECORD;
    v_response_id bigint;
  BEGIN
    FOR v_conn IN
      SELECT company_id, id AS connection_id
      FROM crm.ad_platform_connections
      WHERE platform = 'google'
        AND status = 'active'
        AND selected_ad_account_id IS NOT NULL
    LOOP
      SELECT net.http_post(
        url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/crm-google-sync-campaigns',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'email_queue_service_role_key' LIMIT 1
          )
        ),
        body := jsonb_build_object(
          'connection_id', v_conn.connection_id,
          'company_id', v_conn.company_id,
          'mode', 'incremental',
          'days_back', 7,
          'triggered_by', 'cron-daily'
        )
      ) INTO v_response_id;

      RAISE NOTICE 'Triggered google-sync-campaigns for connection %, response id=%',
        v_conn.connection_id, v_response_id;
    END LOOP;
  END $body$;
  $cmd$
);

-- Verificação:
--   SELECT jobid, jobname, schedule, active FROM cron.job
--   WHERE jobname = 'crm-google-sync-campaigns';
