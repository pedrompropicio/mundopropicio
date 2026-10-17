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
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  -- Allow service_role (cron) or admin/marketing_manager
  IF NOT (
    (SELECT current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role'
    OR public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'marketing_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT a.company_id, a.filters
    INTO v_company_id, v_filters
  FROM public.meta_custom_audiences a
  WHERE a.id = p_audience_id;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'audience_not_found'; END IF;

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

REVOKE EXECUTE ON FUNCTION public.crm_meta_audience_collect_leads(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_meta_audience_collect_leads(uuid) TO authenticated, service_role;
