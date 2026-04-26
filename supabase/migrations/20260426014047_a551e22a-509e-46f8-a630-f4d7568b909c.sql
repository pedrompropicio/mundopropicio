-- ============================================================
-- Phase 2: Add scenario fields to bp_versions + snapshot backend
-- ============================================================

-- 1) Add scenario columns (spec §26)
ALTER TABLE public.bp_versions
  ADD COLUMN IF NOT EXISTS scenario_label text,
  ADD COLUMN IF NOT EXISTS scenario_assumptions jsonb,
  ADD COLUMN IF NOT EXISTS is_pinned_scenario boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bp_versions_scenario_pinned
  ON public.bp_versions (event_id, is_pinned_scenario)
  WHERE is_pinned_scenario = true;

CREATE INDEX IF NOT EXISTS idx_bp_versions_scenario_label
  ON public.bp_versions (event_id)
  WHERE scenario_label IS NOT NULL;

-- 2) Constraint: max 4 pinned scenarios per event (spec §26.1)
CREATE OR REPLACE FUNCTION public.enforce_pinned_scenario_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NEW.is_pinned_scenario = true THEN
    SELECT COUNT(*) INTO v_count
      FROM public.bp_versions
     WHERE event_id = NEW.event_id
       AND is_pinned_scenario = true
       AND id <> NEW.id;
    IF v_count >= 4 THEN
      RAISE EXCEPTION 'Máximo de 4 cenários fixados por evento atingido (atual: %)', v_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pinned_scenario_limit ON public.bp_versions;
CREATE TRIGGER trg_enforce_pinned_scenario_limit
  BEFORE INSERT OR UPDATE OF is_pinned_scenario ON public.bp_versions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pinned_scenario_limit();

-- 3) Snapshot creation function
CREATE OR REPLACE FUNCTION public.create_bp_snapshot(
  _event_id uuid,
  _description text DEFAULT NULL,
  _approve_immediately boolean DEFAULT false,
  _scenario_label text DEFAULT NULL,
  _scenario_assumptions jsonb DEFAULT NULL,
  _is_pinned_scenario boolean DEFAULT false,
  _created_by uuid DEFAULT NULL,
  _created_by_label text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event RECORD;
  v_is_master boolean := false;
  v_next_version int;
  v_state text;
  v_master_version_id uuid;
  v_now timestamptz := now();
  v_payload jsonb;
  v_split RECORD;
  v_split_payload jsonb;
  v_split_version_id uuid;
  v_split_next_version int;
  v_previous_active_id uuid;
BEGIN
  SELECT id, name, parent_event_id, status
    INTO v_event
    FROM public.events
   WHERE id = _event_id;

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Event % not found', _event_id;
  END IF;

  IF v_event.parent_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create snapshot directly on a Split event (%). Snapshot the Master instead.', _event_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.events WHERE parent_event_id = _event_id
  ) INTO v_is_master;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_version
    FROM public.bp_versions
   WHERE event_id = _event_id;

  IF _scenario_label IS NOT NULL THEN
    v_state := 'draft';
  ELSIF _approve_immediately THEN
    v_state := 'active';
  ELSE
    v_state := 'draft';
  END IF;

  v_payload := jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'name', v_event.name,
      'status', v_event.status
    ),
    'snapshot_taken_at', v_now,
    'forecasts', COALESCE((
      SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.created_at)
        FROM public.event_forecasts f
       WHERE f.event_id = _event_id
    ), '[]'::jsonb)
  );

  IF v_state = 'active' THEN
    SELECT id INTO v_previous_active_id
      FROM public.bp_versions
     WHERE event_id = _event_id AND state = 'active'
     LIMIT 1;
  END IF;

  INSERT INTO public.bp_versions (
    event_id, version_number, state, created_by, created_by_label,
    description, snapshot_payload, approved_at, approved_by,
    scenario_label, scenario_assumptions, is_pinned_scenario
  )
  VALUES (
    _event_id, v_next_version, v_state, _created_by, _created_by_label,
    _description, v_payload,
    CASE WHEN v_state = 'active' THEN v_now ELSE NULL END,
    CASE WHEN v_state = 'active' THEN _created_by ELSE NULL END,
    _scenario_label, _scenario_assumptions, COALESCE(_is_pinned_scenario, false)
  )
  RETURNING id INTO v_master_version_id;

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    v_master_version_id, _event_id,
    CASE WHEN _scenario_label IS NOT NULL THEN 'scenario_created' ELSE 'created' END,
    _created_by, _created_by_label,
    jsonb_build_object(
      'version_number', v_next_version,
      'state', v_state,
      'is_master', v_is_master,
      'scenario_label', _scenario_label
    )
  );

  IF v_state = 'active' AND v_previous_active_id IS NOT NULL THEN
    UPDATE public.bp_versions
       SET state = 'superseded',
           superseded_at = v_now,
           superseded_by_version_id = v_master_version_id
     WHERE id = v_previous_active_id;

    INSERT INTO public.bp_version_audit_log (
      version_id, event_id, action, performed_by, performed_by_label, metadata
    ) VALUES (
      v_previous_active_id, _event_id, 'superseded', _created_by, _created_by_label,
      jsonb_build_object('superseded_by_version_id', v_master_version_id)
    );
  END IF;

  IF v_is_master THEN
    FOR v_split IN
      SELECT id, name, status FROM public.events WHERE parent_event_id = _event_id
    LOOP
      v_split_payload := jsonb_build_object(
        'event', jsonb_build_object(
          'id', v_split.id,
          'name', v_split.name,
          'status', v_split.status,
          'parent_event_id', _event_id
        ),
        'snapshot_taken_at', v_now,
        'cascaded_from_event_id', _event_id,
        'forecasts', COALESCE((
          SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.created_at)
            FROM public.event_forecasts f
           WHERE f.event_id = v_split.id
        ), '[]'::jsonb)
      );

      SELECT COALESCE(MAX(version_number), 0) + 1
        INTO v_split_next_version
        FROM public.bp_versions
       WHERE event_id = v_split.id;

      INSERT INTO public.bp_versions (
        event_id, version_number, state, created_by, created_by_label,
        description, snapshot_payload, approved_at, approved_by,
        cascaded_from_version_id,
        scenario_label, scenario_assumptions, is_pinned_scenario
      )
      VALUES (
        v_split.id, v_split_next_version, v_state, _created_by, _created_by_label,
        _description, v_split_payload,
        CASE WHEN v_state = 'active' THEN v_now ELSE NULL END,
        CASE WHEN v_state = 'active' THEN _created_by ELSE NULL END,
        v_master_version_id,
        _scenario_label, _scenario_assumptions, COALESCE(_is_pinned_scenario, false)
      )
      RETURNING id INTO v_split_version_id;

      INSERT INTO public.bp_version_audit_log (
        version_id, event_id, action, performed_by, performed_by_label, metadata
      ) VALUES (
        v_split_version_id, v_split.id, 'cascaded_from_master', _created_by, _created_by_label,
        jsonb_build_object(
          'master_version_id', v_master_version_id,
          'master_event_id', _event_id,
          'state', v_state
        )
      );

      IF v_state = 'active' THEN
        UPDATE public.bp_versions
           SET state = 'superseded',
               superseded_at = v_now,
               superseded_by_version_id = v_split_version_id
         WHERE event_id = v_split.id
           AND state = 'active'
           AND id <> v_split_version_id;
      END IF;
    END LOOP;
  END IF;

  RETURN v_master_version_id;
END;
$$;

COMMENT ON FUNCTION public.create_bp_snapshot IS
  'Creates a BP version snapshot for an event. For Master events, cascades to all Splits with the same state and shared description. Supports scenarios (named drafts with assumptions) and immediate approval.';

-- 4) Helper to list versions for the timeline UI
CREATE OR REPLACE FUNCTION public.list_bp_versions(_event_id uuid)
RETURNS TABLE (
  id uuid,
  version_number int,
  state text,
  scenario_label text,
  is_pinned_scenario boolean,
  description text,
  created_at timestamptz,
  approved_at timestamptz,
  superseded_at timestamptz,
  archived_at timestamptz,
  created_by uuid,
  created_by_label text,
  cascaded_from_version_id uuid,
  is_retroactive_snapshot boolean,
  forecast_count int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id,
    v.version_number,
    v.state,
    v.scenario_label,
    v.is_pinned_scenario,
    v.description,
    v.created_at,
    v.approved_at,
    v.superseded_at,
    v.archived_at,
    v.created_by,
    v.created_by_label,
    v.cascaded_from_version_id,
    v.is_retroactive_snapshot,
    COALESCE(jsonb_array_length(v.snapshot_payload->'forecasts'), 0) AS forecast_count
  FROM public.bp_versions v
  WHERE v.event_id = _event_id
  ORDER BY v.version_number DESC;
$$;

COMMENT ON FUNCTION public.list_bp_versions IS
  'Returns BP versions for an event ordered by version_number desc, with computed forecast count for the timeline UI.';