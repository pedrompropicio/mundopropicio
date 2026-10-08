-- #283 parte 3 / D-ERP195 — guardas de empresa da LINHA em SECDEF chamáveis por não-admin.
-- Padrão: a função original passa a <nome>__impl (sem EXECUTE para anon/authenticated)
-- e um invólucro com o mesmo nome e assinatura valida a empresa antes de delegar.

CREATE OR REPLACE FUNCTION public._assert_row_company(_company_id uuid, _ctx text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
BEGIN
  IF auth.uid() IS NULL THEN
    IF v_role = 'anon' THEN
      RAISE EXCEPTION '%: sessão anónima sem acesso', _ctx USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  IF public.is_platform_admin() THEN RETURN; END IF;
  IF _company_id IS NULL OR _company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION '%: a linha não pertence à empresa activa', _ctx USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_row_company(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_row_company(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._scope_event_ids_to_company(_event_ids uuid[])
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_admin() THEN RETURN _event_ids; END IF;
  RETURN coalesce((
    SELECT array_agg(e.id) FROM public.events e
    WHERE e.company_id = public.current_company_id()
      AND (_event_ids IS NULL OR e.id = ANY(_event_ids))
  ), '{}'::uuid[]);
END;
$$;
REVOKE ALL ON FUNCTION public._scope_event_ids_to_company(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._scope_event_ids_to_company(uuid[]) TO authenticated, service_role;

ALTER FUNCTION crm.auto_link_meta_campaigns_to_events(uuid) RENAME TO auto_link_meta_campaigns_to_events__impl;
ALTER FUNCTION public.crm_auto_link_google_campaigns_to_events(uuid) RENAME TO crm_auto_link_google_campaigns_to_events__impl;
ALTER FUNCTION public.create_scenario_draft(uuid, text, jsonb, text) RENAME TO create_scenario_draft__impl;
ALTER FUNCTION public.discard_scenario_draft(uuid) RENAME TO discard_scenario_draft__impl;
ALTER FUNCTION public.promote_scenario_draft_to_active(uuid, text, text) RENAME TO promote_scenario_draft_to_active__impl;
ALTER FUNCTION public.rename_bp_version(uuid, text, text) RENAME TO rename_bp_version__impl;
ALTER FUNCTION public.merge_forecasts_into_active_snapshot(uuid, uuid[]) RENAME TO merge_forecasts_into_active_snapshot__impl;
ALTER FUNCTION public.artist_content_link_songs(uuid, boolean) RENAME TO artist_content_link_songs__impl;
ALTER FUNCTION public.artist_song_mark_report_stale(uuid) RENAME TO artist_song_mark_report_stale__impl;
ALTER FUNCTION public.analyze_formalidade_bulk(uuid[]) RENAME TO analyze_formalidade_bulk__impl;
ALTER FUNCTION public.formalidade_audit_stats(uuid[]) RENAME TO formalidade_audit_stats__impl;
ALTER FUNCTION public.artist_ads_unlinked_summary(uuid) RENAME TO artist_ads_unlinked_summary__impl;

REVOKE ALL ON FUNCTION crm.auto_link_meta_campaigns_to_events__impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_auto_link_google_campaigns_to_events__impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_scenario_draft__impl(uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.discard_scenario_draft__impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_scenario_draft_to_active__impl(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rename_bp_version__impl(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_forecasts_into_active_snapshot__impl(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.artist_content_link_songs__impl(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.artist_song_mark_report_stale__impl(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.analyze_formalidade_bulk__impl(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.formalidade_audit_stats__impl(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.artist_ads_unlinked_summary__impl(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm.auto_link_meta_campaigns_to_events__impl(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_auto_link_google_campaigns_to_events__impl(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_scenario_draft__impl(uuid, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.discard_scenario_draft__impl(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_scenario_draft_to_active__impl(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rename_bp_version__impl(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_forecasts_into_active_snapshot__impl(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.artist_content_link_songs__impl(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.artist_song_mark_report_stale__impl(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.analyze_formalidade_bulk__impl(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.formalidade_audit_stats__impl(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_unlinked_summary__impl(uuid) TO service_role;

CREATE FUNCTION crm.auto_link_meta_campaigns_to_events(p_company_id uuid)
RETURNS TABLE(updated_count integer, total_active_campaigns integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'crm', 'extensions'
AS $$
BEGIN
  PERFORM public._assert_row_company(p_company_id, 'auto_link_meta_campaigns_to_events');
  RETURN QUERY SELECT * FROM crm.auto_link_meta_campaigns_to_events__impl(p_company_id);
END; $$;

CREATE FUNCTION public.crm_auto_link_google_campaigns_to_events(p_company_id uuid)
RETURNS TABLE(updated_count integer, total_active_campaigns integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'crm', 'extensions'
AS $$
BEGIN
  PERFORM public._assert_row_company(p_company_id, 'crm_auto_link_google_campaigns_to_events');
  RETURN QUERY SELECT * FROM public.crm_auto_link_google_campaigns_to_events__impl(p_company_id);
END; $$;

CREATE FUNCTION public.create_scenario_draft(_event_id uuid, _scenario_label text, _scenario_assumptions jsonb DEFAULT NULL::jsonb, _description text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_row_company((SELECT company_id FROM public.events WHERE id = _event_id), 'create_scenario_draft');
  RETURN public.create_scenario_draft__impl(_event_id, _scenario_label, _scenario_assumptions, _description);
END; $$;

CREATE FUNCTION public.discard_scenario_draft(_version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_row_company((SELECT e.company_id FROM public.bp_versions v JOIN public.events e ON e.id = v.event_id WHERE v.id = _version_id), 'discard_scenario_draft');
  PERFORM public.discard_scenario_draft__impl(_version_id);
END; $$;

CREATE FUNCTION public.promote_scenario_draft_to_active(_scenario_version_id uuid, _new_active_label text DEFAULT NULL::text, _new_active_description text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_row_company((SELECT e.company_id FROM public.bp_versions v JOIN public.events e ON e.id = v.event_id WHERE v.id = _scenario_version_id), 'promote_scenario_draft_to_active');
  RETURN public.promote_scenario_draft_to_active__impl(_scenario_version_id, _new_active_label, _new_active_description);
END; $$;

CREATE FUNCTION public.rename_bp_version(_version_id uuid, _new_label text DEFAULT NULL::text, _new_description text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_row_company((SELECT e.company_id FROM public.bp_versions v JOIN public.events e ON e.id = v.event_id WHERE v.id = _version_id), 'rename_bp_version');
  PERFORM public.rename_bp_version__impl(_version_id, _new_label, _new_description);
END; $$;

CREATE FUNCTION public.merge_forecasts_into_active_snapshot(_event_id uuid, _forecast_ids uuid[])
RETURNS TABLE(merged_into_master integer, merged_into_splits integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_row_company((SELECT company_id FROM public.events WHERE id = _event_id), 'merge_forecasts_into_active_snapshot');
  IF EXISTS (
    SELECT 1 FROM public.event_forecasts f JOIN public.events e ON e.id = f.event_id
    WHERE f.id = ANY(_forecast_ids)
      AND e.company_id IS DISTINCT FROM (SELECT company_id FROM public.events WHERE id = _event_id)
  ) THEN
    RAISE EXCEPTION 'merge_forecasts_into_active_snapshot: linhas de outra empresa' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.merge_forecasts_into_active_snapshot__impl(_event_id, _forecast_ids);
END; $$;

CREATE FUNCTION public.artist_content_link_songs(p_artist_id uuid DEFAULT NULL::uuid, p_dry_run boolean DEFAULT true)
RETURNS TABLE(content_id uuid, song_id uuid, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_artist_id IS NULL THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'artist_content_link_songs: indica o artista' USING ERRCODE = '42501';
    END IF;
    PERFORM public._assert_row_company(NULL, 'artist_content_link_songs');
  ELSE
    PERFORM public._assert_row_company((SELECT company_id FROM public.artists WHERE id = p_artist_id), 'artist_content_link_songs');
  END IF;
  RETURN QUERY SELECT * FROM public.artist_content_link_songs__impl(p_artist_id, p_dry_run);
END; $$;

CREATE FUNCTION public.artist_song_mark_report_stale(p_song_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_row_company((SELECT a.company_id FROM public.artist_songs s JOIN public.artists a ON a.id = s.artist_id WHERE s.id = p_song_id), 'artist_song_mark_report_stale');
  PERFORM public.artist_song_mark_report_stale__impl(p_song_id);
END; $$;

CREATE FUNCTION public.analyze_formalidade_bulk(_event_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(forecast_id uuid, event_id uuid, event_name text, description text, category_code text, category_name text, bp_amount numeric, current_formalidade bp_formalidade, suggested_formalidade bp_formalidade, confidence text, reason text, paid_total numeric, approved_total numeric, has_transaction boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.analyze_formalidade_bulk__impl(public._scope_event_ids_to_company(_event_ids));
END; $$;

CREATE FUNCTION public.formalidade_audit_stats(_event_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(total_lines integer, total_events integer, with_direct_tx integer, with_category_match integer, without_any_match integer, count_estimado integer, count_fechado integer, count_pago_parcial integer, count_pago_total integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.formalidade_audit_stats__impl(public._scope_event_ids_to_company(_event_ids));
END; $$;

CREATE FUNCTION public.artist_ads_unlinked_summary(p_artist_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'crm'
AS $$
BEGIN
  PERFORM public._assert_row_company((SELECT company_id FROM public.artists WHERE id = p_artist_id), 'artist_ads_unlinked_summary');
  RETURN public.artist_ads_unlinked_summary__impl(p_artist_id);
END; $$;

REVOKE ALL ON FUNCTION crm.auto_link_meta_campaigns_to_events(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crm_auto_link_google_campaigns_to_events(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_scenario_draft(uuid, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discard_scenario_draft(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.promote_scenario_draft_to_active(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rename_bp_version(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_forecasts_into_active_snapshot(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artist_content_link_songs(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artist_song_mark_report_stale(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.analyze_formalidade_bulk(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.formalidade_audit_stats(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.artist_ads_unlinked_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION crm.auto_link_meta_campaigns_to_events(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.crm_auto_link_google_campaigns_to_events(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_scenario_draft(uuid, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.discard_scenario_draft(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_scenario_draft_to_active(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rename_bp_version(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_forecasts_into_active_snapshot(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_content_link_songs(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_song_mark_report_stale(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.analyze_formalidade_bulk(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.formalidade_audit_stats(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.artist_ads_unlinked_summary(uuid) TO authenticated, service_role;
