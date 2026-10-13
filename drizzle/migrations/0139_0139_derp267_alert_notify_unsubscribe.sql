-- D-ERP267: o envio transaccional exige unsubscribe_token; idempotency por tentativa de envio.
CREATE OR REPLACE FUNCTION crm.artist_ads_alert_notify(p_alert_id uuid, p_event text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'crm'
AS $function$
DECLARE
  a record; v_artist text; v_subject text; v_text text; v_msg_id text; v_ch text; v_tok text;
  v_channels text[] := ARRAY['email'];   -- 2.º canal (ex.: 'whatsapp') acrescenta-se aqui
  v_to constant text := 'pedroneto@mundopropicio.com';
BEGIN
  SELECT l.*, c.selected_ad_account_id AS acc INTO a
  FROM public.artist_ads_alert_log l JOIN crm.ad_platform_connections c ON c.id = l.connection_id
  WHERE l.id = p_alert_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT name INTO v_artist FROM public.artists WHERE id = a.artist_id;
  v_subject := '[ALERTA ADS] ' || coalesce(v_artist,'Artista') || ' · ' || initcap(a.platform) || ' ' || coalesce(a.acc,'?') || ' · ' || a.kind
               || CASE WHEN p_event = 'resolved' THEN ' · resolvido' ELSE '' END;
  v_text := CASE WHEN p_event = 'resolved'
    THEN 'Resolvido: ' || a.message || E'\nDetectado: ' || to_char(a.detected_at AT TIME ZONE 'America/Fortaleza','DD/MM HH24:MI')
         || E'\nResolvido: ' || to_char(coalesce(a.resolved_at, now()) AT TIME ZONE 'America/Fortaleza','DD/MM HH24:MI') || ' (Fortaleza)'
    ELSE a.message || E'\nGravidade: ' || a.severity || E'\nDetectado: '
         || to_char(a.detected_at AT TIME ZONE 'America/Fortaleza','DD/MM HH24:MI') || ' (Fortaleza)' END
    || E'\n\n— MP Gestão Eventos';
  v_msg_id := 'ads-alert-' || p_alert_id::text || '-' || p_event || '-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISS');

  SELECT token INTO v_tok FROM public.email_unsubscribe_tokens WHERE email = v_to LIMIT 1;
  IF v_tok IS NULL THEN
    v_tok := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.email_unsubscribe_tokens (token, email, company_id) VALUES (v_tok, v_to, a.company_id)
    ON CONFLICT (email) DO NOTHING;
    SELECT token INTO v_tok FROM public.email_unsubscribe_tokens WHERE email = v_to LIMIT 1;
  END IF;

  FOREACH v_ch IN ARRAY v_channels LOOP
    IF v_ch = 'email' THEN
      PERFORM public.enqueue_email('transactional_emails', jsonb_build_object(
        'message_id', v_msg_id, 'to', v_to,
        'from', 'MP Gestão Eventos <noreply@mpgestaoeventos.com>',
        'sender_domain', 'notify.mpgestaoeventos.com',
        'subject', v_subject, 'text', v_text,
        'html', '<pre style="font-family:Helvetica,Arial,sans-serif;font-size:14px;white-space:pre-wrap">' ||
                replace(replace(v_text,'&','&amp;'),'<','&lt;') || '</pre>',
        'purpose', 'transactional', 'label', 'artist_ads_alert',
        'idempotency_key', v_msg_id, 'unsubscribe_token', v_tok,
        'queued_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), a.company_id);
    END IF;
  END LOOP;
  IF p_event = 'resolved' THEN
    UPDATE public.artist_ads_alert_log SET resolved_notified_at = now() WHERE id = p_alert_id;
  ELSE
    UPDATE public.artist_ads_alert_log SET notified_at = now() WHERE id = p_alert_id;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION crm.artist_ads_alert_notify(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm.artist_ads_alert_notify(uuid, text) TO service_role;