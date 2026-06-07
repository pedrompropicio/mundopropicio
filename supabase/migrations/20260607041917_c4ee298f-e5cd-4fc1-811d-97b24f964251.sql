CREATE OR REPLACE FUNCTION public.crm_meta_capi_dashboard(p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_company_id uuid;
  v_token text;
  v_token_status text;
  v_uid uuid := auth.uid();
BEGIN
  v_company_id := public.current_company_id();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No active company';
  END IF;
  IF NOT (public.has_role(v_uid,'admin'::app_role)
       OR public.has_role(v_uid,'marketing_manager'::app_role)
       OR public.has_role(v_uid,'platform_admin'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  BEGIN
    v_token := public.get_vault_secret('META_CAPI_ACCESS_TOKEN');
    v_token_status := CASE WHEN v_token IS NULL OR length(v_token) < 50
                           THEN 'missing_or_invalid' ELSE 'configured' END;
  EXCEPTION WHEN OTHERS THEN
    v_token_status := 'missing_or_invalid';
  END;

  RETURN jsonb_build_object(
    'token_status', v_token_status,
    'period_days', p_days,
    'generated_at', now(),
    'stats_leads', (
      SELECT jsonb_build_object(
        'total',   COUNT(*),
        'sent_ok', COUNT(*) FILTER (WHERE lc.processed AND lc.processing_error IS NULL),
        'errors',  COUNT(*) FILTER (WHERE lc.processing_error IS NOT NULL),
        'pending', COUNT(*) FILTER (WHERE NOT lc.processed AND lc.processing_error IS NULL)
      )
      FROM public.lead_capture lc
      LEFT JOIN public.events e ON e.slug = lc.event_slug AND e.company_id = v_company_id
      WHERE lc.created_at >= now() - (p_days || ' days')::interval
        AND (e.id IS NOT NULL OR lc.event_slug IS NULL)
    ),
    'stats_redirects', (
      SELECT jsonb_build_object(
        'total',   COUNT(*),
        'sent_ok', COUNT(*) FILTER (WHERE rl.processed),
        'pending', COUNT(*) FILTER (WHERE NOT rl.processed)
      )
      FROM public.redirect_log rl
      JOIN public.events e ON e.slug = rl.event_slug AND e.company_id = v_company_id
      WHERE rl.created_at >= now() - (p_days || ' days')::interval
    ),
    'events_pixel_status', (
      SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'date') DESC NULLS LAST), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id', e.id,
          'slug', e.slug,
          'name', e.name,
          'date', e.date,
          'meta_pixel_id', e.meta_pixel_id,
          'has_pixel', e.meta_pixel_id IS NOT NULL AND e.meta_pixel_id <> '',
          'leads_period', (
            SELECT COUNT(*) FROM public.lead_capture
            WHERE event_slug = e.slug
              AND created_at >= now() - (p_days || ' days')::interval
          )
        ) AS row
        FROM public.events e
        WHERE e.company_id = v_company_id
          AND e.portal_visible = true
          AND e.date >= (now() - interval '60 days')::date
      ) t
    ),
    'recent_errors', (
      SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'created_at') DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id', lc.id,
          'event_slug', lc.event_slug,
          'source', lc.source,
          'client_event_id', lc.client_event_id,
          'created_at', lc.created_at,
          'processing_error', LEFT(lc.processing_error, 400)
        ) AS row
        FROM public.lead_capture lc
        LEFT JOIN public.events e ON e.slug = lc.event_slug AND e.company_id = v_company_id
        WHERE lc.processing_error IS NOT NULL
          AND lc.created_at >= now() - (p_days || ' days')::interval
          AND (e.id IS NOT NULL OR lc.event_slug IS NULL)
        ORDER BY lc.created_at DESC
        LIMIT 50
      ) t
    ),
    'recent_sent', (
      SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'processed_at') DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id', lc.id,
          'event_slug', lc.event_slug,
          'source', lc.source,
          'client_event_id', lc.client_event_id,
          'created_at', lc.created_at,
          'processed_at', lc.processed_at
        ) AS row
        FROM public.lead_capture lc
        LEFT JOIN public.events e ON e.slug = lc.event_slug AND e.company_id = v_company_id
        WHERE lc.processed = true
          AND lc.processing_error IS NULL
          AND lc.created_at >= now() - (p_days || ' days')::interval
          AND (e.id IS NOT NULL OR lc.event_slug IS NULL)
        ORDER BY lc.processed_at DESC NULLS LAST
        LIMIT 50
      ) t
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_meta_capi_dashboard(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_meta_capi_dashboard(int) TO authenticated;