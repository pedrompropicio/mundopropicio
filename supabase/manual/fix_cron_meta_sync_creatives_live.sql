-- ============================================================================
-- FIX do cron `crm-meta-sync-creatives` (jobid 30 no Live) — Live-only.
-- NÃO é uma migration: os crons são geridos APENAS no Live SQL Editor (alterá-los
-- por migration não tem efeito no Live e arrisca divergência). Colar este bloco
-- no Live SQL Editor.
--
-- ESTADO ATUAL (verificado em Live):
--   1) active=false  → o cron está desligado (nunca corre).
--   2) BUG de URL: o comando aponta para o projeto TEST (ukpuhoynrqobqtzdbysp)
--      em vez do LIVE (sfohvvlqccmmebvjgibx). Os criativos iriam para a BD errada.
--
-- NOTA sobre o histórico: as migrations 20260529104023 e 20260531130227 tratavam
-- ukpuhoynrqobqtzdbysp como "canónico" — esse mapeamento INVERTEU-SE entretanto
-- (churn de duplicação de projetos). O canónico AGORA é sfohvvlqccmmebvjgibx (Live),
-- confirmado em Live. Este script usa sfohvv.
--
-- ALTERAÇÕES face ao comando atual:
--   1) URL → Live (sfohvvlqccmmebvjgibx).
--   2) Reativar (cron.schedule recria o job com active=true).
--   3) max_creatives_per_run: 40 → 200 (apanhar o backlog de ~129 criativos de
--      eventos ativos numa só corrida).
--   4) Body: + 'active_events_only' = true (sync focado em eventos ativos).
--
-- CAVEAT (max=200): a função re-hospeda cada criativo antes do upsert (~1-2s cada);
--   ~129 criativos ≈ ~195s, borderline face ao wall-clock da edge function. Como o
--   set-diff é incremental e o upsert é no fim, se UMA corrida estoirar nada se
--   perde — a seguinte refaz o lote. Se notares timeout, baixa para ~80 e deixa
--   drenar em 2 corridas. Depois deste arranque, as corridas diárias têm ~0 backlog.
--
-- ABORDAGEM SEGURA (gotchas de permissão com cron.alter_job já apanhadas):
--   unschedule + schedule POR JOBNAME (não por jobid). Idempotente.
-- ============================================================================

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
        url := 'https://sfohvvlqccmmebvjgibx.supabase.co/functions/v1/crm-meta-sync-creatives',
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
          'active_events_only', true,
          'triggered_by', 'cron-daily'
        )
      ) INTO v_response_id;

      RAISE NOTICE 'Triggered sync-creatives for connection %, response id=%',
        v_conn.connection_id, v_response_id;
    END LOOP;
  END $body$;
  $cmd$
);

-- Verificação rápida (opcional):
--   SELECT jobid, jobname, schedule, active, command FROM cron.job
--   WHERE jobname = 'crm-meta-sync-creatives';
