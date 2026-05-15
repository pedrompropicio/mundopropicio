CREATE OR REPLACE FUNCTION public.create_bp_snapshot(
  _event_id uuid,
  _description text DEFAULT NULL::text,
  _approve_immediately boolean DEFAULT false,
  _scenario_label text DEFAULT NULL::text,
  _scenario_assumptions jsonb DEFAULT NULL::jsonb,
  _is_pinned_scenario boolean DEFAULT false,
  _created_by uuid DEFAULT NULL::uuid,
  _created_by_label text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event RECORD; v_is_master boolean := false;
  v_next_version int; v_state text;
  v_master_version_id uuid; v_now timestamptz := now();
  v_payload jsonb; v_split RECORD; v_split_payload jsonb;
  v_split_version_id uuid; v_split_next_version int;
  v_previous_active_id uuid; v_split_previous_active_id uuid;
  v_session_map jsonb;
  v_zone_map jsonb;
  v_old_id uuid; v_new_id uuid;
  v_session_row RECORD; v_zone_row RECORD; v_lot_row RECORD;
  v_company_id uuid;
  v_split_company_id uuid;
BEGIN
  SELECT id, name, parent_event_id, status, company_id INTO v_event FROM public.events WHERE id = _event_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event % not found', _event_id; END IF;
  IF v_event.parent_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create snapshot directly on a Split event (%). Snapshot the Master instead.', _event_id;
  END IF;
  v_company_id := v_event.company_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'create_bp_snapshot: event % has no company_id', _event_id;
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.events WHERE parent_event_id = _event_id) INTO v_is_master;
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version FROM public.bp_versions WHERE event_id = _event_id;
  IF _scenario_label IS NOT NULL THEN v_state := 'draft';
  ELSIF _approve_immediately THEN v_state := 'active';
  ELSE v_state := 'draft'; END IF;

  v_payload := jsonb_build_object(
    'event', jsonb_build_object('id', v_event.id, 'name', v_event.name, 'status', v_event.status),
    'snapshot_taken_at', v_now,
    'forecasts', COALESCE((SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.created_at)
      FROM public.event_forecasts f WHERE f.event_id = _event_id AND f.version_id IS NULL), '[]'::jsonb)
  );

  IF v_state = 'active' THEN
    SELECT id INTO v_previous_active_id FROM public.bp_versions WHERE event_id = _event_id AND state = 'active' LIMIT 1;
    IF v_previous_active_id IS NOT NULL THEN
      UPDATE public.bp_versions SET state = 'superseded', superseded_at = v_now WHERE id = v_previous_active_id;
    END IF;
  END IF;

  INSERT INTO public.bp_versions (
    event_id, version_number, state, created_by, created_by_label, description,
    snapshot_payload, approved_at, approved_by, scenario_label, scenario_assumptions, is_pinned_scenario, company_id)
  VALUES (_event_id, v_next_version, v_state, _created_by, _created_by_label, _description, v_payload,
    CASE WHEN v_state = 'active' THEN v_now ELSE NULL END,
    CASE WHEN v_state = 'active' THEN _created_by ELSE NULL END,
    _scenario_label, _scenario_assumptions, COALESCE(_is_pinned_scenario, false), v_company_id)
  RETURNING id INTO v_master_version_id;

  INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata, company_id)
  VALUES (v_master_version_id, _event_id,
    CASE WHEN _scenario_label IS NOT NULL THEN 'scenario_created' ELSE 'created' END,
    _created_by, _created_by_label,
    jsonb_build_object('version_number', v_next_version, 'state', v_state, 'is_master', v_is_master, 'scenario_label', _scenario_label),
    v_company_id);

  IF v_state = 'active' AND v_previous_active_id IS NOT NULL THEN
    UPDATE public.bp_versions SET superseded_by_version_id = v_master_version_id WHERE id = v_previous_active_id;
    INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata, company_id)
    VALUES (v_previous_active_id, _event_id, 'superseded', _created_by, _created_by_label,
      jsonb_build_object('superseded_by_version_id', v_master_version_id), v_company_id);
  END IF;

  IF _scenario_label IS NOT NULL THEN
    v_session_map := '{}'::jsonb;
    v_zone_map := '{}'::jsonb;

    FOR v_session_row IN
      SELECT * FROM public.event_sessions
       WHERE event_id = _event_id AND version_id IS NULL
    LOOP
      v_old_id := v_session_row.id;
      v_new_id := gen_random_uuid();
      INSERT INTO public.event_sessions (id, event_id, date, label, start_time, sort_order, version_id)
      VALUES (v_new_id, _event_id, v_session_row.date, v_session_row.label, v_session_row.start_time,
              v_session_row.sort_order, v_master_version_id);
      v_session_map := v_session_map || jsonb_build_object(v_old_id::text, v_new_id::text);
    END LOOP;

    FOR v_zone_row IN
      SELECT * FROM public.event_ticket_zones
       WHERE event_id = _event_id AND version_id IS NULL
    LOOP
      v_old_id := v_zone_row.id;
      v_new_id := gen_random_uuid();
      INSERT INTO public.event_ticket_zones (id, event_id, name, total_capacity, session_id, version_id)
      VALUES (v_new_id, _event_id, v_zone_row.name, v_zone_row.total_capacity,
              CASE WHEN v_zone_row.session_id IS NULL THEN NULL
                   ELSE NULLIF(v_session_map->>(v_zone_row.session_id::text), '')::uuid END,
              v_master_version_id);
      v_zone_map := v_zone_map || jsonb_build_object(v_old_id::text, v_new_id::text);
    END LOOP;

    FOR v_lot_row IN
      SELECT l.* FROM public.event_ticket_lots l
       JOIN public.event_ticket_zones z ON z.id = l.zone_id
      WHERE z.event_id = _event_id AND z.version_id IS NULL AND l.version_id IS NULL
    LOOP
      INSERT INTO public.event_ticket_lots (id, zone_id, lot_number, name, quantity, price, iva_rate, lot_type, version_id)
      VALUES (gen_random_uuid(),
              NULLIF(v_zone_map->>(v_lot_row.zone_id::text), '')::uuid,
              v_lot_row.lot_number, v_lot_row.name, v_lot_row.quantity, v_lot_row.price,
              v_lot_row.iva_rate, v_lot_row.lot_type, v_master_version_id);
    END LOOP;
  END IF;

  IF v_is_master THEN
    FOR v_split IN SELECT id, name, status, company_id FROM public.events WHERE parent_event_id = _event_id LOOP
      v_split_company_id := COALESCE(v_split.company_id, v_company_id);
      v_split_payload := jsonb_build_object(
        'event', jsonb_build_object('id', v_split.id, 'name', v_split.name, 'status', v_split.status, 'parent_event_id', _event_id),
        'snapshot_taken_at', v_now, 'cascaded_from_event_id', _event_id,
        'forecasts', COALESCE((SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.created_at)
          FROM public.event_forecasts f WHERE f.event_id = v_split.id AND f.version_id IS NULL), '[]'::jsonb));
      SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_split_next_version FROM public.bp_versions WHERE event_id = v_split.id;
      v_split_previous_active_id := NULL;
      IF v_state = 'active' THEN
        SELECT id INTO v_split_previous_active_id FROM public.bp_versions WHERE event_id = v_split.id AND state = 'active' LIMIT 1;
        IF v_split_previous_active_id IS NOT NULL THEN
          UPDATE public.bp_versions SET state = 'superseded', superseded_at = v_now WHERE id = v_split_previous_active_id;
        END IF;
      END IF;
      INSERT INTO public.bp_versions (event_id, version_number, state, created_by, created_by_label, description,
        snapshot_payload, approved_at, approved_by, cascaded_from_version_id,
        scenario_label, scenario_assumptions, is_pinned_scenario, company_id)
      VALUES (v_split.id, v_split_next_version, v_state, _created_by, _created_by_label, _description, v_split_payload,
        CASE WHEN v_state = 'active' THEN v_now ELSE NULL END,
        CASE WHEN v_state = 'active' THEN _created_by ELSE NULL END,
        v_master_version_id, _scenario_label, _scenario_assumptions, COALESCE(_is_pinned_scenario, false), v_split_company_id)
      RETURNING id INTO v_split_version_id;
      INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata, company_id)
      VALUES (v_split_version_id, v_split.id, 'cascaded_from_master', _created_by, _created_by_label,
        jsonb_build_object('master_version_id', v_master_version_id, 'master_event_id', _event_id, 'state', v_state),
        v_split_company_id);
      IF v_state = 'active' AND v_split_previous_active_id IS NOT NULL THEN
        UPDATE public.bp_versions SET superseded_by_version_id = v_split_version_id WHERE id = v_split_previous_active_id;
        INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata, company_id)
        VALUES (v_split_previous_active_id, v_split.id, 'superseded', _created_by, _created_by_label,
          jsonb_build_object('superseded_by_version_id', v_split_version_id), v_split_company_id);
      END IF;

      IF _scenario_label IS NOT NULL THEN
        v_session_map := '{}'::jsonb;
        v_zone_map := '{}'::jsonb;

        FOR v_session_row IN
          SELECT * FROM public.event_sessions WHERE event_id = v_split.id AND version_id IS NULL
        LOOP
          v_old_id := v_session_row.id;
          v_new_id := gen_random_uuid();
          INSERT INTO public.event_sessions (id, event_id, date, label, start_time, sort_order, version_id)
          VALUES (v_new_id, v_split.id, v_session_row.date, v_session_row.label, v_session_row.start_time,
                  v_session_row.sort_order, v_split_version_id);
          v_session_map := v_session_map || jsonb_build_object(v_old_id::text, v_new_id::text);
        END LOOP;

        FOR v_zone_row IN
          SELECT * FROM public.event_ticket_zones WHERE event_id = v_split.id AND version_id IS NULL
        LOOP
          v_old_id := v_zone_row.id;
          v_new_id := gen_random_uuid();
          INSERT INTO public.event_ticket_zones (id, event_id, name, total_capacity, session_id, version_id)
          VALUES (v_new_id, v_split.id, v_zone_row.name, v_zone_row.total_capacity,
                  CASE WHEN v_zone_row.session_id IS NULL THEN NULL
                       ELSE NULLIF(v_session_map->>(v_zone_row.session_id::text), '')::uuid END,
                  v_split_version_id);
          v_zone_map := v_zone_map || jsonb_build_object(v_old_id::text, v_new_id::text);
        END LOOP;

        FOR v_lot_row IN
          SELECT l.* FROM public.event_ticket_lots l
           JOIN public.event_ticket_zones z ON z.id = l.zone_id
          WHERE z.event_id = v_split.id AND z.version_id IS NULL AND l.version_id IS NULL
        LOOP
          INSERT INTO public.event_ticket_lots (id, zone_id, lot_number, name, quantity, price, iva_rate, lot_type, version_id)
          VALUES (gen_random_uuid(),
                  NULLIF(v_zone_map->>(v_lot_row.zone_id::text), '')::uuid,
                  v_lot_row.lot_number, v_lot_row.name, v_lot_row.quantity, v_lot_row.price,
                  v_lot_row.iva_rate, v_lot_row.lot_type, v_split_version_id);
        END LOOP;
      END IF;

      IF v_state = 'active' THEN
        BEGIN
          PERFORM public.reconcile_bp_overrides_for_event(v_split.id, v_split_version_id, v_split_next_version, _created_by, _created_by_label);
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Reconciliation failed for split %: %', v_split.id, SQLERRM;
        END;
      END IF;
    END LOOP;
  END IF;

  IF v_state = 'active' THEN
    BEGIN
      PERFORM public.reconcile_bp_overrides_for_event(_event_id, v_master_version_id, v_next_version, _created_by, _created_by_label);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Reconciliation failed for event %: %', _event_id, SQLERRM;
    END;
  END IF;

  RETURN v_master_version_id;
END;
$function$;