CREATE OR REPLACE FUNCTION public.get_leads_geo_stats(p_period text DEFAULT 'all')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_since timestamptz := NULL;
  v_total int := 0;
  v_by_country jsonb;
  v_by_city jsonb;
BEGIN
  IF v_company IS NULL THEN
    RETURN jsonb_build_object('total', 0, 'by_country', '[]'::jsonb, 'by_city', '[]'::jsonb);
  END IF;

  IF p_period = '30d' THEN
    v_since := now() - interval '30 days';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.leads l
  WHERE l.company_id = v_company
    AND (v_since IS NULL OR l.created_at >= v_since);

  SELECT coalesce(jsonb_agg(jsonb_build_object('key', key, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_by_country
  FROM (
    SELECT
      CASE WHEN l.geo_country IS NULL OR btrim(l.geo_country) = '' THEN '__none__'
           ELSE upper(btrim(l.geo_country)) END AS key,
      count(*)::int AS cnt
    FROM public.leads l
    WHERE l.company_id = v_company
      AND (v_since IS NULL OR l.created_at >= v_since)
    GROUP BY 1
  ) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object('key', key, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO v_by_city
  FROM (
    SELECT
      CASE WHEN l.geo_city IS NULL OR btrim(l.geo_city) = '' THEN '__none__'
           ELSE btrim(l.geo_city) END AS key,
      count(*)::int AS cnt
    FROM public.leads l
    WHERE l.company_id = v_company
      AND (v_since IS NULL OR l.created_at >= v_since)
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'total', v_total,
    'by_country', v_by_country,
    'by_city', v_by_city
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_leads_geo_stats(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leads_geo_stats(text) TO authenticated;
