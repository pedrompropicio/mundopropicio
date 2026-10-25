-- #359 ROLLBACK — NÃO APLICADO. Repõe guarda (0196) e ingestão (0169) byte-a-byte e o CHECK antigo.
-- Pára se já houver contactos form_coala_* (passá-los a legado exige autorização própria).
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.contacts WHERE consent_whatsapp_source LIKE 'form_coala\_%') THEN
  RAISE EXCEPTION 'rollback_359: existem contactos form_coala_*'; END IF;
END $$;
ALTER TABLE public.contacts DROP CONSTRAINT contacts_consent_whatsapp_source_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_consent_whatsapp_source_check
 CHECK (consent_whatsapp_source IN ('club_profile_whatsapp-v1','form_legacy_sem_prova'));
CREATE OR REPLACE FUNCTION public._crm_whatsapp_contact_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE latest record;
BEGIN
 -- Unrelated ingestion updates must not perform the unapproved historical backfill.
 IF TG_OP='UPDATE' AND (NEW.consent_whatsapp,NEW.consent_whatsapp_at,NEW.consent_whatsapp_source)
 IS NOT DISTINCT FROM (OLD.consent_whatsapp,OLD.consent_whatsapp_at,OLD.consent_whatsapp_source) THEN RETURN NEW; END IF;
 SELECT * INTO latest FROM public._crm_whatsapp_latest(NEW.id,NEW.company_id);
 IF FOUND THEN
 NEW.consent_whatsapp:=latest.decision='granted';
 NEW.consent_whatsapp_at:=CASE WHEN latest.decision='granted' THEN latest.decided_at END;
 NEW.consent_whatsapp_source:='club_profile_whatsapp-v1';
 ELSIF NEW.consent_whatsapp THEN
 NEW.consent_whatsapp_source:='form_legacy_sem_prova';
 ELSE NEW.consent_whatsapp_at:=NULL; NEW.consent_whatsapp_source:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._crm_whatsapp_contact_guard() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.crm_ingest_lead_captures(
  p_batch_size integer DEFAULT 100,
  p_only_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  MP_CO    constant uuid := '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
  COALA_CO constant uuid := '7d831e59-6e82-427b-95a0-64904aae5dd2';
  MP_SOURCES constant text[] := ARRAY['portal','vip_event_page','sticky_cta','notify_me',
    'hero_vip','newsletter_homepage','vip_hero_coupon_chip',
    'clube_newgang'];
  COALA_SOURCES constant text[] := ARRAY['coala_hero_email','coala_early_bird',
    'coala_early_bird_invite','notify_me'];
  Q_SCOPE constant text := 'quarantine#321: empresa/origem fora do âmbito da ingestão interna';
  lc record;
  v_email text; v_phone text;
  v_by_email uuid; v_by_phone uuid; v_contact_id uuid;
  v_event_id uuid; v_lead_id uuid;
  n_ok int := 0; n_contacts_new int := 0; n_leads_new int := 0;
  n_invite int := 0; n_quarantine int := 0; n_error int := 0;
  n_club int := 0; n_club_deferred int := 0; d_c int; d_l int; v_club_seen text[] := ARRAY[]::text[];
BEGIN
  WITH oos AS (
    SELECT id FROM public.lead_capture
    WHERE processed = false
      AND (p_only_ids IS NULL OR id = ANY(p_only_ids))
      AND processing_error IS DISTINCT FROM Q_SCOPE
      AND (company_id IS NULL
           OR NOT ((company_id = MP_CO AND source = ANY(MP_SOURCES))
                OR (company_id = COALA_CO AND source = ANY(COALA_SOURCES))))
    LIMIT 1000 FOR UPDATE SKIP LOCKED)
  UPDATE public.lead_capture l SET processing_error = Q_SCOPE FROM oos WHERE l.id = oos.id;
  GET DIAGNOSTICS n_quarantine = ROW_COUNT;

  FOR lc IN
    SELECT * FROM public.lead_capture
    WHERE processed = false
      AND (p_only_ids IS NULL OR id = ANY(p_only_ids))
      AND company_id IS NOT NULL
      AND ((company_id = MP_CO AND source = ANY(MP_SOURCES))
        OR (company_id = COALA_CO AND source = ANY(COALA_SOURCES)))
    ORDER BY (processing_error IS NOT NULL), created_at ASC, id ASC
    LIMIT GREATEST(p_batch_size, 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    IF lc.source = 'clube_newgang' AND NOT EXISTS (SELECT 1 FROM public.portal_sites
         WHERE brand_key = 'newgang' AND active AND company_id = lc.company_id) THEN
      UPDATE public.lead_capture SET processing_error = 'quarantine#321: clube sem site Newgang activo' WHERE id = lc.id;
      n_quarantine := n_quarantine + 1; CONTINUE;
    END IF;
    IF lc.source = 'clube_newgang' AND NULLIF(btrim(coalesce(lc.email,'')),'') IS NULL THEN
      UPDATE public.lead_capture SET processing_error = 'quarantine#321: clube sem email' WHERE id = lc.id;
      n_quarantine := n_quarantine + 1; CONTINUE;
    END IF;
    IF lc.source = 'clube_newgang' THEN
      IF lower(btrim(lc.email)) = ANY(v_club_seen) THEN
        n_club_deferred := n_club_deferred + 1; CONTINUE;
      END IF;
      v_club_seen := v_club_seen || lower(btrim(lc.email));
    END IF;

    v_email := NULLIF(lower(btrim(coalesce(lc.email, ''))), '');
    v_phone := NULLIF(btrim(coalesce(lc.phone, '')), '');
    IF v_email IS NULL AND v_phone IS NULL THEN
      UPDATE public.lead_capture SET processing_error = 'quarantine#321: sem email nem telefone'
       WHERE id = lc.id;
      n_quarantine := n_quarantine + 1;
      CONTINUE;
    END IF;

    d_c := 0; d_l := 0;
    BEGIN
      IF v_email IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('crm321:e:'||lc.company_id||':'||v_email, 0));
      END IF;
      IF v_phone IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('crm321:p:'||lc.company_id||':'||v_phone, 0));
      END IF;

      v_by_email := NULL; v_by_phone := NULL;
      IF v_email IS NOT NULL THEN
        SELECT id INTO v_by_email FROM public.contacts
         WHERE company_id = lc.company_id AND lower(btrim(email)) = v_email LIMIT 1;
      END IF;
      IF v_phone IS NOT NULL THEN
        SELECT id INTO v_by_phone FROM public.contacts
         WHERE company_id = lc.company_id AND phone_e164 = v_phone LIMIT 1;
      END IF;

      IF v_by_email IS NOT NULL AND v_by_phone IS NOT NULL AND v_by_email <> v_by_phone THEN
        RAISE EXCEPTION 'quarantine#321: email e telefone pertencem a contactos diferentes';
      END IF;
      v_contact_id := coalesce(v_by_email, v_by_phone);

      IF v_contact_id IS NOT NULL THEN
        UPDATE public.contacts SET
          email = coalesce(email, CASE WHEN v_by_email IS NULL THEN v_email END),
          phone_e164 = coalesce(phone_e164, CASE WHEN v_by_phone IS NULL THEN v_phone END),
          name = coalesce(name, NULLIF(btrim(lc.name), '')),
          last_activity_at = greatest(last_activity_at, lc.created_at),
          updated_at = now()
        WHERE id = v_contact_id;
      ELSE
        INSERT INTO public.contacts (company_id, email, phone_e164, name,
          consent_email, consent_whatsapp, consent_email_at, consent_whatsapp_at,
          source, first_seen_at, last_activity_at)
        VALUES (lc.company_id, v_email, v_phone, NULLIF(btrim(lc.name), ''),
          coalesce(lc.consent_email, false), coalesce(lc.consent_whatsapp, false),
          CASE WHEN coalesce(lc.consent_email, false) THEN lc.created_at END,
          CASE WHEN coalesce(lc.consent_whatsapp, false) THEN lc.created_at END,
          lc.source, lc.created_at, lc.created_at)
        RETURNING id INTO v_contact_id;
        d_c := 1;
      END IF;

      IF lc.source <> 'coala_early_bird_invite' THEN
        v_lead_id := NULL;
        SELECT id INTO v_lead_id FROM public.leads
         WHERE company_id = lc.company_id AND meta->>'lead_capture_id' = lc.id::text LIMIT 1;
        IF v_lead_id IS NULL THEN
          v_event_id := NULL;
          IF lc.event_slug IS NOT NULL THEN
            SELECT id INTO v_event_id FROM public.events
             WHERE company_id = lc.company_id AND slug = lc.event_slug LIMIT 1;
          END IF;
          INSERT INTO public.leads (company_id, contact_id, event_id, kind, source,
            utm_source, utm_medium, utm_campaign, utm_content,
            ip_inet, user_agent, fbc, fbp, geo_country, geo_city, geo_region,
            created_at, meta, capi_status, capi_block_reason, capi_classified_at)
          VALUES (lc.company_id, v_contact_id, v_event_id,
            CASE WHEN lc.event_slug IS NOT NULL THEN 'event_interest' ELSE 'newsletter_signup' END,
            lc.source, lc.utm_source, lc.utm_medium, lc.utm_campaign, lc.utm_content,
            lc.ip_inet, lc.user_agent, lc.fbc, lc.fbp, lc.geo_country, lc.geo_city, lc.geo_region,
            lc.created_at,
            jsonb_build_object('lead_capture_id', lc.id, 'ingested_by', 'crm_ingest_lead_captures', 'issue', 321),
            'blocked_no_consent',
            'ingestão interna #321 — sem prova de consentimento marketing por interacção; não elegível CAPI',
            now())
          RETURNING id INTO v_lead_id;
          d_l := 1;
        END IF;
      END IF;

      UPDATE public.lead_capture
         SET processed = true, processed_at = now(), processing_error = NULL
       WHERE id = lc.id;
      IF lc.source = 'clube_newgang' AND NOT EXISTS (SELECT 1 FROM public.club_members cm
           JOIN public.portal_sites ps ON ps.id = cm.site_id AND ps.brand_key = 'newgang' AND ps.company_id = lc.company_id
           WHERE lower(btrim(cm.email)) = v_email) THEN
        RAISE EXCEPTION 'clube#321: membro não criado pelo trigger do Clube';
      END IF;
      n_contacts_new := n_contacts_new + d_c; n_leads_new := n_leads_new + d_l;
      IF lc.source = 'coala_early_bird_invite' THEN n_invite := n_invite + 1; END IF;
      n_ok := n_ok + 1;
      IF lc.source = 'clube_newgang' THEN n_club := n_club + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.lead_capture SET processing_error = left(SQLERRM, 500) WHERE id = lc.id;
      IF SQLERRM LIKE 'quarantine#321:%' THEN n_quarantine := n_quarantine + 1;
      ELSE n_error := n_error + 1; END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('processed', n_ok, 'contacts_new', n_contacts_new,
    'leads_new', n_leads_new, 'invite_no_interaction', n_invite,
    'quarantine', n_quarantine, 'errors', n_error,
    'clube_processed', n_club, 'clube_deferred_same_email', n_club_deferred);
END
$function$;
REVOKE ALL ON FUNCTION public.crm_ingest_lead_captures(integer, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ingest_lead_captures(integer, uuid[]) TO service_role;

-- Migração A: colunas e tabela ficam (remover é destrutivo e exige autorização separada):
-- ALTER TABLE public.lead_capture DROP COLUMN consent_email_text_version, DROP COLUMN consent_whatsapp_text_version, DROP COLUMN consent_decided_at;
-- DROP TABLE public.consent_text_versions;
-- portal-track: redeploy do commit anterior ao passo 5.
