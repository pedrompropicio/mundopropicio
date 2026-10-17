-- #332 lista — FASE A INERTE, no delivery/config/cron changes.
CREATE OR REPLACE FUNCTION public.crm_meta_audience_collect_leads(p_audience_id uuid)
RETURNS TABLE (email text, phone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_company_id uuid;
  v_filters jsonb;
  v_event_slugs text[];
  v_sources text[];
  v_since_days int;
  v_consent text;
  v_uid uuid;
  v_service boolean;
BEGIN
  v_uid := auth.uid();
  v_service := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role';
  IF NOT v_service THEN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
    IF NOT (public.has_role(v_uid, 'admin'::app_role)
      OR public.has_role(v_uid, 'marketing_manager'::app_role)) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT a.company_id, a.filters
    INTO v_company_id, v_filters
  FROM public.meta_custom_audiences a
  WHERE a.id = p_audience_id;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'audience_not_found'; END IF;

  IF NOT v_service AND NOT public.row_belongs_to_current_company(v_company_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_filters->>'source' = 'newgang_clube:v2' THEN
    IF v_company_id <> '7c858982-6ccd-47ca-bd65-e0dd3eebf01c'::uuid THEN
      RAISE EXCEPTION 'source_company_mismatch';
    END IF;
    RETURN QUERY
    SELECT DISTINCT lower(btrim(m.email)) AS email, NULL::text AS phone
    FROM public.club_members m
    JOIN public.portal_sites s ON s.id=m.site_id AND s.company_id=m.company_id
    JOIN public.club_member_profiles p ON p.member_id=m.id AND p.site_id=s.id AND p.company_id=m.company_id
    JOIN LATERAL (
      SELECT ev.id,ev.subject_id,ev.company_id,ev.portal,ev.purpose,ev.state,ev.banner_version,ev.revision
      FROM public.club_member_marketing_consents l JOIN public.marketing_consent_events ev ON ev.id=l.event_id
      WHERE l.member_id=m.id AND l.site_id=s.id AND l.company_id=m.company_id AND l.purpose='meta_ads'
        AND ev.subject_id=l.subject_id AND ev.company_id=l.company_id AND ev.portal='newgang' AND ev.purpose='meta_ads'
      ORDER BY ev.revision DESC,ev.id DESC LIMIT 1
    ) consent ON true
    JOIN LATERAL public.marketing_consent_effective(consent.subject_id,statement_timestamp()) effective
      ON effective.event_id=consent.id AND effective.valid_grant
    WHERE m.company_id=v_company_id AND s.domain='newgangfestival.pt' AND s.brand_key='newgang' AND s.active
      AND m.confirmed_at IS NOT NULL
      AND p.birth_date IS NOT NULL AND isfinite(p.birth_date)
      AND p.birth_date <= ((statement_timestamp() AT TIME ZONE 'Europe/Lisbon')::date-interval '13 years')::date
      AND consent.state='granted' AND consent.banner_version='anuncios-v1'
      AND NOT EXISTS(SELECT 1 FROM public.marketing_consent_events newer WHERE newer.subject_id=consent.subject_id AND newer.revision>consent.revision)
      AND length(lower(btrim(m.email))) BETWEEN 3 AND 254
      AND lower(btrim(m.email)) ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
      AND NOT EXISTS(SELECT 1 FROM public.suppressed_emails se WHERE lower(btrim(se.email))=lower(btrim(m.email))
        AND (se.company_id IS NULL OR se.company_id=v_company_id));
    RETURN;
  END IF;

  IF v_filters->>'source' = 'coala_list:eb2027' THEN
    IF v_company_id <> '7d831e59-6e82-427b-95a0-64904aae5dd2'::uuid THEN
      RAISE EXCEPTION 'source_company_mismatch';
    END IF;
    RETURN QUERY
    SELECT m.email, identity_capture.phone
    FROM (SELECT DISTINCT lower(btrim(cm.email)) AS email
          FROM public.coala_list_members cm
          WHERE nullif(btrim(cm.email), '') IS NOT NULL) m
    LEFT JOIN LATERAL (
      SELECT c.marketing_opt_in
      FROM public.coala_list_consents c
      WHERE c.company_id = v_company_id AND lower(btrim(c.email)) = m.email
      ORDER BY c.created_at DESC, c.id DESC LIMIT 1
    ) consent ON true
    LEFT JOIN LATERAL (
      SELECT lc.consent_email
      FROM public.lead_capture lc
      WHERE lc.company_id = v_company_id AND lower(btrim(lc.email)) = m.email
      ORDER BY lc.created_at DESC, lc.id DESC LIMIT 1
    ) latest_capture ON true
    LEFT JOIN LATERAL (
      SELECT nullif(btrim(lc.phone), '') AS phone
      FROM public.lead_capture lc
      WHERE lc.company_id = v_company_id AND lower(btrim(lc.email)) = m.email
      ORDER BY (nullif(btrim(lc.phone), '') IS NOT NULL) DESC, lc.created_at DESC, lc.id DESC LIMIT 1
    ) identity_capture ON true
    WHERE coalesce(consent.marketing_opt_in, latest_capture.consent_email, false)
      AND NOT EXISTS (
        SELECT 1 FROM public.suppressed_emails se
        WHERE lower(btrim(se.email)) = m.email
          AND (se.company_id IS NULL OR se.company_id = v_company_id)
      );
    RETURN;
  END IF;

  v_event_slugs := CASE WHEN jsonb_typeof(v_filters->'event_slugs') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(v_filters->'event_slugs')) ELSE NULL END;
  v_sources := CASE WHEN jsonb_typeof(v_filters->'sources') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(v_filters->'sources')) ELSE NULL END;
  v_since_days := nullif(v_filters->>'since_days','')::int;
  v_consent := v_filters->>'consent_required';

  RETURN QUERY
  SELECT DISTINCT lc.email, lc.phone
  FROM public.lead_capture lc
  JOIN public.events e ON e.slug = lc.event_slug
  WHERE e.company_id = v_company_id
    AND (lc.email IS NOT NULL OR lc.phone IS NOT NULL)
    AND (v_event_slugs IS NULL OR array_length(v_event_slugs,1) IS NULL OR lc.event_slug = ANY(v_event_slugs))
    AND (v_sources IS NULL OR array_length(v_sources,1) IS NULL OR lc.source = ANY(v_sources))
    AND (v_since_days IS NULL OR lc.created_at >= now() - (v_since_days || ' days')::interval)
    AND (
      v_consent IS NULL OR v_consent = ''
      OR (v_consent = 'email' AND lc.consent_email = true)
      OR (v_consent = 'whatsapp' AND lc.consent_whatsapp = true)
      OR (v_consent = 'any' AND (lc.consent_email = true OR lc.consent_whatsapp = true))
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_meta_audience_collect_leads(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_meta_audience_collect_leads(uuid) TO authenticated, service_role;
