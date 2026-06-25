
-- 1) Colunas de controlo CAPI em public.leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capi_sent_at timestamptz DEFAULT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS capi_status text DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_capi_pending
  ON public.leads (created_at) WHERE capi_sent_at IS NULL;

-- 2) RPC: process_leads_capi_batch
-- Espelha process_lead_captures_batch:
--  - SECURITY DEFINER, search_path 'public','extensions','pg_temp'
--  - Marca optimisticamente (capi_sent_at=now(), capi_status='sent') ANTES de retornar payload,
--    igual ao padrão da lead_capture (que faz processed=true antes do payload).
--    Falhas CAPI são não-bloqueantes e NÃO são retentadas (mesmo trade-off da irmã).
--  - Skipped (old / no_pixel) marcados na própria RPC com capi_status apropriado e NÃO retornados.
--  - FOR UPDATE SKIP LOCKED para evitar corrida com cron concorrente.
CREATE OR REPLACE FUNCTION public.process_leads_capi_batch(p_batch_size integer DEFAULT 50)
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
    WHERE l.capi_sent_at IS NULL
    ORDER BY l.created_at ASC
    LIMIT GREATEST(p_batch_size, 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_now := now();

      -- Regra temporal: não fazer bulk retroativo
      IF ld.created_at < (v_now - interval '7 days') THEN
        UPDATE public.leads
          SET capi_sent_at = v_now, capi_status = 'skipped_old'
        WHERE id = ld.id;
        CONTINUE;
      END IF;

      -- Resolver pixel via event
      v_pixel_id := NULL;
      v_event_name := NULL;
      v_event_url := NULL;
      IF ld.event_id IS NOT NULL THEN
        SELECT NULLIF(btrim(coalesce(meta_pixel_id,'')), ''),
               name,
               ticketing_url
          INTO v_pixel_id, v_event_name, v_event_url
        FROM public.events
        WHERE id = ld.event_id
        LIMIT 1;
      END IF;

      IF v_pixel_id IS NULL THEN
        UPDATE public.leads
          SET capi_sent_at = v_now, capi_status = 'skipped_no_pixel'
        WHERE id = ld.id;
        CONTINUE;
      END IF;

      -- Resolver email/phone do contact e hashar
      v_email := NULL; v_phone := NULL;
      IF ld.contact_id IS NOT NULL THEN
        SELECT NULLIF(lower(btrim(coalesce(email,''))), ''),
               NULLIF(btrim(coalesce(phone_e164,'')), '')
          INTO v_email, v_phone
        FROM public.contacts
        WHERE id = ld.contact_id
        LIMIT 1;
      END IF;
      v_phone_digits := NULLIF(regexp_replace(coalesce(v_phone,''), '[^0-9]', '', 'g'), '');

      v_email_hash := CASE WHEN v_email IS NOT NULL
        THEN encode(extensions.digest(v_email, 'sha256'), 'hex') END;
      v_phone_hash := CASE WHEN v_phone_digits IS NOT NULL
        THEN encode(extensions.digest(v_phone_digits, 'sha256'), 'hex') END;

      -- Montar user_data (só inclui o que existe)
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

      -- Marca optimisticamente como enviado (padrão consistente com process_lead_captures_batch)
      UPDATE public.leads
        SET capi_sent_at = v_now, capi_status = 'sent'
      WHERE id = ld.id;

      RETURN NEXT jsonb_build_object('lead_id', ld.id, 'pixel_id', v_pixel_id, 'payload', v_payload);

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.leads
        SET capi_status = 'error'
      WHERE id = ld.id;
      -- não retorna payload em erro
    END;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_leads_capi_batch(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_leads_capi_batch(integer) TO service_role;
