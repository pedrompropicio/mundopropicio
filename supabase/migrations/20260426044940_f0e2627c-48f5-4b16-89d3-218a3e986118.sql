-- Re-apply ticketing versioning migration (was authored but never executed in Test).
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE.

-- 1. Add version_id to ticketing tables (NULL = Active version, non-null = scenario sandbox)
ALTER TABLE public.event_sessions
  ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES public.bp_versions(id) ON DELETE CASCADE;

ALTER TABLE public.event_ticket_zones
  ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES public.bp_versions(id) ON DELETE CASCADE;

ALTER TABLE public.event_ticket_lots
  ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES public.bp_versions(id) ON DELETE CASCADE;

-- 2. Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_event_sessions_event_version ON public.event_sessions(event_id, version_id);
CREATE INDEX IF NOT EXISTS idx_event_ticket_zones_event_version ON public.event_ticket_zones(event_id, version_id);
CREATE INDEX IF NOT EXISTS idx_event_ticket_lots_zone_version ON public.event_ticket_lots(zone_id, version_id);

-- 3. Update create_bp_snapshot to clone ticketing structure into scenarios
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
BEGIN
  SELECT id, name, parent_event_id, status INTO v_event FROM public.events WHERE id = _event_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event % not found', _event_id; END IF;
  IF v_event.parent_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create snapshot directly on a Split event (%). Snapshot the Master instead.', _event_id;
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
    snapshot_payload, approved_at, approved_by, scenario_label, scenario_assumptions, is_pinned_scenario)
  VALUES (_event_id, v_next_version, v_state, _created_by, _created_by_label, _description, v_payload,
    CASE WHEN v_state = 'active' THEN v_now ELSE NULL END,
    CASE WHEN v_state = 'active' THEN _created_by ELSE NULL END,
    _scenario_label, _scenario_assumptions, COALESCE(_is_pinned_scenario, false))
  RETURNING id INTO v_master_version_id;

  INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata)
  VALUES (v_master_version_id, _event_id,
    CASE WHEN _scenario_label IS NOT NULL THEN 'scenario_created' ELSE 'created' END,
    _created_by, _created_by_label,
    jsonb_build_object('version_number', v_next_version, 'state', v_state, 'is_master', v_is_master, 'scenario_label', _scenario_label));

  IF v_state = 'active' AND v_previous_active_id IS NOT NULL THEN
    UPDATE public.bp_versions SET superseded_by_version_id = v_master_version_id WHERE id = v_previous_active_id;
    INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata)
    VALUES (v_previous_active_id, _event_id, 'superseded', _created_by, _created_by_label,
      jsonb_build_object('superseded_by_version_id', v_master_version_id));
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
    FOR v_split IN SELECT id, name, status FROM public.events WHERE parent_event_id = _event_id LOOP
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
        scenario_label, scenario_assumptions, is_pinned_scenario)
      VALUES (v_split.id, v_split_next_version, v_state, _created_by, _created_by_label, _description, v_split_payload,
        CASE WHEN v_state = 'active' THEN v_now ELSE NULL END,
        CASE WHEN v_state = 'active' THEN _created_by ELSE NULL END,
        v_master_version_id, _scenario_label, _scenario_assumptions, COALESCE(_is_pinned_scenario, false))
      RETURNING id INTO v_split_version_id;
      INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata)
      VALUES (v_split_version_id, v_split.id, 'cascaded_from_master', _created_by, _created_by_label,
        jsonb_build_object('master_version_id', v_master_version_id, 'master_event_id', _event_id, 'state', v_state));
      IF v_state = 'active' AND v_split_previous_active_id IS NOT NULL THEN
        UPDATE public.bp_versions SET superseded_by_version_id = v_split_version_id WHERE id = v_split_previous_active_id;
        INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata)
        VALUES (v_split_previous_active_id, v_split.id, 'superseded', _created_by, _created_by_label,
          jsonb_build_object('superseded_by_version_id', v_split_version_id));
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

-- 4. Update promote_scenario_to_active to also promote ticketing structure
CREATE OR REPLACE FUNCTION public.promote_scenario_to_active(
  _scenario_version_id uuid,
  _description text DEFAULT NULL::text,
  _performed_by uuid DEFAULT NULL::uuid,
  _performed_by_label text DEFAULT NULL::text,
  _force boolean DEFAULT false,
  _other_scenarios_actions jsonb DEFAULT '[]'::jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scenario RECORD;
  v_event RECORD;
  v_now timestamptz := now();
  v_next_version int;
  v_new_version_id uuid;
  v_previous_active_id uuid;
  v_split RECORD;
  v_split_scenario RECORD;
  v_split_next_version int;
  v_split_new_version_id uuid;
  v_split_previous_active_id uuid;
  v_action_record RECORD;
  v_target_scenario RECORD;
  v_session_map jsonb;
  v_zone_map jsonb;
  v_old_id uuid; v_new_id uuid;
  v_session_row RECORD; v_zone_row RECORD; v_lot_row RECORD;
BEGIN
  SELECT * INTO v_scenario FROM public.bp_versions WHERE id = _scenario_version_id;
  IF v_scenario IS NULL THEN
    RAISE EXCEPTION 'Scenario % not found', _scenario_version_id;
  END IF;
  IF v_scenario.scenario_label IS NULL THEN
    RAISE EXCEPTION 'A versão alvo não é um cenário (sem scenario_label).';
  END IF;
  IF v_scenario.state = 'archived' THEN
    RAISE EXCEPTION 'Cenário arquivado — desarquive antes de promover.';
  END IF;

  SELECT id, name, parent_event_id INTO v_event
    FROM public.events WHERE id = v_scenario.event_id;
  IF v_event.parent_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Promova o cenário do Master — os Splits são propagados automaticamente.';
  END IF;

  SELECT id INTO v_previous_active_id
    FROM public.bp_versions
   WHERE event_id = v_scenario.event_id AND state = 'active'
   LIMIT 1;

  IF v_previous_active_id IS NOT NULL THEN
    UPDATE public.bp_versions
       SET state = 'superseded', superseded_at = v_now
     WHERE id = v_previous_active_id;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_version
    FROM public.bp_versions
   WHERE event_id = v_scenario.event_id;

  INSERT INTO public.bp_versions (
    event_id, version_number, state, created_by, created_by_label,
    description, snapshot_payload, approved_at, approved_by
  )
  VALUES (
    v_scenario.event_id, v_next_version, 'active', _performed_by, _performed_by_label,
    COALESCE(_description, format('Promovido do cenário "%s" (v%s)', v_scenario.scenario_label, v_scenario.version_number)),
    v_scenario.snapshot_payload, v_now, _performed_by
  )
  RETURNING id INTO v_new_version_id;

  IF v_previous_active_id IS NOT NULL THEN
    UPDATE public.bp_versions
       SET superseded_by_version_id = v_new_version_id
     WHERE id = v_previous_active_id;

    INSERT INTO public.bp_version_audit_log (
      version_id, event_id, action, performed_by, performed_by_label, metadata
    ) VALUES (
      v_previous_active_id, v_scenario.event_id, 'superseded',
      _performed_by, _performed_by_label,
      jsonb_build_object('superseded_by_version_id', v_new_version_id, 'cause', 'scenario_promoted')
    );
  END IF;

  UPDATE public.bp_versions
     SET is_pinned_scenario = false
   WHERE id = _scenario_version_id;

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    v_new_version_id, v_scenario.event_id, 'scenario_promoted',
    _performed_by, _performed_by_label,
    jsonb_build_object(
      'source_scenario_id', _scenario_version_id,
      'source_scenario_label', v_scenario.scenario_label,
      'source_version_number', v_scenario.version_number,
      'new_version_number', v_next_version,
      'force', _force,
      'other_scenarios_actions', _other_scenarios_actions
    )
  );

  DELETE FROM public.event_forecasts WHERE event_id = v_scenario.event_id AND version_id IS NULL;

  INSERT INTO public.event_forecasts (
    id, event_id, category_id, type, description, amount, currency,
    original_amount, fx_rate, fx_rate_source,
    formula_type, formula_value, iva_rate, status,
    approved_at, approved_by, transaction_id, cache_config_id,
    master_forecast_id, invoice_group_id, attachment_refs,
    historic_overrides, is_overhead, is_retroactive_override,
    is_transitory, exclude_from_result, notes, specification,
    created_at, updated_at, version_id
  )
  SELECT
    COALESCE((r->>'id')::uuid, gen_random_uuid()),
    v_scenario.event_id,
    NULLIF(r->>'category_id', '')::uuid,
    r->>'type',
    r->>'description',
    COALESCE((r->>'amount')::numeric, 0),
    COALESCE(r->>'currency', 'EUR'),
    NULLIF(r->>'original_amount', '')::numeric,
    NULLIF(r->>'fx_rate', '')::numeric,
    r->>'fx_rate_source',
    COALESCE(r->>'formula_type', 'fixed'),
    COALESCE((r->>'formula_value')::numeric, 0),
    COALESCE((r->>'iva_rate')::numeric, 0),
    COALESCE(r->>'status', 'draft'),
    NULLIF(r->>'approved_at', '')::timestamptz,
    NULLIF(r->>'approved_by', '')::uuid,
    NULLIF(r->>'transaction_id', '')::uuid,
    NULLIF(r->>'cache_config_id', '')::uuid,
    NULLIF(r->>'master_forecast_id', '')::uuid,
    NULLIF(r->>'invoice_group_id', '')::uuid,
    COALESCE(r->'attachment_refs', '[]'::jsonb),
    COALESCE(r->'historic_overrides', '[]'::jsonb),
    COALESCE((r->>'is_overhead')::boolean, false),
    COALESCE((r->>'is_retroactive_override')::boolean, false),
    COALESCE((r->>'is_transitory')::boolean, false),
    COALESCE((r->>'exclude_from_result')::boolean, false),
    r->>'notes',
    r->>'specification',
    v_now, v_now, NULL
  FROM jsonb_array_elements(COALESCE(v_scenario.snapshot_payload->'forecasts', '[]'::jsonb)) AS r;

  DELETE FROM public.event_ticket_lots l
   USING public.event_ticket_zones z
   WHERE l.zone_id = z.id AND z.event_id = v_scenario.event_id AND z.version_id IS NULL AND l.version_id IS NULL;
  DELETE FROM public.event_ticket_zones WHERE event_id = v_scenario.event_id AND version_id IS NULL;
  DELETE FROM public.event_sessions WHERE event_id = v_scenario.event_id AND version_id IS NULL;

  v_session_map := '{}'::jsonb;
  v_zone_map := '{}'::jsonb;

  FOR v_session_row IN
    SELECT * FROM public.event_sessions
     WHERE event_id = v_scenario.event_id AND version_id = _scenario_version_id
  LOOP
    v_old_id := v_session_row.id;
    v_new_id := gen_random_uuid();
    INSERT INTO public.event_sessions (id, event_id, date, label, start_time, sort_order, version_id)
    VALUES (v_new_id, v_scenario.event_id, v_session_row.date, v_session_row.label, v_session_row.start_time,
            v_session_row.sort_order, NULL);
    v_session_map := v_session_map || jsonb_build_object(v_old_id::text, v_new_id::text);
  END LOOP;

  FOR v_zone_row IN
    SELECT * FROM public.event_ticket_zones
     WHERE event_id = v_scenario.event_id AND version_id = _scenario_version_id
  LOOP
    v_old_id := v_zone_row.id;
    v_new_id := gen_random_uuid();
    INSERT INTO public.event_ticket_zones (id, event_id, name, total_capacity, session_id, version_id)
    VALUES (v_new_id, v_scenario.event_id, v_zone_row.name, v_zone_row.total_capacity,
            CASE WHEN v_zone_row.session_id IS NULL THEN NULL
                 ELSE NULLIF(v_session_map->>(v_zone_row.session_id::text), '')::uuid END,
            NULL);
    v_zone_map := v_zone_map || jsonb_build_object(v_old_id::text, v_new_id::text);
  END LOOP;

  FOR v_lot_row IN
    SELECT l.* FROM public.event_ticket_lots l
     JOIN public.event_ticket_zones z ON z.id = l.zone_id
    WHERE z.event_id = v_scenario.event_id AND z.version_id = _scenario_version_id AND l.version_id = _scenario_version_id
  LOOP
    INSERT INTO public.event_ticket_lots (id, zone_id, lot_number, name, quantity, price, iva_rate, lot_type, version_id)
    VALUES (gen_random_uuid(),
            NULLIF(v_zone_map->>(v_lot_row.zone_id::text), '')::uuid,
            v_lot_row.lot_number, v_lot_row.name, v_lot_row.quantity, v_lot_row.price,
            v_lot_row.iva_rate, v_lot_row.lot_type, NULL);
  END LOOP;

  IF NOT _force THEN
    BEGIN
      PERFORM public.reconcile_bypasses_after_version_change(
        v_scenario.event_id, v_new_version_id, _performed_by, _performed_by_label
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Reconciliation failed for event %: %', v_scenario.event_id, SQLERRM;
    END;
  END IF;

  IF jsonb_typeof(_other_scenarios_actions) = 'array' THEN
    FOR v_action_record IN
      SELECT
        (e->>'version_id')::uuid AS version_id,
        e->>'action' AS action
      FROM jsonb_array_elements(_other_scenarios_actions) AS e
    LOOP
      SELECT * INTO v_target_scenario
        FROM public.bp_versions
       WHERE id = v_action_record.version_id
         AND event_id = v_scenario.event_id
         AND scenario_label IS NOT NULL
         AND id <> _scenario_version_id;

      IF v_target_scenario IS NULL THEN
        CONTINUE;
      END IF;

      IF v_action_record.action = 'archive' THEN
        UPDATE public.bp_versions
           SET state = 'archived',
               archived_at = v_now,
               is_pinned_scenario = false
         WHERE id = v_target_scenario.id;

        INSERT INTO public.bp_version_audit_log (
          version_id, event_id, action, performed_by, performed_by_label, metadata
        ) VALUES (
          v_target_scenario.id, v_scenario.event_id, 'archived',
          _performed_by, _performed_by_label,
          jsonb_build_object('cause', 'sibling_scenario_promoted',
                             'promoted_version_id', v_new_version_id)
        );

      ELSIF v_action_record.action = 'discard' THEN
        IF v_target_scenario.state = 'draft' THEN
          PERFORM public.discard_bp_version_draft(
            v_target_scenario.id, _performed_by, _performed_by_label
          );
        END IF;

      ELSIF v_action_record.action = 'keep' THEN
        INSERT INTO public.bp_version_audit_log (
          version_id, event_id, action, performed_by, performed_by_label, metadata
        ) VALUES (
          v_target_scenario.id, v_scenario.event_id, 'kept_after_sibling_promotion',
          _performed_by, _performed_by_label,
          jsonb_build_object('promoted_version_id', v_new_version_id)
        );
      END IF;
    END LOOP;
  END IF;

  FOR v_split IN
    SELECT id FROM public.events WHERE parent_event_id = v_scenario.event_id
  LOOP
    SELECT * INTO v_split_scenario
      FROM public.bp_versions
     WHERE event_id = v_split.id
       AND cascaded_from_version_id = _scenario_version_id
     LIMIT 1;

    IF v_split_scenario.id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id INTO v_split_previous_active_id
      FROM public.bp_versions
     WHERE event_id = v_split.id AND state = 'active'
     LIMIT 1;

    IF v_split_previous_active_id IS NOT NULL THEN
      UPDATE public.bp_versions
         SET state = 'superseded', superseded_at = v_now
       WHERE id = v_split_previous_active_id;
    END IF;

    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO v_split_next_version
      FROM public.bp_versions
     WHERE event_id = v_split.id;

    INSERT INTO public.bp_versions (
      event_id, version_number, state, created_by, created_by_label,
      description, snapshot_payload, approved_at, approved_by,
      cascaded_from_version_id
    )
    VALUES (
      v_split.id, v_split_next_version, 'active', _performed_by, _performed_by_label,
      COALESCE(_description, 'Promovido via cascade do Master'),
      v_split_scenario.snapshot_payload, v_now, _performed_by,
      v_new_version_id
    )
    RETURNING id INTO v_split_new_version_id;

    IF v_split_previous_active_id IS NOT NULL THEN
      UPDATE public.bp_versions
         SET superseded_by_version_id = v_split_new_version_id
       WHERE id = v_split_previous_active_id;
    END IF;

    DELETE FROM public.event_forecasts WHERE event_id = v_split.id AND version_id IS NULL;

    INSERT INTO public.event_forecasts (
      id, event_id, category_id, type, description, amount, currency,
      original_amount, fx_rate, fx_rate_source,
      formula_type, formula_value, iva_rate, status,
      approved_at, approved_by, transaction_id, cache_config_id,
      master_forecast_id, invoice_group_id, attachment_refs,
      historic_overrides, is_overhead, is_retroactive_override,
      is_transitory, exclude_from_result, notes, specification,
      created_at, updated_at, version_id
    )
    SELECT
      COALESCE((r->>'id')::uuid, gen_random_uuid()),
      v_split.id,
      NULLIF(r->>'category_id', '')::uuid,
      r->>'type', r->>'description',
      COALESCE((r->>'amount')::numeric, 0),
      COALESCE(r->>'currency', 'EUR'),
      NULLIF(r->>'original_amount', '')::numeric,
      NULLIF(r->>'fx_rate', '')::numeric,
      r->>'fx_rate_source',
      COALESCE(r->>'formula_type', 'fixed'),
      COALESCE((r->>'formula_value')::numeric, 0),
      COALESCE((r->>'iva_rate')::numeric, 0),
      COALESCE(r->>'status', 'draft'),
      NULLIF(r->>'approved_at', '')::timestamptz,
      NULLIF(r->>'approved_by', '')::uuid,
      NULLIF(r->>'transaction_id', '')::uuid,
      NULLIF(r->>'cache_config_id', '')::uuid,
      NULLIF(r->>'master_forecast_id', '')::uuid,
      NULLIF(r->>'invoice_group_id', '')::uuid,
      COALESCE(r->'attachment_refs', '[]'::jsonb),
      COALESCE(r->'historic_overrides', '[]'::jsonb),
      COALESCE((r->>'is_overhead')::boolean, false),
      COALESCE((r->>'is_retroactive_override')::boolean, false),
      COALESCE((r->>'is_transitory')::boolean, false),
      COALESCE((r->>'exclude_from_result')::boolean, false),
      r->>'notes', r->>'specification',
      v_now, v_now, NULL
    FROM jsonb_array_elements(COALESCE(v_split_scenario.snapshot_payload->'forecasts', '[]'::jsonb)) AS r;

    DELETE FROM public.event_ticket_lots l
     USING public.event_ticket_zones z
     WHERE l.zone_id = z.id AND z.event_id = v_split.id AND z.version_id IS NULL AND l.version_id IS NULL;
    DELETE FROM public.event_ticket_zones WHERE event_id = v_split.id AND version_id IS NULL;
    DELETE FROM public.event_sessions WHERE event_id = v_split.id AND version_id IS NULL;

    v_session_map := '{}'::jsonb;
    v_zone_map := '{}'::jsonb;

    FOR v_session_row IN
      SELECT * FROM public.event_sessions
       WHERE event_id = v_split.id AND version_id = v_split_scenario.id
    LOOP
      v_old_id := v_session_row.id;
      v_new_id := gen_random_uuid();
      INSERT INTO public.event_sessions (id, event_id, date, label, start_time, sort_order, version_id)
      VALUES (v_new_id, v_split.id, v_session_row.date, v_session_row.label, v_session_row.start_time,
              v_session_row.sort_order, NULL);
      v_session_map := v_session_map || jsonb_build_object(v_old_id::text, v_new_id::text);
    END LOOP;

    FOR v_zone_row IN
      SELECT * FROM public.event_ticket_zones
       WHERE event_id = v_split.id AND version_id = v_split_scenario.id
    LOOP
      v_old_id := v_zone_row.id;
      v_new_id := gen_random_uuid();
      INSERT INTO public.event_ticket_zones (id, event_id, name, total_capacity, session_id, version_id)
      VALUES (v_new_id, v_split.id, v_zone_row.name, v_zone_row.total_capacity,
              CASE WHEN v_zone_row.session_id IS NULL THEN NULL
                   ELSE NULLIF(v_session_map->>(v_zone_row.session_id::text), '')::uuid END,
              NULL);
      v_zone_map := v_zone_map || jsonb_build_object(v_old_id::text, v_new_id::text);
    END LOOP;

    FOR v_lot_row IN
      SELECT l.* FROM public.event_ticket_lots l
       JOIN public.event_ticket_zones z ON z.id = l.zone_id
      WHERE z.event_id = v_split.id AND z.version_id = v_split_scenario.id AND l.version_id = v_split_scenario.id
    LOOP
      INSERT INTO public.event_ticket_lots (id, zone_id, lot_number, name, quantity, price, iva_rate, lot_type, version_id)
      VALUES (gen_random_uuid(),
              NULLIF(v_zone_map->>(v_lot_row.zone_id::text), '')::uuid,
              v_lot_row.lot_number, v_lot_row.name, v_lot_row.quantity, v_lot_row.price,
              v_lot_row.iva_rate, v_lot_row.lot_type, NULL);
    END LOOP;

    IF NOT _force THEN
      BEGIN
        PERFORM public.reconcile_bypasses_after_version_change(
          v_split.id, v_split_new_version_id, _performed_by, _performed_by_label
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Reconciliation failed for split %: %', v_split.id, SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN v_new_version_id;
END;
$function$;