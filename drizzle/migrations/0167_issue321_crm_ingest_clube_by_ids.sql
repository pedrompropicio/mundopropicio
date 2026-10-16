-- #321 (continuação) — ingestão MANUAL de capturas clube_newgang por IDs explícitos.
-- Mantém clube_newgang fora do consumidor contínuo (0166). Ao marcar processed=true
-- dispara o fluxo normal do Clube (trg_club_from_lead_capture -> membro + confirmação).
-- Sem payload Meta; leads novos nascem blocked_no_consent; consentimentos intactos.
CREATE OR REPLACE FUNCTION public.crm_ingest_clube_captures_by_ids(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  MP_CO constant uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
  lc record; v_email text; v_contact_id uuid; v_n int; v_event_id uuid; v_lead_id uuid;
  res jsonb := '[]'::jsonb;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 OR cardinality(p_ids) > 10 THEN
    RAISE EXCEPTION 'p_ids obrigatório (1..10 IDs explícitos)';
  END IF;
  FOR lc IN
    SELECT * FROM public.lead_capture WHERE id = ANY(p_ids) ORDER BY created_at, id FOR UPDATE
  LOOP
    IF lc.processed OR lc.source IS DISTINCT FROM 'clube_newgang' OR lc.company_id IS DISTINCT FROM MP_CO THEN
      res := res || jsonb_build_object('id', lc.id, 'result', 'skip_fora_de_ambito_ou_ja_processado');
      CONTINUE;
    END IF;
    v_email := NULLIF(lower(btrim(coalesce(lc.email,''))), '');
    IF v_email IS NULL THEN
      res := res || jsonb_build_object('id', lc.id, 'result', 'skip_sem_email');
      CONTINUE;
    END IF;
    SELECT count(*), min(id::text)::uuid INTO v_n, v_contact_id FROM public.contacts
     WHERE company_id = MP_CO AND lower(btrim(email)) = v_email;
    IF v_n > 1 THEN
      res := res || jsonb_build_object('id', lc.id, 'result', 'skip_identidade_ambigua');
      CONTINUE;
    END IF;
    BEGIN
      IF v_contact_id IS NOT NULL THEN
        UPDATE public.contacts SET
          name = coalesce(name, NULLIF(btrim(lc.name), '')),
          last_activity_at = greatest(last_activity_at, lc.created_at),
          updated_at = now()
        WHERE id = v_contact_id;
      ELSE
        INSERT INTO public.contacts (company_id, email, name, consent_email, consent_whatsapp,
          consent_email_at, consent_whatsapp_at, source, first_seen_at, last_activity_at)
        VALUES (MP_CO, v_email, NULLIF(btrim(lc.name), ''), coalesce(lc.consent_email,false),
          coalesce(lc.consent_whatsapp,false),
          CASE WHEN coalesce(lc.consent_email,false) THEN lc.created_at END,
          CASE WHEN coalesce(lc.consent_whatsapp,false) THEN lc.created_at END,
          lc.source, lc.created_at, lc.created_at)
        RETURNING id INTO v_contact_id;
      END IF;
      SELECT id INTO v_lead_id FROM public.leads WHERE meta->>'lead_capture_id' = lc.id::text LIMIT 1;
      IF v_lead_id IS NULL THEN
        v_event_id := NULL;
        IF lc.event_slug IS NOT NULL THEN
          SELECT id INTO v_event_id FROM public.events WHERE company_id = MP_CO AND slug = lc.event_slug LIMIT 1;
        END IF;
        INSERT INTO public.leads (company_id, contact_id, event_id, kind, source,
          utm_source, utm_medium, utm_campaign, utm_content, ip_inet, user_agent, fbc, fbp,
          geo_country, geo_city, geo_region, created_at, meta, capi_status, capi_block_reason, capi_classified_at)
        VALUES (MP_CO, v_contact_id, v_event_id,
          CASE WHEN lc.event_slug IS NOT NULL THEN 'event_interest' ELSE 'newsletter_signup' END,
          lc.source, lc.utm_source, lc.utm_medium, lc.utm_campaign, lc.utm_content,
          lc.ip_inet, lc.user_agent, lc.fbc, lc.fbp, lc.geo_country, lc.geo_city, lc.geo_region,
          lc.created_at,
          jsonb_build_object('lead_capture_id', lc.id, 'ingested_by', 'crm_ingest_clube_captures_by_ids', 'issue', 321),
          'blocked_no_consent',
          'ingestão interna #321 — sem prova de consentimento marketing por interacção; não elegível CAPI',
          now())
        RETURNING id INTO v_lead_id;
      END IF;
      -- Dispara o fluxo normal do Clube (membro + confirmação existente).
      UPDATE public.lead_capture SET processed = true, processed_at = now(), processing_error = NULL
       WHERE id = lc.id;
      res := res || jsonb_build_object('id', lc.id, 'result', 'processed', 'contact_id', v_contact_id, 'lead_id', v_lead_id);
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.lead_capture SET processing_error = left(SQLERRM, 500) WHERE id = lc.id;
      res := res || jsonb_build_object('id', lc.id, 'result', 'error');
    END;
  END LOOP;
  RETURN res;
END
$function$;

REVOKE ALL ON FUNCTION public.crm_ingest_clube_captures_by_ids(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ingest_clube_captures_by_ids(uuid[]) TO service_role;