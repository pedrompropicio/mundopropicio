-- Fix do cron `crm-meta-sync-creatives` (jobid 22 no live).
--
-- BUG: o cron foi criado out-of-band (não estava versionado) com o filtro
--   WHERE status = 'connected'
-- mas o valor real de crm.ad_platform_connections.status é 'active'. Logo o
-- FOR LOOP percorria ZERO connections e o cron era um no-op silencioso
-- ("succeeded" diariamente em ~4ms sem invocar a função). Resultado: nenhum
-- criativo novo sincronizado desde 20/05/2026.
--
-- DUAS alterações ao cron original:
--   1) status = 'connected' → status = 'active'   (o filtro nunca correspondia → no-op)
--   2) URL sfohvvlqccmmebvjgibx → ukpuhoynrqobqtzdbysp   (projeto canónico)
--
-- Porquê as DUAS (e não só a 1): confirmado por net.http_get que a edge function
-- no projeto ANTIGO sfohvv ESTÁ VIVA (responde 405 method_not_allowed ao GET, ou
-- seja está deployada e aceita POSTs). Logo, corrigir só o status mas manter o URL
-- antigo deixaria o cron de ser no-op MAS gravaria os criativos na BD do sfohvv,
-- não na do ukpuhoynrqobqtzdbysp onde trabalhamos. Só com (1)+(2) os criativos
-- chegam à BD certa. O URL canónico segue o padrão do cron 'ticketline-sync-daily',
-- que já aponta para ukpuhoynrqobqtzdbysp no live.
--
-- Nota: os RESTANTES crons do live continuam a apontar para sfohvv — arrumá-los é
-- o trabalho separado de duplicação de projetos; este cron não fica refém disso.
-- Schedule ('0 6 * * *'), secret ('email_queue_service_role_key') e os params do
-- body (mode='incremental', max_creatives_per_run=200, triggered_by='cron-daily')
-- ficam idênticos ao cron original.
--
-- Idempotente: o guard IF EXISTS + unschedule permite correr 2x sem rebentar.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-meta-sync-creatives') THEN
    PERFORM cron.unschedule('crm-meta-sync-creatives');
  END IF;
END $$;

SELECT cron.schedule(
  'crm-meta-sync-creatives',
  '0 6 * * *',
  $cmd$
  DO $body$
  DECLARE
    v_conn RECORD;
    v_response_id bigint;
  BEGIN
    FOR v_conn IN
      SELECT
        company_id,
        id AS connection_id,
        selected_ad_account_id AS ad_account_id
      FROM crm.ad_platform_connections
      WHERE platform = 'meta'
        AND status = 'active'
        AND selected_ad_account_id IS NOT NULL
    LOOP
      SELECT net.http_post(
        url := 'https://ukpuhoynrqobqtzdbysp.supabase.co/functions/v1/crm-meta-sync-creatives',
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
          'mode', 'incremental',
          'max_creatives_per_run', 200,
          'triggered_by', 'cron-daily'
        )
      ) INTO v_response_id;

      RAISE NOTICE 'Triggered sync-creatives for connection %, response id=%',
        v_conn.connection_id, v_response_id;
    END LOOP;
  END $body$;
  $cmd$
);
