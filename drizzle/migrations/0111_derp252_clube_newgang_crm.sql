CREATE OR REPLACE FUNCTION public._clube_newgang_assert_access()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'marketing_manager'::app_role)
    OR public.has_role(auth.uid(), 'content_manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._clube_newgang_birth(p_raw jsonb)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN (p_raw->>'birth_date') ~ '^\d{4}-\d{2}-\d{2}$'
    THEN (p_raw->>'birth_date')::date END
$$;

CREATE OR REPLACE FUNCTION public.clube_newgang_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_today date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  PERFORM public._clube_newgang_assert_access();
  WITH b AS (
    SELECT (created_at AT TIME ZONE 'Europe/Lisbon')::date AS d,
           nullif(trim(raw->>'city'),'') AS city,
           coalesce(nullif(utm_source,''),'(direto)') || ' / ' || coalesce(nullif(utm_medium,''),'—') || ' / ' || coalesce(nullif(utm_campaign,''),'—') AS utm,
           public._clube_newgang_birth(raw) AS bd
    FROM public.lead_capture
    WHERE source = 'clube_newgang' AND public.row_belongs_to_current_company(company_id)
  ), a AS (
    SELECT *, CASE WHEN bd IS NULL THEN 'sem data'
      ELSE CASE
        WHEN extract(year FROM age(v_today, bd)) < 18 THEN '<18'
        WHEN extract(year FROM age(v_today, bd)) < 25 THEN '18–24'
        WHEN extract(year FROM age(v_today, bd)) < 35 THEN '25–34'
        WHEN extract(year FROM age(v_today, bd)) < 45 THEN '35–44'
        ELSE '45+' END END AS faixa
    FROM b
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM a),
    'today', (SELECT count(*) FROM a WHERE d = v_today),
    'last7', (SELECT count(*) FROM a WHERE d > v_today - 7),
    'by_day', coalesce((SELECT jsonb_agg(jsonb_build_object('d', d, 'n', n) ORDER BY d) FROM (SELECT d, count(*) n FROM a GROUP BY d) x), '[]'::jsonb),
    'by_city', coalesce((SELECT jsonb_agg(jsonb_build_object('k', k, 'n', n) ORDER BY n DESC, k) FROM (SELECT coalesce(city,'(sem cidade)') k, count(*) n FROM a GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10) x), '[]'::jsonb),
    'by_utm', coalesce((SELECT jsonb_agg(jsonb_build_object('k', utm, 'n', n) ORDER BY n DESC, utm) FROM (SELECT utm, count(*) n FROM a GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 20) x), '[]'::jsonb),
    'by_age', (SELECT jsonb_agg(jsonb_build_object('k', f, 'n', (SELECT count(*) FROM a WHERE faixa = f)) ORDER BY o)
               FROM unnest(ARRAY['<18','18–24','25–34','35–44','45+','sem data']) WITH ORDINALITY AS t(f, o))
  ) INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.clube_newgang_list(p_search text DEFAULT NULL, p_limit int DEFAULT 50, p_offset int DEFAULT 0)
RETURNS TABLE (id uuid, name text, email text, phone text, birth_date text, city text, postal_code text,
  consent_email boolean, consent_whatsapp boolean, utm_source text, utm_medium text, utm_campaign text,
  created_at timestamptz, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._clube_newgang_assert_access();
  RETURN QUERY
  SELECT l.id, l.name, l.email, l.phone, l.raw->>'birth_date', l.raw->>'city', l.raw->>'postal_code',
    l.consent_email, l.consent_whatsapp, l.utm_source, l.utm_medium, l.utm_campaign, l.created_at,
    count(*) OVER ()
  FROM public.lead_capture l
  WHERE l.source = 'clube_newgang' AND public.row_belongs_to_current_company(l.company_id)
    AND (coalesce(trim(p_search),'') = '' OR l.name ILIKE '%'||trim(p_search)||'%' OR l.email ILIKE '%'||trim(p_search)||'%')
  ORDER BY l.created_at DESC, l.id
  LIMIT least(greatest(coalesce(p_limit,50),1),1000) OFFSET greatest(coalesce(p_offset,0),0);
END $$;

REVOKE EXECUTE ON FUNCTION public._clube_newgang_assert_access() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._clube_newgang_assert_access() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clube_newgang_summary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clube_newgang_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.clube_newgang_list(text,int,int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clube_newgang_list(text,int,int) FROM anon;
GRANT EXECUTE ON FUNCTION public._clube_newgang_assert_access() TO service_role;
GRANT EXECUTE ON FUNCTION public.clube_newgang_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.clube_newgang_list(text,int,int) TO authenticated, service_role;