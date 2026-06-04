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
  v_token text;
  v_pixel_id text;
  v_graph_url text;
  v_graph_body jsonb;
BEGIN
  v_token := public.get_vault_secret('META_CAPI_ACCESS_TOKEN');
  IF v_token IS NULL OR length(v_token) < 50 THEN
    RETURN jsonb_build_object(
      'error', 'capi_token_missing_or_invalid',
      'token_len', coalesce(length(v_token), 0),
      'ts', now()
    );
  END IF;

  FOR v_payload IN
    SELECT p FROM public.process_lead_captures_batch(50) p
  LOOP
    v_processed := v_processed + 1;
    IF v_payload ? 'skip' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_pixel_id := v_payload ->> 'pixel_id';
    IF v_pixel_id IS NULL OR v_pixel_id = '' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_graph_url := 'https://graph.facebook.com/v25.0/' || v_pixel_id || '/events';

    v_graph_body := jsonb_build_object(
      'data', jsonb_build_array(
        jsonb_build_object(
          'event_name',       v_payload ->> 'event_name',
          'event_time',       extract(epoch from now())::bigint,
          'event_id',         v_payload ->> 'event_id',
          'event_source_url', v_payload ->> 'event_source_url',
          'action_source',    'website',
          'user_data',        v_payload -> 'user_data',
          'custom_data',      v_payload -> 'custom_data'
        )
      ),
      'access_token', v_token
    );

    BEGIN
      SELECT net.http_post(
        url     := v_graph_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := v_graph_body
      ) INTO v_request_id;
      v_capi_dispatched := v_capi_dispatched + 1;
    EXCEPTION WHEN OTHERS THEN
      v_capi_failures := v_capi_failures + 1;
      RAISE NOTICE 'portal_tick_lead_capture graph dispatch falhou: %', SQLERRM;
    END;
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
  v_token text;
  v_pixel_id text;
  v_graph_url text;
  v_graph_body jsonb;
BEGIN
  v_token := public.get_vault_secret('META_CAPI_ACCESS_TOKEN');
  IF v_token IS NULL OR length(v_token) < 50 THEN
    RETURN jsonb_build_object(
      'error', 'capi_token_missing_or_invalid',
      'token_len', coalesce(length(v_token), 0),
      'ts', now()
    );
  END IF;

  FOR v_payload IN
    SELECT p FROM public.process_redirect_logs_batch(50) p
  LOOP
    v_processed := v_processed + 1;
    IF v_payload ? 'skip' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_pixel_id := v_payload ->> 'pixel_id';
    IF v_pixel_id IS NULL OR v_pixel_id = '' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_graph_url := 'https://graph.facebook.com/v25.0/' || v_pixel_id || '/events';

    v_graph_body := jsonb_build_object(
      'data', jsonb_build_array(
        jsonb_build_object(
          'event_name',       v_payload ->> 'event_name',
          'event_time',       extract(epoch from now())::bigint,
          'event_id',         v_payload ->> 'event_id',
          'event_source_url', v_payload ->> 'event_source_url',
          'action_source',    'website',
          'user_data',        v_payload -> 'user_data',
          'custom_data',      v_payload -> 'custom_data'
        )
      ),
      'access_token', v_token
    );

    BEGIN
      SELECT net.http_post(
        url     := v_graph_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := v_graph_body
      ) INTO v_request_id;
      v_capi_dispatched := v_capi_dispatched + 1;
    EXCEPTION WHEN OTHERS THEN
      v_capi_failures := v_capi_failures + 1;
      RAISE NOTICE 'portal_tick_redirect_log graph dispatch falhou: %', SQLERRM;
    END;
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