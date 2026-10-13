-- D-ERP259: o papel 'user' (criado automaticamente por handle_new_user em cada conta nova)
-- não dá acesso aos artistas da empresa. Sem isto, um convidado (artista/empresário)
-- veria todos os artistas da empresa.
CREATE OR REPLACE FUNCTION public.artist_access_check(p_artist_id uuid, p_need text DEFAULT 'read', p_area text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_company uuid; v_role text; a record;
BEGIN
  IF p_need NOT IN ('read','traffic_write','admin') THEN RAISE EXCEPTION 'p_need inválido'; END IF;
  SELECT company_id INTO v_company FROM public.artists WHERE id = p_artist_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'artista inexistente ou sem empresa' USING ERRCODE='42501'; END IF;
  IF v_uid IS NULL THEN
    IF coalesce(auth.role(),'') = 'service_role' OR session_user IN ('postgres','supabase_admin') THEN RETURN v_company; END IF;
    RAISE EXCEPTION 'sessão obrigatória' USING ERRCODE='42501';
  END IF;
  IF public.has_role(v_uid,'platform_admin'::app_role) THEN RETURN v_company; END IF;
  SELECT CASE WHEN bool_or(role='admin') THEN 'admin'
              WHEN bool_or(role IN ('manager','marketing_manager')) THEN 'traffic'
              WHEN count(*) > 0 THEN 'read' END
    INTO v_role FROM public.user_roles
   WHERE user_id = v_uid AND company_id = v_company AND role <> 'user';
  IF v_role = 'admin' THEN RETURN v_company; END IF;
  IF v_role = 'traffic' AND p_need IN ('read','traffic_write') THEN RETURN v_company; END IF;
  IF v_role = 'read' AND p_need = 'read' THEN RETURN v_company; END IF;
  SELECT access_level, areas INTO a FROM public.artist_user_access
   WHERE user_id = v_uid AND artist_id = p_artist_id AND revoked_at IS NULL;
  IF FOUND THEN
    IF p_need = 'read' AND (p_area IS NULL OR p_area = ANY(a.areas) OR (a.access_level='traffic_manager' AND p_area='traffic')) THEN RETURN v_company; END IF;
    IF p_need = 'traffic_write' AND a.access_level = 'traffic_manager' THEN RETURN v_company; END IF;
  END IF;
  RAISE EXCEPTION 'sem acesso a este artista' USING ERRCODE='42501';
END $$;

CREATE OR REPLACE FUNCTION public.my_artist_access()
RETURNS TABLE(artist_id uuid, artist_name text, company_id uuid, access_level text, areas text[], source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() uid),
  pa AS (SELECT public.has_role((SELECT uid FROM me),'platform_admin'::app_role) is_pa),
  co AS (
    SELECT ur.company_id,
      CASE WHEN bool_or(ur.role='admin') THEN 'admin'
           WHEN bool_or(ur.role IN ('manager','marketing_manager')) THEN 'traffic_manager'
           ELSE 'viewer' END lvl
    FROM public.user_roles ur
    WHERE ur.user_id=(SELECT uid FROM me) AND ur.company_id IS NOT NULL AND ur.role <> 'user' GROUP BY 1)
  SELECT a.id, a.name, a.company_id,
         CASE WHEN (SELECT is_pa FROM pa) THEN 'admin' WHEN co.lvl IS NOT NULL THEN co.lvl ELSE x.access_level END,
         CASE WHEN (SELECT is_pa FROM pa) OR co.lvl IS NOT NULL
              THEN ARRAY['overview','channels','traffic','financial','reports','songs','content'] ELSE x.areas END,
         CASE WHEN (SELECT is_pa FROM pa) THEN 'platform_admin' WHEN co.lvl IS NOT NULL THEN 'company_role' ELSE 'assignment' END
  FROM public.artists a
  LEFT JOIN co ON co.company_id=a.company_id
  LEFT JOIN public.artist_user_access x ON x.artist_id=a.id AND x.user_id=(SELECT uid FROM me) AND x.revoked_at IS NULL
  WHERE (SELECT is_pa FROM pa) OR co.lvl IS NOT NULL OR x.id IS NOT NULL
  ORDER BY a.name;
$$;