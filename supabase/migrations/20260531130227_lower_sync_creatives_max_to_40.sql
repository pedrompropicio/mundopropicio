-- Baixa o cap por run do cron `crm-meta-sync-creatives` (jobid 22 no live):
--   max_creatives_per_run: 200 → 40
--
-- PORQUÊ (investigação read-only de 2026-05-31):
-- A função crm-meta-sync-creatives re-hospeda cada criativo novo ANTES do upsert
-- (secção 3c, ~L522-542). Cada rehost custa ~1-2s (download Meta + upload storage)
-- e o UPSERT só acontece no FIM, depois do loop de rehost completo. Com max=200,
-- uma run grande custa ~240-300s + chamadas Graph — borderline/acima do limite de
-- wall-clock da edge function (~150-400s). Se a run estoirar a meio do loop, NADA
-- é persistido (o upsert é no fim) e a run seguinte re-faz o mesmo lote do zero →
-- risco de loop de não-progresso (re-faz sempre os mesmos 200 e nunca upserta).
--
-- Com max=40 a run acaba folgada (~48s) bem dentro do wall-clock, upserta o lote,
-- e o set-diff incremental (missing = snapshot − existentes) avança no resto nas
-- runs diárias seguintes. 40 cobre 99% dos dias reais; backlogs maiores drenam ao
-- longo de poucos dias sem nunca arriscar timeout.
--
-- ÚNICA alteração face à migration 20260529104023: o valor de 'max_creatives_per_run'.
-- Tudo o resto idêntico: schedule '0 6 * * *', URL ukpuhoynrqobqtzdbysp, secret
-- 'email_queue_service_role_key', mode='incremental', triggered_by='cron-daily',
-- filtro status='active', platform='meta', selected_ad_account_id IS NOT NULL.
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
          'max_creatives_per_run', 40,
          'triggered_by', 'cron-daily'
        )
      ) INTO v_response_id;

      RAISE NOTICE 'Triggered sync-creatives for connection %, response id=%',
        v_conn.connection_id, v_response_id;
    END LOOP;
  END $body$;
  $cmd$
);
