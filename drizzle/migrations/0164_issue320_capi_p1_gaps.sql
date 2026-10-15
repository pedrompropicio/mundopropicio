-- Issue #320 P1 — correção de lacunas da verificação independente.
-- Reproduz de forma idempotente os objectos da 0164 aplicada em Live (ficheiro não ficou no repo)
-- e acrescenta: filtro de tipo/prazo na SELEÇÃO de process_leads_capi_batch,
-- classificação técnica separada de redirect_click, guarda servidor por lead antes do POST,
-- e desactivação dura do dispatch SQL (net.http_post assíncrono não permite tratar 100/33).

CREATE TABLE IF NOT EXISTS public.capi_dispatch_control (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  suspended boolean NOT NULL DEFAULT true,
  reason text, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text);
CREATE TABLE IF NOT EXISTS public.capi_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL, lead_id uuid, meta_code integer, meta_subcode integer, kind text NOT NULL,
  detail text, acknowledged_at timestamptz, acknowledged_by text);
REVOKE ALL ON public.capi_dispatch_control FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.capi_alerts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.capi_dispatch_control TO service_role;
GRANT ALL ON public.capi_alerts TO service_role;
ALTER TABLE public.capi_dispatch_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capi_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capi_status_before text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capi_block_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capi_classified_at timestamptz;

-- 1) Seleção SQL exclui redirect_click e fora de prazo; guarda interna mantida.
CREATE OR REPLACE FUNCTION public.process_leads_capi_batch(p_batch_size integer DEFAULT 25)
 RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  ld record; v_email text; v_phone text; v_phone_digits text; v_email_hash text; v_phone_hash text;
  v_event_name text; v_event_url text; v_pixel_id text; v_now timestamptz;
  v_user_data jsonb; v_custom_data jsonb; v_payload jsonb;
BEGIN
  IF NOT public.capi_dispatch_allowed() THEN RETURN; END IF;
  FOR ld IN
    SELECT l.* FROM public.leads l
    WHERE (l.capi_status IS NULL OR l.capi_status = 'retry')
      AND l.kind IS DISTINCT FROM 'redirect_click'
      AND l.created_at >= now() - interval '7 days'
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
          INTO v_pixel_id, v_event_name, v_event_url FROM public.events WHERE id = ld.event_id LIMIT 1;
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
      v_payload := jsonb_build_object('pixel_id', v_pixel_id, 'event_name', 'ViewContent', 'event_id', ld.id::text,
        'event_time', extract(epoch from ld.created_at)::bigint, 'event_source_url', v_event_url,
        'user_data', v_user_data, 'custom_data', v_custom_data);
      UPDATE public.leads SET capi_sent_at = v_now, capi_status = 'processing' WHERE id = ld.id;
      RETURN NEXT jsonb_build_object('lead_id', ld.id, 'pixel_id', v_pixel_id, 'kind', ld.kind,
                                     'created_at', ld.created_at, 'payload', v_payload);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.leads SET capi_status = 'error' WHERE id = ld.id;
    END;
  END LOOP;
END $function$;

-- 2) Via técnica separada: classifica redirect_click / fora de prazo pendentes, sem envio.
CREATE OR REPLACE FUNCTION public.capi_classify_pending_blocked(p_limit integer DEFAULT 1000)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; v text; n_wrong int := 0; n_exp int := 0;
BEGIN
  FOR r IN SELECT id FROM public.leads
            WHERE (capi_status IS NULL OR capi_status = 'retry')
              AND (kind = 'redirect_click' OR created_at < now() - interval '7 days')
            LIMIT greatest(p_limit, 1) FOR UPDATE SKIP LOCKED LOOP
    v := public._capi_classify_lead(r.id);
    IF v = 'blocked_wrong_kind' THEN n_wrong := n_wrong + 1; ELSIF v = 'expired' THEN n_exp := n_exp + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('blocked_wrong_kind', n_wrong, 'expired', n_exp);
END $function$;

-- 3) Guarda servidor por lead, imediatamente antes do POST (edge). Não confia em kind/data/evento do cliente.
CREATE OR REPLACE FUNCTION public.capi_guard_lead_dispatch(p_lead_id uuid, p_event_name text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE l record; v_reason text;
BEGIN
  IF NOT public.capi_dispatch_allowed() THEN RETURN jsonb_build_object('allowed', false, 'reason', 'suspended'); END IF;
  IF p_lead_id IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'no_identity'); END IF;
  SELECT id, kind, created_at, capi_status INTO l FROM public.leads WHERE id = p_lead_id;
  IF l.id IS NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', 'no_identity'); END IF;
  IF p_event_name IS DISTINCT FROM 'ViewContent' THEN RETURN jsonb_build_object('allowed', false, 'reason', 'wrong_event'); END IF;
  IF l.capi_status IS DISTINCT FROM 'processing' THEN RETURN jsonb_build_object('allowed', false, 'reason', 'not_claimed'); END IF;
  v_reason := public.capi_lead_block_reason(l.id);
  IF v_reason IS NOT NULL THEN RETURN jsonb_build_object('allowed', false, 'reason', v_reason); END IF;
  RETURN jsonb_build_object('allowed', true, 'reason', NULL, 'event_time', extract(epoch from l.created_at)::bigint);
END $function$;

-- 4) Dispatch SQL (net.http_post assíncrono) desactivado de forma dura: não há tratamento de resposta 100/33.
--    Só pode voltar com nova migração que implemente leitura da resposta.
CREATE OR REPLACE FUNCTION public.portal_tick_lead_capture()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN jsonb_build_object('disabled', true, 'reason', 'issue320_sql_dispatch_without_response_handling',
                            'suspended', NOT public.capi_dispatch_allowed(), 'ts', now());
END $function$;
CREATE OR REPLACE FUNCTION public.portal_tick_redirect_log()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN jsonb_build_object('disabled', true, 'reason', 'issue320_sql_dispatch_without_response_handling',
                            'suspended', NOT public.capi_dispatch_allowed(), 'ts', now());
END $function$;

REVOKE ALL ON FUNCTION public.capi_classify_pending_blocked(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capi_guard_lead_dispatch(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_leads_capi_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_tick_lead_capture() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_tick_redirect_log() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capi_classify_pending_blocked(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.capi_guard_lead_dispatch(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_leads_capi_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_tick_lead_capture() TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_tick_redirect_log() TO service_role;