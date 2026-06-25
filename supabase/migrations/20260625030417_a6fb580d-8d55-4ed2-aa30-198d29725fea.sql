
CREATE OR REPLACE FUNCTION public.process_leads_capi_batch(p_batch_size integer DEFAULT 25)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  ld record;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_email_hash text;
  v_phone_hash text;
  v_event_name text;
  v_event_url text;
  v_pixel_id text;
  v_now timestamptz;
  v_user_data jsonb;
  v_custom_data jsonb;
  v_payload jsonb;
BEGIN
  FOR ld IN
    SELECT l.*
    FROM public.leads l
    WHERE (l.capi_status IS NULL OR l.capi_status = 'retry')
    ORDER BY l.created_at DESC
    LIMIT GREATEST(p_batch_size, 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_now := now();

      IF ld.created_at < (v_now - interval '7 days') THEN
        UPDATE public.leads
          SET capi_sent_at = v_now, capi_status = 'skipped_old'
        WHERE id = ld.id;
        CONTINUE;
      END IF;

      v_pixel_id := NULL; v_event_name := NULL; v_event_url := NULL;
      IF ld.event_id IS NOT NULL THEN
        SELECT NULLIF(btrim(coalesce(meta_pixel_id,'')), ''), name, ticketing_url
          INTO v_pixel_id, v_event_name, v_event_url
        FROM public.events WHERE id = ld.event_id LIMIT 1;
      END IF;

      IF v_pixel_id IS NULL THEN
        UPDATE public.leads
          SET capi_sent_at = v_now, capi_status = 'skipped_no_pixel'
        WHERE id = ld.id;
        CONTINUE;
      END IF;

      v_email := NULL; v_phone := NULL;
      IF ld.contact_id IS NOT NULL THEN
        SELECT NULLIF(lower(btrim(coalesce(email,''))), ''),
               NULLIF(btrim(coalesce(phone_e164,'')), '')
          INTO v_email, v_phone
        FROM public.contacts WHERE id = ld.contact_id LIMIT 1;
      END IF;
      v_phone_digits := NULLIF(regexp_replace(coalesce(v_phone,''), '[^0-9]', '', 'g'), '');

      v_email_hash := CASE WHEN v_email IS NOT NULL
        THEN encode(extensions.digest(v_email, 'sha256'), 'hex') END;
      v_phone_hash := CASE WHEN v_phone_digits IS NOT NULL
        THEN encode(extensions.digest(v_phone_digits, 'sha256'), 'hex') END;

      v_user_data := '{}'::jsonb;
      IF v_email_hash IS NOT NULL THEN
        v_user_data := v_user_data || jsonb_build_object('em', jsonb_build_array(v_email_hash));
      END IF;
      IF v_phone_hash IS NOT NULL THEN
        v_user_data := v_user_data || jsonb_build_object('ph', jsonb_build_array(v_phone_hash));
      END IF;
      IF ld.fbc IS NOT NULL AND ld.fbc <> '' THEN
        v_user_data := v_user_data || jsonb_build_object('fbc', ld.fbc);
      END IF;
      IF ld.fbp IS NOT NULL AND ld.fbp <> '' THEN
        v_user_data := v_user_data || jsonb_build_object('fbp', ld.fbp);
      END IF;
      IF ld.ip_inet IS NOT NULL THEN
        v_user_data := v_user_data || jsonb_build_object('client_ip_address', host(ld.ip_inet));
      END IF;
      IF ld.user_agent IS NOT NULL AND ld.user_agent <> '' THEN
        v_user_data := v_user_data || jsonb_build_object('client_user_agent', ld.user_agent);
      END IF;

      v_custom_data := jsonb_build_object(
        'content_name', coalesce(v_event_name, ''),
        'content_category', 'event_ticket'
      );

      v_payload := jsonb_build_object(
        'pixel_id', v_pixel_id,
        'event_name', 'ViewContent',
        'event_id', ld.id::text,
        'event_time', extract(epoch from ld.created_at)::bigint,
        'event_source_url', v_event_url,
        'user_data', v_user_data,
        'custom_data', v_custom_data
      );

      -- Marca 'processing' (não 'sent'): capi_sent_at serve de lock temporal,
      -- o status final ('sent' ou 'retry') é escrito pela edge após o POST.
      UPDATE public.leads
        SET capi_sent_at = v_now, capi_status = 'processing'
      WHERE id = ld.id;

      RETURN NEXT jsonb_build_object('lead_id', ld.id, 'pixel_id', v_pixel_id, 'payload', v_payload);

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.leads SET capi_status = 'error' WHERE id = ld.id;
    END;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_leads_capi_batch(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_leads_capi_batch(integer) TO service_role;
