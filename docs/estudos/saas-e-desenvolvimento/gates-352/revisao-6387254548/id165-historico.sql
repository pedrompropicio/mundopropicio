-- Issue #320 / D-ERP281 — P1 CAPI do ERP: suspensão persistente, consentimento por interacção,
-- redirect_click fora de ViewContent, expiração, erro 100/33 terminal com alerta, recuperação de processing.
-- Nunca altera linhas 'sent', identidades, datas originais (created_at, capi_sent_at) nem dados de eventos/financeiros.

CREATE TABLE IF NOT EXISTS public.capi_dispatch_control (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  suspended boolean NOT NULL DEFAULT true,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
GRANT ALL ON public.capi_dispatch_control TO service_role;
REVOKE ALL ON public.capi_dispatch_control FROM anon, authenticated;
ALTER TABLE public.capi_dispatch_control ENABLE ROW LEVEL SECURITY;
INSERT INTO public.capi_dispatch_control (id, suspended, reason, updated_by)
VALUES (1, true, 'Issue #320 P1 — suspensão até verificação do Pedro; sem retoma automática', 'migration_0164')
ON CONFLICT (id) DO UPDATE SET suspended = true, reason = EXCLUDED.reason, updated_at = now(), updated_by = EXCLUDED.updated_by;

CREATE TABLE IF NOT EXISTS public.capi_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  lead_id uuid,
  meta_code integer,
  meta_subcode integer,
  kind text NOT NULL,
  detail text,
  acknowledged_at timestamptz,
  acknowledged_by text
);
GRANT ALL ON public.capi_alerts TO service_role;
REVOKE ALL ON public.capi_alerts FROM anon, authenticated;
ALTER TABLE public.capi_alerts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS capi_alerts_open_idx ON public.capi_alerts (created_at DESC) WHERE acknowledged_at IS NULL;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capi_status_before text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capi_block_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capi_classified_at timestamptz;
COMMENT ON COLUMN public.leads.capi_status_before IS 'Issue #320: capi_status anterior à classificação P1 (rasto; retry não prova envio)';

CREATE OR REPLACE FUNCTION public.capi_dispatch_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT NOT suspended FROM public.capi_dispatch_control WHERE id = 1), false);
$$;

-- Prova de consentimento marketing POR INTERACÇÃO. No P1 não existe nenhum registo dessa prova
-- (lead_capture.consent_email é newsletter; cookies/fbc/fbp/email não contam) → devolve sempre false.
CREATE OR REPLACE FUNCTION public.capi_consent_proof(p_lead_id uuid, p_event_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.capi_lead_block_reason(p_lead_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record;
BEGIN
  IF NOT public.capi_dispatch_allowed() THEN RETURN 'suspended'; END IF;
  SELECT id, kind, created_at, capi_status INTO l FROM public.leads WHERE id = p_lead_id;
  IF l.id IS NULL THEN RETURN 'not_found'; END IF;
  IF l.kind = 'redirect_click' THEN RETURN 'wrong_kind'; END IF;
  IF l.created_at < now() - interval '7 days' THEN RETURN 'expired'; END IF;
  IF NOT public.capi_consent_proof(l.id, 'ViewContent') THEN RETURN 'no_consent'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._capi_classify_lead(p_lead_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_status text; v_reason text;
BEGIN
  SELECT id, kind, created_at, capi_status INTO l FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF l.id IS NULL OR l.capi_status = 'sent' THEN RETURN l.capi_status; END IF;
  IF l.kind = 'redirect_click' THEN v_status := 'blocked_wrong_kind'; v_reason := 'redirect_click não gera ViewContent (D-ERP280.1)';
  ELSIF l.created_at < now() - interval '7 days' THEN v_status := 'expired'; v_reason := 'fora do prazo Meta de 7 dias';
  ELSIF NOT public.capi_consent_proof(l.id, 'ViewContent') THEN v_status := 'blocked_no_consent'; v_reason := 'sem prova de consentimento marketing por interacção';
  ELSE RETURN NULL; END IF;
  UPDATE public.leads SET capi_status_before = coalesce(capi_status_before, coalesce(capi_status, 'null')),
         capi_status = v_status, capi_block_reason = v_reason, capi_classified_at = now()
   WHERE id = l.id AND capi_status IS DISTINCT FROM 'sent';
  RETURN v_status;
END $$;

CREATE OR REPLACE FUNCTION public.capi_recover_processing(p_older_than_minutes integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v text; n_blocked int := 0; n_retry int := 0;
BEGIN
  FOR r IN SELECT id FROM public.leads WHERE capi_status = 'processing'
            AND capi_sent_at < now() - make_interval(mins => greatest(p_older_than_minutes, 1))
            FOR UPDATE SKIP LOCKED LOOP
    v := public._capi_classify_lead(r.id);
    IF v IS NULL THEN
      IF public.capi_dispatch_allowed() THEN
        UPDATE public.leads SET capi_status = 'retry' WHERE id = r.id AND capi_status = 'processing';
        n_retry := n_retry + 1;
      END IF;
    ELSE n_blocked := n_blocked + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('blocked', n_blocked, 'retry', n_retry);
END $$;

CREATE OR REPLACE FUNCTION public.capi_record_meta_error(p_lead_id uuid, p_code integer, p_subcode integer, p_detail text, p_source text DEFAULT 'process-leads-capi')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_code = 100 AND p_subcode = 33 THEN
    IF p_lead_id IS NOT NULL THEN
      UPDATE public.leads SET capi_status_before = coalesce(capi_status_before, coalesce(capi_status,'null')),
             capi_status = 'error_meta_access', capi_block_reason = 'Meta 100/33: objecto inexistente ou sem permissão',
             capi_classified_at = now()
       WHERE id = p_lead_id AND capi_status IS DISTINCT FROM 'sent';
    END IF;
    INSERT INTO public.capi_alerts (source, lead_id, meta_code, meta_subcode, kind, detail)
    VALUES (coalesce(p_source,'unknown'), p_lead_id, p_code, p_subcode, 'meta_access_100_33', left(p_detail, 500));
    RETURN 'error_meta_access';
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.process_leads_capi_batch(p_batch_size integer DEFAULT 25)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  ld record; v_email text; v_phone text; v_phone_digits text; v_email_hash text; v_phone_hash text;
  v_event_name text; v_event_url text; v_pixel_id text; v_now timestamptz;
  v_user_data jsonb; v_custom_data jsonb; v_payload jsonb;
BEGIN
  IF NOT public.capi_dispatch_allowed() THEN RETURN; END IF;
  FOR ld IN
    SELECT l.* FROM public.leads l
    WHERE (l.capi_status IS NULL OR l.capi_status = 'retry')
    ORDER BY l.created_at DESC
    LIMIT GREATEST(p_batch_size, 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_now := now();
      IF ld.kind = 'redirect_click' OR ld.created_at < (v_now - interval '7 days')
         OR NOT public.capi_consent_proof(ld.id, 'ViewContent') THEN
        PERFORM public._capi_classify_lead(ld.id);
        CONTINUE;
      END IF;

      v_pixel_id := NULL; v_event_name := NULL; v_event_url := NULL;
      IF ld.event_id IS NOT NULL THEN
        SELECT NULLIF(btrim(coalesce(meta_pixel_id,'')), ''), name, ticketing_url
          INTO v_pixel_id, v_event_name, v_event_url
        FROM public.events WHERE id = ld.event_id LIMIT 1;
      END IF;
      IF v_pixel_id IS NULL THEN
        UPDATE public.leads SET capi_sent_at = v_now, capi_status = 'skipped_no_pixel' WHERE id = ld.id;
        CONTINUE;
      END IF;

      v_email := NULL; v_phone := NULL;
      IF ld.contact_id IS NOT NULL THEN
        SELECT NULLIF(lower(btrim(coalesce(email,''))), ''), NULLIF(btrim(coalesce(phone_e164,'')), '')
          INTO v_email, v_phone FROM public.contacts WHERE id = ld.contact_id LIMIT 1;
      END IF;
      v_phone_digits := NULLIF(regexp_replace(coalesce(v_phone,''), '[^0-9]', '', 'g'), '');
      v_email_hash := CASE WHEN v_email IS NOT NULL THEN encode(extensions.digest(v_email, 'sha256'), 'hex') END;
      v_phone_hash := CASE WHEN v_phone_digits IS NOT NULL THEN encode(extensions.digest(v_phone_digits, 'sha256'), 'hex') END;

      v_user_data := '{}'::jsonb;
      IF v_email_hash IS NOT NULL THEN v_user_data := v_user_data || jsonb_build_object('em', jsonb_build_array(v_email_hash)); END IF;
      IF v_phone_hash IS NOT NULL THEN v_user_data := v_user_data || jsonb_build_object('ph', jsonb_build_array(v_phone_hash)); END IF;
      IF ld.fbc IS NOT NULL AND ld.fbc <> '' THEN v_user_data := v_user_data || jsonb_build_object('fbc', ld.fbc); END IF;
      IF ld.fbp IS NOT NULL AND ld.fbp <> '' THEN v_user_data := v_user_data || jsonb_build_object('fbp', ld.fbp); END IF;
      IF ld.ip_inet IS NOT NULL THEN v_user_data := v_user_data || jsonb_build_object('client_ip_address', host(ld.ip_inet)); END IF;
      IF ld.user_agent IS NOT NULL AND ld.user_agent <> '' THEN v_user_data := v_user_data || jsonb_build_object('client_user_agent', ld.user_agent); END IF;

      v_custom_data := jsonb_build_object('content_name', coalesce(v_event_name, ''), 'content_category', 'event_ticket');
      v_payload := jsonb_build_object(
        'pixel_id', v_pixel_id, 'event_name', 'ViewContent', 'event_id', ld.id::text,
        'event_time', extract(epoch from ld.created_at)::bigint,
        'event_source_url', v_event_url, 'user_data', v_user_data, 'custom_data', v_custom_data);

      UPDATE public.leads SET capi_sent_at = v_now, capi_status = 'processing' WHERE id = ld.id;
      RETURN NEXT jsonb_build_object('lead_id', ld.id, 'pixel_id', v_pixel_id, 'kind', ld.kind,
                                     'created_at', ld.created_at, 'payload', v_payload);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.leads SET capi_status = 'error' WHERE id = ld.id;
    END;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.portal_tick_lead_capture()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net', 'pg_temp'
AS $function$
DECLARE
  v_payload jsonb; v_processed int := 0; v_skipped int := 0; v_blocked int := 0;
  v_capi_dispatched int := 0; v_capi_failures int := 0; v_request_id bigint;
  v_token text; v_pixel_id text; v_graph_url text; v_graph_body jsonb;
BEGIN
  IF NOT public.capi_dispatch_allowed() THEN
    RETURN jsonb_build_object('suspended', true, 'ts', now());
  END IF;
  v_token := public.get_vault_secret('META_CAPI_ACCESS_TOKEN');
  IF v_token IS NULL OR length(v_token) < 50 THEN
    RETURN jsonb_build_object('error', 'capi_token_missing_or_invalid', 'token_len', coalesce(length(v_token), 0), 'ts', now());
  END IF;
  FOR v_payload IN SELECT p FROM public.process_lead_captures_batch(50) p LOOP
    v_processed := v_processed + 1;
    IF v_payload ? 'skip' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_pixel_id := v_payload ->> 'pixel_id';
    IF v_pixel_id IS NULL OR v_pixel_id = '' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    IF NOT public.capi_dispatch_allowed() OR NOT public.capi_consent_proof(NULL, v_payload ->> 'event_name') THEN
      v_blocked := v_blocked + 1; CONTINUE;
    END IF;
    v_graph_url := 'https://graph.facebook.com/v25.0/' || v_pixel_id || '/events';
    v_graph_body := jsonb_build_object('data', jsonb_build_array(jsonb_build_object(
          'event_name', v_payload ->> 'event_name', 'event_time', extract(epoch from now())::bigint,
          'event_id', v_payload ->> 'event_id', 'event_source_url', v_payload ->> 'event_source_url',
          'action_source', 'website', 'user_data', v_payload -> 'user_data', 'custom_data', v_payload -> 'custom_data')),
      'access_token', v_token);
    BEGIN
      SELECT net.http_post(url := v_graph_url, headers := jsonb_build_object('Content-Type', 'application/json'), body := v_graph_body) INTO v_request_id;
      v_capi_dispatched := v_capi_dispatched + 1;
    EXCEPTION WHEN OTHERS THEN
      v_capi_failures := v_capi_failures + 1;
      RAISE NOTICE 'portal_tick_lead_capture graph dispatch falhou: %', SQLERRM;
    END;
  END LOOP;
  RETURN jsonb_build_object('processed', v_processed, 'skipped', v_skipped, 'blocked_no_consent', v_blocked,
    'capi_dispatched', v_capi_dispatched, 'capi_failures', v_capi_failures, 'ts', now());
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_tick_redirect_log()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net', 'pg_temp'
AS $function$
DECLARE
  v_payload jsonb; v_processed int := 0; v_skipped int := 0; v_blocked int := 0;
  v_capi_dispatched int := 0; v_capi_failures int := 0; v_request_id bigint;
  v_token text; v_pixel_id text; v_graph_url text; v_graph_body jsonb;
BEGIN
  IF NOT public.capi_dispatch_allowed() THEN
    RETURN jsonb_build_object('suspended', true, 'ts', now());
  END IF;
  v_token := public.get_vault_secret('META_CAPI_ACCESS_TOKEN');
  IF v_token IS NULL OR length(v_token) < 50 THEN
    RETURN jsonb_build_object('error', 'capi_token_missing_or_invalid', 'token_len', coalesce(length(v_token), 0), 'ts', now());
  END IF;
  FOR v_payload IN SELECT p FROM public.process_redirect_logs_batch(50) p LOOP
    v_processed := v_processed + 1;
    IF v_payload ? 'skip' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_pixel_id := v_payload ->> 'pixel_id';
    IF v_pixel_id IS NULL OR v_pixel_id = '' THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    IF NOT public.capi_dispatch_allowed() OR NOT public.capi_consent_proof(NULL, v_payload ->> 'event_name') THEN
      v_blocked := v_blocked + 1; CONTINUE;
    END IF;
    v_graph_url := 'https://graph.facebook.com/v25.0/' || v_pixel_id || '/events';
    v_graph_body := jsonb_build_object('data', jsonb_build_array(jsonb_build_object(
          'event_name', v_payload ->> 'event_name', 'event_time', extract(epoch from now())::bigint,
          'event_id', v_payload ->> 'event_id', 'event_source_url', v_payload ->> 'event_source_url',
          'action_source', 'website', 'user_data', v_payload -> 'user_data', 'custom_data', v_payload -> 'custom_data')),
      'access_token', v_token);
    BEGIN
      SELECT net.http_post(url := v_graph_url, headers := jsonb_build_object('Content-Type', 'application/json'), body := v_graph_body) INTO v_request_id;
      v_capi_dispatched := v_capi_dispatched + 1;
    EXCEPTION WHEN OTHERS THEN
      v_capi_failures := v_capi_failures + 1;
      RAISE NOTICE 'portal_tick_redirect_log graph dispatch falhou: %', SQLERRM;
    END;
  END LOOP;
  RETURN jsonb_build_object('processed', v_processed, 'skipped', v_skipped, 'blocked_no_consent', v_blocked,
    'capi_dispatched', v_capi_dispatched, 'capi_failures', v_capi_failures, 'ts', now());
END;
$function$;

REVOKE ALL ON FUNCTION public.capi_dispatch_allowed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capi_consent_proof(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capi_lead_block_reason(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._capi_classify_lead(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capi_recover_processing(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capi_record_meta_error(uuid, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_leads_capi_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_tick_lead_capture() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_tick_redirect_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capi_dispatch_allowed() TO service_role;
GRANT EXECUTE ON FUNCTION public.capi_consent_proof(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.capi_lead_block_reason(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._capi_classify_lead(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.capi_recover_processing(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.capi_record_meta_error(uuid, integer, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_leads_capi_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_tick_lead_capture() TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_tick_redirect_log() TO service_role;

UPDATE public.leads SET capi_status_before = coalesce(capi_status, 'null'), capi_status = 'blocked_wrong_kind',
       capi_block_reason = 'redirect_click não gera ViewContent (D-ERP280.1)', capi_classified_at = now()
 WHERE kind = 'redirect_click' AND (capi_status IS NULL OR capi_status IN ('retry','processing'));
UPDATE public.leads SET capi_status_before = coalesce(capi_status, 'null'), capi_status = 'expired',
       capi_block_reason = 'fora do prazo Meta de 7 dias', capi_classified_at = now()
 WHERE kind <> 'redirect_click' AND (capi_status IS NULL OR capi_status IN ('retry','processing'))
   AND created_at < now() - interval '7 days';
UPDATE public.leads SET capi_status_before = coalesce(capi_status, 'null'), capi_status = 'blocked_no_consent',
       capi_block_reason = 'sem prova de consentimento marketing por interacção', capi_classified_at = now()
 WHERE kind <> 'redirect_click' AND (capi_status IS NULL OR capi_status IN ('retry','processing'));
