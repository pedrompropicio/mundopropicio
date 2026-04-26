-- Helper: reconcile bypass transactions when a BP version becomes active
CREATE OR REPLACE FUNCTION public.reconcile_bp_overrides_for_event(
  _event_id uuid,
  _trigger_version_id uuid,
  _trigger_version_number int,
  _performed_by uuid DEFAULT NULL,
  _performed_by_label text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cat RECORD;
  v_tx RECORD;
  v_now timestamptz := now();
  v_today text := to_char(v_now, 'DD/MM/YYYY');
  v_budget_amount numeric;
  v_paid_in_cat numeric;
  v_remaining numeric;
  v_reconciled_count int := 0;
  v_retroactive_count int := 0;
  v_history_entry jsonb;
BEGIN
  -- Loop through every category that has a bypass transaction in this event
  FOR v_cat IN
    SELECT DISTINCT category_id
      FROM public.transactions
     WHERE event_id = _event_id
       AND category_id IS NOT NULL
       AND pl_override_note IS NOT NULL
       AND pl_override_note <> ''
       AND status NOT IN ('canceled')
  LOOP
    -- Sum approved BP forecasts for this category in this event
    SELECT COALESCE(SUM(amount), 0)
      INTO v_budget_amount
      FROM public.event_forecasts
     WHERE event_id = _event_id
       AND category_id = v_cat.category_id
       AND status = 'approved'
       AND type = 'expense'
       AND COALESCE(exclude_from_result, false) = false;

    -- Sum non-bypass paid/approved transactions in this category
    SELECT COALESCE(SUM(amount), 0)
      INTO v_paid_in_cat
      FROM public.transactions
     WHERE event_id = _event_id
       AND category_id = v_cat.category_id
       AND type = 'expense'
       AND status IN ('paid', 'approved')
       AND (pl_override_note IS NULL OR pl_override_note = '');

    v_remaining := v_budget_amount - v_paid_in_cat;

    -- Try to reconcile bypass transactions one by one (oldest first)
    FOR v_tx IN
      SELECT id, amount, pl_override_note, notes
        FROM public.transactions
       WHERE event_id = _event_id
         AND category_id = v_cat.category_id
         AND type = 'expense'
         AND pl_override_note IS NOT NULL
         AND pl_override_note <> ''
         AND status NOT IN ('canceled')
       ORDER BY created_at ASC
    LOOP
      IF v_tx.amount <= v_remaining + 0.005 THEN
        -- Fits! Reconcile.
        UPDATE public.transactions
           SET pl_override_note = NULL,
               pl_mode = 'normal',
               notes = CASE
                 WHEN COALESCE(notes, '') = '' THEN
                   format('Bypass original (reconciliado em v%s a %s): %s',
                     _trigger_version_number, v_today, v_tx.pl_override_note)
                 ELSE
                   notes || E'\n' ||
                   format('Bypass original (reconciliado em v%s a %s): %s',
                     _trigger_version_number, v_today, v_tx.pl_override_note)
               END
         WHERE id = v_tx.id;

        v_remaining := v_remaining - v_tx.amount;
        v_reconciled_count := v_reconciled_count + 1;
      ELSE
        -- Does not fit → marks the category's BP lines as retroactively overridden
        v_retroactive_count := v_retroactive_count + 1;

        v_history_entry := jsonb_build_object(
          'reduced_in_version_id', _trigger_version_id,
          'reduced_in_version_number', _trigger_version_number,
          'reduced_at', v_now,
          'transaction_id', v_tx.id,
          'transaction_amount', v_tx.amount,
          'budget_remaining_at_reduction', v_remaining
        );

        UPDATE public.event_forecasts
           SET is_retroactive_override = true,
               historic_overrides = COALESCE(historic_overrides, '[]'::jsonb) || jsonb_build_array(v_history_entry)
         WHERE event_id = _event_id
           AND category_id = v_cat.category_id
           AND type = 'expense';
      END IF;
    END LOOP;
  END LOOP;

  IF v_reconciled_count > 0 OR v_retroactive_count > 0 THEN
    INSERT INTO public.bp_version_audit_log (
      version_id, event_id, action, performed_by, performed_by_label, metadata
    ) VALUES (
      _trigger_version_id, _event_id, 'reconciled',
      _performed_by, _performed_by_label,
      jsonb_build_object(
        'reconciled_count', v_reconciled_count,
        'retroactive_count', v_retroactive_count
      )
    );
  END IF;
END;
$function$;

-- Allow new audit action 'reconciled'
ALTER TABLE public.bp_version_audit_log
  DROP CONSTRAINT IF EXISTS bp_version_audit_log_action_check;

ALTER TABLE public.bp_version_audit_log
  ADD CONSTRAINT bp_version_audit_log_action_check
  CHECK (action IN (
    'created', 'approved', 'superseded', 'archived', 'unarchived',
    'discarded', 'cascaded_from_master', 'scenario_created',
    'scenario_promoted', 'pinned', 'unpinned', 'reverted', 'reconciled'
  ));

-- Patch create_bp_snapshot to call reconciliation when state becomes active
CREATE OR REPLACE FUNCTION public.create_bp_snapshot(_event_id uuid, _description text DEFAULT NULL::text, _approve_immediately boolean DEFAULT false, _scenario_label text DEFAULT NULL::text, _scenario_assumptions jsonb DEFAULT NULL::jsonb, _is_pinned_scenario boolean DEFAULT false, _created_by uuid DEFAULT NULL::uuid, _created_by_label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

        -- Reconcile bypasses on the split with the new BP
        BEGIN
          PERFORM public.reconcile_bp_overrides_for_event(
            v_split.id, v_split_version_id, v_split_next_version,
            _created_by, _created_by_label
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Reconciliation failed for split %: %', v_split.id, SQLERRM;
        END;
      END IF;
    END LOOP;
  END IF;

  -- Reconcile bypasses on the master/standalone event when activating
  IF v_state = 'active' THEN
    BEGIN
      PERFORM public.reconcile_bp_overrides_for_event(
        _event_id, v_master_version_id, v_next_version,
        _created_by, _created_by_label
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Reconciliation failed for event %: %', _event_id, SQLERRM;
    END;
  END IF;

  RETURN v_master_version_id;
END;
$function$;