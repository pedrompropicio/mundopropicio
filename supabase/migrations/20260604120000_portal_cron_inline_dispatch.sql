-- Portal cron — inline dispatch (bypass PostgREST schema cache)
--
-- Edge functions process-lead-capture e process-redirect-log falham
-- silenciosamente em Live: PostgREST schema cache não vê RPCs SECURITY
-- DEFINER recentes (NOTIFY pgrst,'reload schema' não propaga em Lovable
-- Cloud). RPCs funcionam via SQL directo. Movemos o trabalho do cron
-- para wrappers PL/pgSQL que chamam as RPCs in-process e disparam CAPI
-- via net.http_post directo — zero PostgREST.
--
-- Edge functions process-* ficam deployed em Live mas o cron deixa de
-- as chamar. capi-meta-events continua a ser destino do http_post.
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DO block guard antes do
-- cron.unschedule + cron.schedule.

BEGIN;

-- ─── 1. portal_tick_lead_capture ──────────────────────────────────────
-- Chama process_lead_captures_batch(50), dispara CAPI por cada payload
-- que não tenha chave 'skip'. EXCEPTION no http_post não bloqueia o
-- batch — RAISE NOTICE para Postgres logs.
CREATE OR REPLACE FUNCTION public.portal_tick_lead_capture()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_payload jsonb;
  v_processed int := 0;
  v_skipped int := 0;
  v_capi_dispatched int := 0;
  v_response_id bigint;
BEGIN
  FOR v_payload IN
    SELECT * FROM public.process_lead_captures_batch(50)
  LOOP
    v_processed := v_processed + 1;
    IF v_payload ? 'skip' THEN
      v_skipped := v_skipped + 1;
    ELSE
      BEGIN
        SELECT net.http_post(
          url := 'https://ukpuhoynrqobqtzdbysp.supabase.co/functions/v1/capi-meta-events',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := v_payload
        ) INTO v_response_id;
        v_capi_dispatched := v_capi_dispatched + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'portal_tick_lead_capture: capi-meta-events dispatch failed: %', SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'skipped', v_skipped,
    'capi_dispatched', v_capi_dispatched,
    'ts', now()
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.portal_tick_lead_capture() FROM public;
GRANT EXECUTE ON FUNCTION public.portal_tick_lead_capture() TO postgres, service_role;

-- ─── 2. portal_tick_redirect_log ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_tick_redirect_log()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_payload jsonb;
  v_processed int := 0;
  v_skipped int := 0;
  v_capi_dispatched int := 0;
  v_response_id bigint;
BEGIN
  FOR v_payload IN
    SELECT * FROM public.process_redirect_logs_batch(50)
  LOOP
    v_processed := v_processed + 1;
    IF v_payload ? 'skip' THEN
      v_skipped := v_skipped + 1;
    ELSE
      BEGIN
        SELECT net.http_post(
          url := 'https://ukpuhoynrqobqtzdbysp.supabase.co/functions/v1/capi-meta-events',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := v_payload
        ) INTO v_response_id;
        v_capi_dispatched := v_capi_dispatched + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'portal_tick_redirect_log: capi-meta-events dispatch failed: %', SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'skipped', v_skipped,
    'capi_dispatched', v_capi_dispatched,
    'ts', now()
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.portal_tick_redirect_log() FROM public;
GRANT EXECUTE ON FUNCTION public.portal_tick_redirect_log() TO postgres, service_role;

-- ─── 3. Reschedule cron jobs ──────────────────────────────────────────
-- Preserva os nomes existentes "portal-process-lead-capture" e
-- "portal-process-redirect-log" (consistência com observabilidade).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'portal-process-lead-capture') THEN
    PERFORM cron.unschedule('portal-process-lead-capture');
  END IF;
END $$;

SELECT cron.schedule(
  'portal-process-lead-capture',
  '* * * * *',
  $cmd$ SELECT public.portal_tick_lead_capture(); $cmd$
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'portal-process-redirect-log') THEN
    PERFORM cron.unschedule('portal-process-redirect-log');
  END IF;
END $$;

SELECT cron.schedule(
  'portal-process-redirect-log',
  '* * * * *',
  $cmd$ SELECT public.portal_tick_redirect_log(); $cmd$
);

COMMIT;
