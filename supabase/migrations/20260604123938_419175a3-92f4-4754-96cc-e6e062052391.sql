-- Wrapper PL/pgSQL para tick do pipeline lead_capture: chama RPC SECDEF existente
-- e dispara CAPI via net.http_post directo a capi-meta-events (bypass de PostgREST
-- e da edge function process-lead-capture, que tinha problemas de schema cache).
CREATE OR REPLACE FUNCTION public.portal_tick_lead_capture()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, pg_temp
AS $$
DECLARE
  v_payload jsonb;
  v_processed int := 0;
  v_skipped int := 0;
  v_capi_dispatched int := 0;
  v_capi_failures int := 0;
  v_request_id bigint;
  v_capi_url constant text := 'https://ukpuhoynrqobqtzdbysp.supabase.co/functions/v1/capi-meta-events';
BEGIN
  FOR v_payload IN
    SELECT p FROM public.process_lead_captures_batch(50) p
  LOOP
    v_processed := v_processed + 1;
    IF v_payload ? 'skip' THEN
      v_skipped := v_skipped + 1;
    ELSE
      BEGIN
        SELECT net.http_post(
          url := v_capi_url,
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := v_payload
        ) INTO v_request_id;
        v_capi_dispatched := v_capi_dispatched + 1;
      EXCEPTION WHEN OTHERS THEN
        v_capi_failures := v_capi_failures + 1;
        RAISE NOTICE 'portal_tick_lead_capture CAPI dispatch falhou: %', SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'skipped', v_skipped,
    'capi_dispatched', v_capi_dispatched,
    'capi_failures', v_capi_failures,
    'ts', now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.portal_tick_lead_capture() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_tick_lead_capture() TO postgres, service_role;


-- Análoga para redirect_log
CREATE OR REPLACE FUNCTION public.portal_tick_redirect_log()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net, pg_temp
AS $$
DECLARE
  v_payload jsonb;
  v_processed int := 0;
  v_skipped int := 0;
  v_capi_dispatched int := 0;
  v_capi_failures int := 0;
  v_request_id bigint;
  v_capi_url constant text := 'https://ukpuhoynrqobqtzdbysp.supabase.co/functions/v1/capi-meta-events';
BEGIN
  FOR v_payload IN
    SELECT p FROM public.process_redirect_logs_batch(50) p
  LOOP
    v_processed := v_processed + 1;
    IF v_payload ? 'skip' THEN
      v_skipped := v_skipped + 1;
    ELSE
      BEGIN
        SELECT net.http_post(
          url := v_capi_url,
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := v_payload
        ) INTO v_request_id;
        v_capi_dispatched := v_capi_dispatched + 1;
      EXCEPTION WHEN OTHERS THEN
        v_capi_failures := v_capi_failures + 1;
        RAISE NOTICE 'portal_tick_redirect_log CAPI dispatch falhou: %', SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'skipped', v_skipped,
    'capi_dispatched', v_capi_dispatched,
    'capi_failures', v_capi_failures,
    'ts', now()
  );
END;
$$;
REVOKE ALL ON FUNCTION public.portal_tick_redirect_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_tick_redirect_log() TO postgres, service_role;