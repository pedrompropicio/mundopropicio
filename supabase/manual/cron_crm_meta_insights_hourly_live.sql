-- ============================================================================
-- Cron `crm-meta-insights-hourly` — LIVE only.
-- pg_cron NÃO propaga Test→Live via Publish (pg_dump não inclui cron.job).
-- Colar este bloco no SQL Editor com o ambiente LIVE selecionado.
-- Conteúdo idêntico à migration 20260823_cron_crm_meta_insights_hourly.
--
-- Edge function: crm-meta-sync-insights
--   body { connection_id, ad_account_id, days_back (3), levels (["campaign"]) }
-- Padrão de auth copiado de crm-meta-audiences-daily-sync (jobid 35) e
-- leads-capi-5min (jobid 44): vault 'email_queue_service_role_key'.
-- Idempotente: unschedule por jobname antes de schedule.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-meta-insights-hourly') THEN
    PERFORM cron.unschedule('crm-meta-insights-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'crm-meta-insights-hourly',
  '40 * * * *',
  $cmd$
  DO $body$
  DECLARE
    v_conn RECORD;
    v_response_id bigint;
  BEGIN
    FOR v_conn IN
      SELECT id AS connection_id, selected_ad_account_id AS ad_account_id
      FROM crm.ad_platform_connections
      WHERE platform = 'meta'
        AND status = 'active'
        AND selected_ad_account_id IS NOT NULL
    LOOP
      SELECT net.http_post(
        url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/crm-meta-sync-insights',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'email_queue_service_role_key' LIMIT 1
          )
        ),
        body := jsonb_build_object(
          'connection_id', v_conn.connection_id,
          'ad_account_id', v_conn.ad_account_id,
          'days_back', 3,
          'levels', jsonb_build_array('campaign'),
          'triggered_by', 'cron-hourly'
        )
      ) INTO v_response_id;

      RAISE NOTICE 'Triggered crm-meta-sync-insights for connection %, response id=%',
        v_conn.connection_id, v_response_id;
    END LOOP;
  END $body$;
  $cmd$
);

-- Verificação:
--   SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
