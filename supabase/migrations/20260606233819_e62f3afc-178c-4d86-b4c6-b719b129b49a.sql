CREATE OR REPLACE FUNCTION public.list_endorsable_events(
  p_portal_company_id UUID,
  p_search TEXT DEFAULT NULL,
  p_company_filter UUID DEFAULT NULL,
  p_hide_past BOOLEAN DEFAULT TRUE,
  p_limit INT DEFAULT 500
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  date DATE,
  status TEXT,
  company_id UUID,
  hero_image_url TEXT,
  company_display_name TEXT,
  company_legal_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN ('admin','platform_admin','marketing_manager')
  ) THEN
    RAISE EXCEPTION 'forbidden: requires admin / platform_admin / marketing_manager';
  END IF;

  IF p_portal_company_id IS NULL THEN
    RAISE EXCEPTION 'p_portal_company_id obrigatório';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.date,
    e.status,
    e.company_id,
    e.hero_image_url,
    c.display_name AS company_display_name,
    c.legal_name AS company_legal_name
  FROM public.events e
  LEFT JOIN public.companies c ON c.id = e.company_id
  WHERE e.company_id <> p_portal_company_id
    AND NOT EXISTS (
      SELECT 1 FROM public.event_portal_endorsements ep
      WHERE ep.event_id = e.id
        AND ep.portal_company_id = p_portal_company_id
    )
    AND (
      p_search IS NULL OR p_search = ''
      OR e.name ILIKE '%' || p_search || '%'
    )
    AND (
      p_company_filter IS NULL
      OR e.company_id = p_company_filter
    )
    AND (
      NOT p_hide_past
      OR (
        (e.status IS NULL OR LOWER(e.status) NOT IN ('completed','archived','cancelled'))
        AND (e.date IS NULL OR e.date >= CURRENT_DATE)
      )
    )
  ORDER BY e.date DESC NULLS LAST, e.name ASC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_endorsable_events(UUID, TEXT, UUID, BOOLEAN, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_endorsable_events(UUID, TEXT, UUID, BOOLEAN, INT) TO authenticated;

COMMENT ON FUNCTION public.list_endorsable_events IS
  'Lista events de outras companies como candidatos a endorsement no portal de p_portal_company_id. SECURITY DEFINER porque a RLS restrictive de events bloqueia SELECT cross-company. Requer role admin / platform_admin / marketing_manager.';

CREATE OR REPLACE FUNCTION public.list_endorsable_companies(
  p_portal_company_id UUID
)
RETURNS TABLE (id UUID, display_name TEXT, legal_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN ('admin','platform_admin','marketing_manager')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_portal_company_id IS NULL THEN
    RAISE EXCEPTION 'p_portal_company_id obrigatório';
  END IF;

  RETURN QUERY
  SELECT DISTINCT c.id, c.display_name, c.legal_name
  FROM public.events e
  JOIN public.companies c ON c.id = e.company_id
  WHERE e.company_id <> p_portal_company_id
  ORDER BY c.display_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_endorsable_companies(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_endorsable_companies(UUID) TO authenticated;