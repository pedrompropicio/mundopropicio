CREATE OR REPLACE FUNCTION public.process_lead_captures_batch(p_batch_size integer DEFAULT 50)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  MP_COMPANY_ID constant uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
  PORTAL_URL_BASE constant text := 'https://www.mundopropicio.com/eventos/';
  lc record;
  v_company_id uuid;
  v_email text;
  v_phone text;
  v_phone_digits text;
  v_email_hash text;
  v_phone_hash text;
  v_contact contacts%ROWTYPE;
  v_contact_id uuid;
  v_event_id uuid;
  v_pixel_id text;
  v_lead_id uuid;
  v_now timestamptz;
  v_user_data jsonb;
  v_payload jsonb;
BEGIN
  FOR lc IN
    SELECT * FROM public.lead_capture
    WHERE processed = false
    ORDER BY created_at ASC
    LIMIT GREATEST(p_batch_size, 1)
  LOOP
    BEGIN
      v_now := now();
      v_company_id := COALESCE(lc.company_id, MP_COMPANY_ID);
      v_email := NULLIF(lower(btrim(coalesce(lc.email, ''))), '');
      v_phone := NULLIF(btrim(coalesce(lc.phone, '')), '');
      v_phone_digits := NULLIF(regexp_replace(coalesce(v_phone, ''), '[^0-9]', '', 'g'), '');

      v_email_hash := CASE WHEN v_email IS NOT NULL
        THEN encode(extensions.digest(v_email, 'sha256'), 'hex') END;
      v_phone_hash := CASE WHEN v_phone_digits IS NOT NULL
        THEN encode(extensions.digest(v_phone_digits, 'sha256'), 'hex') END;

      v_contact := NULL;
      IF v_email IS NOT NULL THEN
        SELECT * INTO v_contact FROM public.contacts
        WHERE company_id = v_company_id AND email = v_email LIMIT 1;
      END IF;
      IF v_contact.id IS NULL AND v_phone IS NOT NULL THEN
        SELECT * INTO v_contact FROM public.contacts
        WHERE company_id = v_company_id AND phone_e164 = v_phone LIMIT 1;
      END IF;

      IF v_contact.id IS NOT NULL THEN
        UPDATE public.contacts SET
          email = coalesce(email, v_email),
          phone_e164 = coalesce(phone_e164, v_phone),
          name = coalesce(name, lc.name),
          source = coalesce(source, lc.source, 'portal_newsletter'),
          consent_email = consent_email OR coalesce(lc.consent_email, false),
          consent_whatsapp = consent_whatsapp OR coalesce(lc.consent_whatsapp, false),
          consent_email_at = CASE
            WHEN (consent_email OR coalesce(lc.consent_email,false))
              THEN coalesce(consent_email_at, v_now)
            ELSE NULL END,
          consent_whatsapp_at = CASE
            WHEN (consent_whatsapp OR coalesce(lc.consent_whatsapp,false))
              THEN coalesce(consent_whatsapp_at, v_now)
            ELSE NULL END,
          last_activity_at = v_now,
          updated_at = v_now
        WHERE id = v_contact.id;
        v_contact_id := v_contact.id;
      ELSE
        INSERT INTO public.contacts (
          company_id, email, phone_e164, name,
          consent_email, consent_whatsapp,
          consent_email_at, consent_whatsapp_at,
          source, last_activity_at
        ) VALUES (
          v_company_id, v_email, v_phone, lc.name,
          coalesce(lc.consent_email,false), coalesce(lc.consent_whatsapp,false),
          CASE WHEN coalesce(lc.consent_email,false) THEN v_now END,
          CASE WHEN coalesce(lc.consent_whatsapp,false) THEN v_now END,
          coalesce(lc.source,'portal_newsletter'), v_now
        )
        RETURNING id INTO v_contact_id;
      END IF;

      v_event_id := NULL; v_pixel_id := NULL;
      IF lc.event_slug IS NOT NULL THEN
        SELECT id, meta_pixel_id INTO v_event_id, v_pixel_id
        FROM public.events
        WHERE company_id = v_company_id AND slug = lc.event_slug
        LIMIT 1;
      END IF;

      INSERT INTO public.leads (
        company_id, contact_id, event_id, kind, source,
        utm_source, utm_medium, utm_campaign, utm_content,
        ip_inet, user_agent, fbc, fbp,
        geo_country, geo_city, geo_region
      ) VALUES (
        v_company_id, v_contact_id, v_event_id,
        CASE WHEN lc.event_slug IS NOT NULL THEN 'event_interest' ELSE 'newsletter_signup' END,
        lc.source, lc.utm_source, lc.utm_medium, lc.utm_campaign, lc.utm_content,
        lc.ip_inet, lc.user_agent, lc.fbc, lc.fbp,
        lc.geo_country, lc.geo_city, lc.geo_region
      )
      RETURNING id INTO v_lead_id;

      UPDATE public.lead_capture
        SET processed = true, processed_at = v_now, processing_error = NULL
      WHERE id = lc.id;

      IF v_pixel_id IS NULL THEN
        RETURN NEXT jsonb_build_object('skip', true, 'reason', 'no_pixel');
      ELSE
        v_user_data := '{}'::jsonb;
        IF v_email_hash IS NOT NULL THEN
          v_user_data := v_user_data || jsonb_build_object('em', jsonb_build_array(v_email_hash));
        END IF;
        IF v_phone_hash IS NOT NULL THEN
          v_user_data := v_user_data || jsonb_build_object('ph', jsonb_build_array(v_phone_hash));
        END IF;
        IF lc.fbc IS NOT NULL AND lc.fbc <> '' THEN
          v_user_data := v_user_data || jsonb_build_object('fbc', lc.fbc);
        END IF;
        IF lc.fbp IS NOT NULL AND lc.fbp <> '' THEN
          v_user_data := v_user_data || jsonb_build_object('fbp', lc.fbp);
        END IF;
        IF lc.ip_inet IS NOT NULL THEN
          v_user_data := v_user_data || jsonb_build_object('client_ip_address', host(lc.ip_inet));
        END IF;
        IF lc.user_agent IS NOT NULL AND lc.user_agent <> '' THEN
          v_user_data := v_user_data || jsonb_build_object('client_user_agent', lc.user_agent);
        END IF;

        v_payload := jsonb_build_object(
          'pixel_id', v_pixel_id,
          'event_name', 'Lead',
          'event_id', coalesce(lc.client_event_id, v_lead_id),
          'event_source_url', PORTAL_URL_BASE || coalesce(lc.event_slug,''),
          'user_data', v_user_data,
          'custom_data', jsonb_build_object(
            'content_ids', CASE WHEN v_event_id IS NOT NULL
              THEN jsonb_build_array(v_event_id) ELSE '[]'::jsonb END,
            'content_name', 'event_interest',
            'content_category', 'event'
          )
        );
        RETURN NEXT v_payload;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.lead_capture
        SET processing_error = left(SQLERRM, 500)
      WHERE id = lc.id;
      RETURN NEXT jsonb_build_object('skip', true, 'reason', 'error', 'detail', SQLERRM);
    END;
  END LOOP;
END;
$function$;