-- D-ERP259 fase 1 — aprovado pelo Pedro em 13/10/2026
-- Utilizadores e permissões da app Gestão Artística.

CREATE TABLE public.artist_user_access (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  artist_id    uuid NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id),
  access_level text NOT NULL CHECK (access_level IN ('viewer','traffic_manager')),
  areas        text[] NOT NULL DEFAULT ARRAY['overview']::text[]
               CHECK (areas <@ ARRAY['overview','channels','traffic','financial','reports','songs','content']::text[]),
  granted_by   uuid,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  UNIQUE (user_id, artist_id)
);
CREATE INDEX artist_user_access_user_idx ON public.artist_user_access(user_id) WHERE revoked_at IS NULL;
CREATE INDEX artist_user_access_artist_idx ON public.artist_user_access(artist_id) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public._artist_user_access_set_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT company_id INTO NEW.company_id FROM public.artists WHERE id = NEW.artist_id;
  IF NEW.company_id IS NULL THEN RAISE EXCEPTION 'artista sem empresa'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER artist_user_access_company BEFORE INSERT OR UPDATE ON public.artist_user_access
  FOR EACH ROW EXECUTE FUNCTION public._artist_user_access_set_company();

GRANT SELECT ON public.artist_user_access TO authenticated;
GRANT ALL ON public.artist_user_access TO service_role;
ALTER TABLE public.artist_user_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY artist_user_access_select ON public.artist_user_access FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR public.has_role(auth.uid(),'platform_admin'::app_role)
         OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                    AND ur.company_id = artist_user_access.company_id AND ur.role = 'admin'));

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
    INTO v_role FROM public.user_roles WHERE user_id = v_uid AND company_id = v_company;
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
REVOKE ALL ON FUNCTION public.artist_access_check(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_access_check(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.artist_access_ok(p_artist_id uuid, p_need text DEFAULT 'read', p_area text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.artist_access_check(p_artist_id,p_need,p_area); RETURN true;
EXCEPTION WHEN insufficient_privilege THEN RETURN false; END $$;
REVOKE ALL ON FUNCTION public.artist_access_ok(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_access_ok(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.artist_ads_assert_access(p_artist_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT public.artist_access_check(p_artist_id,'read',NULL) $$;

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
    FROM public.user_roles ur WHERE ur.user_id=(SELECT uid FROM me) AND ur.company_id IS NOT NULL GROUP BY 1)
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
REVOKE ALL ON FUNCTION public.my_artist_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_artist_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.artist_access_grant(p_user_id uuid, p_artist_id uuid, p_level text, p_areas text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.artist_access_check(p_artist_id,'admin');
  INSERT INTO public.artist_user_access(user_id,artist_id,company_id,access_level,areas,granted_by)
  VALUES (p_user_id,p_artist_id,'00000000-0000-0000-0000-000000000000',p_level,coalesce(p_areas,ARRAY['overview']),auth.uid())
  ON CONFLICT (user_id,artist_id) DO UPDATE SET access_level=EXCLUDED.access_level, areas=EXCLUDED.areas,
    granted_by=EXCLUDED.granted_by, granted_at=now(), revoked_at=NULL
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.artist_access_revoke(p_user_id uuid, p_artist_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.artist_access_check(p_artist_id,'admin');
  UPDATE public.artist_user_access SET revoked_at=now() WHERE user_id=p_user_id AND artist_id=p_artist_id AND revoked_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.artist_access_grant(uuid,uuid,text,text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artist_access_revoke(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_access_grant(uuid,uuid,text,text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_access_revoke(uuid,uuid) TO authenticated, service_role;

DO $do$
DECLARE r record; f record; d text; d0 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('artist_ads_ads','read','traffic'),
    ('artist_ads_alerts','read','traffic'),
    ('artist_ads_breakdowns','read','traffic'),
    ('artist_ads_budget_cap_get','read','traffic'),
    ('artist_ads_campaign_goal_list','read','traffic'),
    ('artist_ads_campaign_settings','read','traffic'),
    ('artist_ads_campaigns','read','traffic'),
    ('artist_ads_creatives','read','traffic'),
    ('artist_ads_daily','read','traffic'),
    ('artist_ads_period_report','read','traffic'),
    ('artist_ads_plan_get','read','traffic'),
    ('artist_ads_plan_list','read','traffic'),
    ('artist_ads_promotable_posts','read','traffic'),
    ('artist_ads_sync_status','read','traffic'),
    ('artist_ads_investment_report','read','financial'),
    ('artist_dashboard','read','overview'),
    ('artist_top_videos_gain','read','channels'),
    ('song_growth_summary','read','songs'),
    ('artist_song_link_stats','read','songs'),
    ('_artist_ads_investment_source','read',NULL),
    ('_song_growth_summary_initial','read',NULL),
    ('artist_ads_autolink_songs','traffic_write',NULL),
    ('artist_ads_set_link_kind','traffic_write',NULL),
    ('artist_ads_unlink_song','traffic_write',NULL),
    ('artist_ads_campaign_goal_upsert','traffic_write',NULL),
    ('artist_ads_plan_create','traffic_write',NULL),
    ('artist_ads_plan_update','traffic_write',NULL),
    ('artist_song_link_list','traffic_write',NULL),
    ('artist_song_link_upsert','traffic_write',NULL)
  ) v(fn, need, area) LOOP
    FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = r.fn AND p.prokind = 'f' LOOP
      d0 := pg_get_functiondef(f.oid);
      d := regexp_replace(d0, 'public\.artist_ads_assert_access\(([^)]*)\)',
             'public.artist_access_check(\1,' || quote_literal(r.need) || ',' || coalesce(quote_literal(r.area),'NULL') || ')', 'g');
      d := regexp_replace(d, '\n\s*PERFORM public\.artist_ads_assert_write\(v_company\);', '', 'g');
      IF d = d0 OR d ~ 'artist_ads_assert_' THEN RAISE EXCEPTION 'D-ERP259: reescrita falhou em %', r.fn; END IF;
      EXECUTE d;
    END LOOP;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('artist_ads_budget_cap_remove','DECLARE v_company uuid;','DECLARE v_company uuid; v_artist uuid;'),
    ('artist_ads_budget_cap_remove','SELECT company_id INTO v_company FROM','SELECT company_id, artist_id INTO v_company, v_artist FROM'),
    ('artist_ads_budget_cap_remove','PERFORM public.artist_ads_assert_cap_admin(v_company);','PERFORM public.artist_access_check(v_artist,''admin'',NULL);'),
    ('artist_ads_budget_cap_set','PERFORM public.artist_ads_assert_cap_admin(v_conn.company_id);','PERFORM public.artist_access_check(v_conn.artist_id,''admin'',NULL);'),
    ('artist_ads_connections','AND (auth.uid() IS NULL
          OR public.user_has_company_access(a.company_id, ARRAY[''admin'',''manager'',''marketing_manager'']::public.app_role[]))','AND public.artist_access_ok(a.id,''read'',''traffic'')'),
    ('artist_ads_link_song','IF v_uid IS NOT NULL AND NOT public.user_has_company_access(v_company, ARRAY[''admin'',''manager'',''marketing_manager'']::public.app_role[]) THEN','IF NOT public.artist_access_ok((SELECT s.artist_id FROM public.artist_songs s WHERE s.id = p_song_id),''traffic_write'',NULL) THEN'),
    ('artist_ads_set_market_country','(v_uid IS NULL OR public.user_has_company_access(x.company_id, ARRAY[''admin'',''manager'',''marketing_manager'',''platform_admin'']::public.app_role[]))','public.artist_access_ok((SELECT pc.artist_id FROM crm.ad_platform_connections pc WHERE pc.id = x.connection_id),''traffic_write'',NULL)'),
    ('artist_content_set_song','IF auth.uid() IS NOT NULL AND NOT public.user_has_company_access(v_old.company_id, ARRAY[''admin'',''manager'',''marketing_manager'']::public.app_role[]) THEN','IF NOT public.artist_access_ok(v_old.artist_id,''traffic_write'',NULL) THEN'),
    ('artist_song_metric_set_manual','IF auth.uid() IS NOT NULL AND NOT public.user_has_company_access(v_song.company_id, ARRAY[''admin'',''manager'',''marketing_manager'']::public.app_role[]) THEN','IF NOT public.artist_access_ok(v_song.artist_id,''traffic_write'',NULL) THEN'),
    ('artist_ads_unlinked_summary','PERFORM public._assert_row_company((SELECT company_id FROM public.artists WHERE id = p_artist_id), ''artist_ads_unlinked_summary'');','PERFORM public.artist_access_check(p_artist_id,''read'',''traffic'');')
  ) v(fn, old, new) LOOP
    FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = r.fn AND p.prokind = 'f' LOOP
      d0 := pg_get_functiondef(f.oid);
      IF position(r.old IN d0) = 0 THEN
        IF position(r.new IN d0) > 0 THEN CONTINUE; END IF;
        RAISE EXCEPTION 'D-ERP259: texto não encontrado em %', r.fn;
      END IF;
      EXECUTE replace(d0, r.old, r.new);
    END LOOP;
  END LOOP;
END $do$;