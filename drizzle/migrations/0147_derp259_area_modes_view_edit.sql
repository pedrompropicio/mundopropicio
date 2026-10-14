-- D-ERP259 adenda (14/10/2026, Pedro): Ver/Editar por área no acesso por artista.
ALTER TABLE public.artist_user_access ADD COLUMN IF NOT EXISTS area_modes jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.artist_user_access.area_modes IS 'Por área: "view" ou "edit". Área ausente = sem acesso. Fonte de verdade desde D-ERP259 adenda; areas/access_level mantidos por compatibilidade.';

UPDATE public.artist_user_access x SET area_modes = (
  SELECT coalesce(jsonb_object_agg(ar, CASE WHEN x.access_level='traffic_manager' AND ar='traffic' THEN 'edit' ELSE 'view' END), '{}'::jsonb)
  FROM unnest(x.areas || CASE WHEN x.access_level='traffic_manager' THEN ARRAY['traffic'] ELSE ARRAY[]::text[] END) ar)
WHERE area_modes = '{}'::jsonb;

CREATE OR REPLACE FUNCTION public._artist_user_access_sync_modes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.area_modes IS NULL OR NEW.area_modes = '{}'::jsonb THEN
    SELECT coalesce(jsonb_object_agg(ar, CASE WHEN NEW.access_level='traffic_manager' AND ar='traffic' THEN 'edit' ELSE 'view' END), '{}'::jsonb)
      INTO NEW.area_modes
      FROM unnest(NEW.areas || CASE WHEN NEW.access_level='traffic_manager' THEN ARRAY['traffic'] ELSE ARRAY[]::text[] END) ar;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(NEW.area_modes) e
             WHERE e.key <> ALL(ARRAY['overview','channels','traffic','financial','reports','songs','content'])
                OR e.value NOT IN ('view','edit')) THEN
    RAISE EXCEPTION 'area_modes inválido';
  END IF;
  NEW.areas := ARRAY(SELECT jsonb_object_keys(NEW.area_modes));
  NEW.access_level := CASE WHEN NEW.area_modes->>'traffic' = 'edit' THEN 'traffic_manager' ELSE 'viewer' END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS artist_user_access_modes ON public.artist_user_access;
CREATE TRIGGER artist_user_access_modes BEFORE INSERT OR UPDATE ON public.artist_user_access
  FOR EACH ROW EXECUTE FUNCTION public._artist_user_access_sync_modes();

CREATE OR REPLACE FUNCTION public.artist_access_check(p_artist_id uuid, p_need text DEFAULT 'read', p_area text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_company uuid; v_role text; m jsonb;
BEGIN
  IF p_need NOT IN ('read','write','traffic_write','admin') THEN RAISE EXCEPTION 'p_need inválido'; END IF;
  IF p_need = 'write' AND p_area IS NULL THEN RAISE EXCEPTION 'write exige área'; END IF;
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
  IF v_role = 'traffic' AND (p_need IN ('read','traffic_write') OR (p_need='write' AND p_area='traffic')) THEN RETURN v_company; END IF;
  IF v_role = 'read' AND p_need = 'read' THEN RETURN v_company; END IF;
  SELECT area_modes INTO m FROM public.artist_user_access
   WHERE user_id = v_uid AND artist_id = p_artist_id AND revoked_at IS NULL;
  IF FOUND THEN
    IF p_need = 'read' AND (p_area IS NULL OR m ? p_area) THEN RETURN v_company; END IF;
    IF p_need = 'write' AND m->>p_area = 'edit' THEN RETURN v_company; END IF;
    IF p_need = 'traffic_write' AND m->>'traffic' = 'edit' THEN RETURN v_company; END IF;
  END IF;
  RAISE EXCEPTION 'sem acesso a este artista' USING ERRCODE='42501';
END $$;

CREATE OR REPLACE FUNCTION public.artist_access_grant_modes(p_user_id uuid, p_artist_id uuid, p_area_modes jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.artist_access_check(p_artist_id,'admin');
  IF p_area_modes IS NULL OR p_area_modes = '{}'::jsonb THEN RAISE EXCEPTION 'pelo menos uma área'; END IF;
  INSERT INTO public.artist_user_access(user_id,artist_id,company_id,access_level,areas,area_modes,granted_by)
  VALUES (p_user_id,p_artist_id,'00000000-0000-0000-0000-000000000000','viewer',ARRAY['overview'],p_area_modes,auth.uid())
  ON CONFLICT (user_id,artist_id) DO UPDATE SET area_modes=EXCLUDED.area_modes,
    granted_by=EXCLUDED.granted_by, granted_at=now(), revoked_at=NULL
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.artist_access_grant_modes(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_access_grant_modes(uuid,uuid,jsonb) TO authenticated, service_role;

-- Ver/Editar por área para o ecrã (sem mudar o formato de my_artist_access).
CREATE OR REPLACE FUNCTION public.my_artist_area_modes()
RETURNS TABLE(artist_id uuid, area_modes jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.artist_id,
    CASE
      WHEN a.source <> 'assignment' AND a.access_level = 'admin'
        THEN '{"overview":"edit","channels":"edit","traffic":"edit","financial":"edit","reports":"edit","songs":"edit","content":"edit"}'::jsonb
      WHEN a.source <> 'assignment' AND a.access_level = 'traffic_manager'
        THEN '{"overview":"view","channels":"view","traffic":"edit","financial":"view","reports":"view","songs":"view","content":"view"}'::jsonb
      WHEN a.source <> 'assignment'
        THEN '{"overview":"view","channels":"view","traffic":"view","financial":"view","reports":"view","songs":"view","content":"view"}'::jsonb
      ELSE (SELECT x.area_modes FROM public.artist_user_access x
             WHERE x.artist_id = a.artist_id AND x.user_id = auth.uid() AND x.revoked_at IS NULL)
    END
  FROM public.my_artist_access() a;
$$;
REVOKE ALL ON FUNCTION public.my_artist_area_modes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_artist_area_modes() TO authenticated;