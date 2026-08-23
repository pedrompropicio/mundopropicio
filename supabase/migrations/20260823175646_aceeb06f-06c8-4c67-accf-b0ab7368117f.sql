-- ============================================================================
-- Cron `crm-meta-insights-hourly` — sync horário de insights de campanhas Meta.
--
-- Contexto: não existia NENHUM cron para insights de campanhas Meta (o jobid 35
-- `crm-meta-audiences-daily-sync` é de audiências). O sync era manual, e o
-- dashboard ficou 2 dias com dados de 21/08.
--
-- Padrão copiado de `crm-meta-audiences-daily-sync` (jobid 35) / `leads-capi-5min`
-- (jobid 44): net.http_post + Bearer do vault `email_queue_service_role_key`.
-- Fan-out por conexão Meta activa igual ao job `crm-meta-sync-creatives` (jobid 41).
--
-- Edge function: crm-meta-sync-insights
--   body { connection_id, ad_account_id, days_back?, levels? }
--   days_back default 30 (clamp 1..90) → 3 (barato + apanha correcções
--   retroactivas da Meta; upsert por dia reescreve sem duplicar).
--   levels default ["campaign"] → explicitado no body.
--
-- Idempotente: unschedule por jobname antes de schedule.
-- NOTA: pg_cron NÃO propaga Test→Live via Publish; ver
-- supabase/manual/cron_crm_meta_insights_hourly_live.sql para Live.
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
