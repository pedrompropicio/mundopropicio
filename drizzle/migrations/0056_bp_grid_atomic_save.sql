-- #247: snapshot and grid writes commit together, or all roll back.
CREATE OR REPLACE FUNCTION public.batch_save_event_forecasts(
  _event_id uuid,
  _version_id uuid DEFAULT NULL,
  _inserts jsonb DEFAULT '[]'::jsonb,
  _edits jsonb DEFAULT '[]'::jsonb,
  _snapshot_description text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event record;
  v_insert_result jsonb;
  v_update_result jsonb;
  v_snapshot_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT id, company_id, parent_event_id INTO v_event
    FROM public.events WHERE id = _event_id FOR UPDATE;
  IF NOT FOUND OR v_event.company_id IS NULL
     OR NOT public.row_belongs_to_current_company(v_event.company_id) THEN
    RAISE EXCEPTION 'Evento indisponível nesta empresa' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_inserts) IS DISTINCT FROM 'array'
     OR jsonb_typeof(_edits) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Gravação inválida: são esperadas listas de linhas';
  END IF;
  IF jsonb_array_length(_inserts) + jsonb_array_length(_edits) = 0 THEN
    RETURN jsonb_build_object('inserted', 0, 'ids', '[]'::jsonb, 'updated', 0, 'snapshot_id', NULL);
  END IF;
  -- The existing snapshot API is root-only and staff-only. Preserve partner/Split permissions.
  IF _version_id IS NULL AND v_event.parent_event_id IS NULL
     AND (public.is_platform_admin() OR public.has_permission_in(auth.uid(), 'manage_bp', v_event.company_id)) THEN
    v_snapshot_id := public.create_bp_snapshot(_event_id, _snapshot_description, false);
  END IF;
  -- Existing APIs retain permission, version, row and #240 floor checks.
  v_insert_result := public.batch_insert_event_forecasts(_event_id, _version_id, _inserts);
  v_update_result := public.batch_update_event_forecasts(_event_id, _version_id, _edits);
  RETURN jsonb_build_object(
    'inserted', v_insert_result->'inserted', 'ids', v_insert_result->'ids',
    'updated', v_update_result->'updated', 'snapshot_id', v_snapshot_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.batch_save_event_forecasts(uuid,uuid,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_save_event_forecasts(uuid,uuid,jsonb,jsonb,text) TO authenticated;