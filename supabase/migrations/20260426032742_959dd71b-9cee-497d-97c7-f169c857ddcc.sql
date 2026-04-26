-- Phase 5: reconcile_bp_overrides_for_event helper used by snapshot creation
CREATE OR REPLACE FUNCTION public.reconcile_bp_overrides_for_event(
  _event_id uuid,
  _trigger_version_id uuid,
  _trigger_version_number int,
  _performed_by uuid DEFAULT NULL,
  _performed_by_label text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cat RECORD; v_tx RECORD;
  v_now timestamptz := now();
  v_today text := to_char(v_now, 'DD/MM/YYYY');
  v_budget_amount numeric; v_paid_in_cat numeric; v_remaining numeric;
  v_reconciled_count int := 0; v_retroactive_count int := 0;
  v_history_entry jsonb;
BEGIN
  FOR v_cat IN
    SELECT DISTINCT category_id FROM public.transactions
     WHERE event_id = _event_id AND category_id IS NOT NULL
       AND pl_override_note IS NOT NULL AND pl_override_note <> ''
       AND status NOT IN ('canceled')
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_budget_amount
      FROM public.event_forecasts
     WHERE event_id = _event_id AND category_id = v_cat.category_id
       AND status = 'approved' AND type = 'expense'
       AND COALESCE(exclude_from_result, false) = false;
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_in_cat
      FROM public.transactions
     WHERE event_id = _event_id AND category_id = v_cat.category_id
       AND type = 'expense' AND status IN ('paid', 'approved')
       AND (pl_override_note IS NULL OR pl_override_note = '');
    v_remaining := v_budget_amount - v_paid_in_cat;
    FOR v_tx IN
      SELECT id, amount, pl_override_note, notes FROM public.transactions
       WHERE event_id = _event_id AND category_id = v_cat.category_id
         AND type = 'expense' AND pl_override_note IS NOT NULL AND pl_override_note <> ''
         AND status NOT IN ('canceled') ORDER BY created_at ASC
    LOOP
      IF v_tx.amount <= v_remaining + 0.005 THEN
        UPDATE public.transactions SET pl_override_note = NULL, pl_mode = 'normal',
          notes = CASE WHEN COALESCE(notes, '') = '' THEN
            format('Bypass original (reconciliado em v%s a %s): %s', _trigger_version_number, v_today, v_tx.pl_override_note)
            ELSE notes || E'\n' || format('Bypass original (reconciliado em v%s a %s): %s', _trigger_version_number, v_today, v_tx.pl_override_note) END
         WHERE id = v_tx.id;
        v_remaining := v_remaining - v_tx.amount;
        v_reconciled_count := v_reconciled_count + 1;
      ELSE
        v_retroactive_count := v_retroactive_count + 1;
        v_history_entry := jsonb_build_object('reduced_in_version_id', _trigger_version_id,
          'reduced_in_version_number', _trigger_version_number, 'reduced_at', v_now,
          'transaction_id', v_tx.id, 'transaction_amount', v_tx.amount,
          'budget_remaining_at_reduction', v_remaining);
        UPDATE public.event_forecasts
           SET is_retroactive_override = true,
               historic_overrides = COALESCE(historic_overrides, '[]'::jsonb) || jsonb_build_array(v_history_entry)
         WHERE event_id = _event_id AND category_id = v_cat.category_id AND type = 'expense';
      END IF;
    END LOOP;
  END LOOP;
  IF v_reconciled_count > 0 OR v_retroactive_count > 0 THEN
    INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata)
    VALUES (_trigger_version_id, _event_id, 'reconciled', _performed_by, _performed_by_label,
      jsonb_build_object('reconciled_count', v_reconciled_count, 'retroactive_count', v_retroactive_count));
  END IF;
END;
$$;

-- Phase 5b/6: create_bp_snapshot — creates a new snapshot, demotes previous active, cascades to Splits.
CREATE OR REPLACE FUNCTION public.create_bp_snapshot(
  _event_id uuid, _description text DEFAULT NULL, _approve_immediately boolean DEFAULT false,
  _scenario_label text DEFAULT NULL, _scenario_assumptions jsonb DEFAULT NULL,
  _is_pinned_scenario boolean DEFAULT false,
  _created_by uuid DEFAULT NULL, _created_by_label text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event RECORD; v_is_master boolean := false;
  v_next_version int; v_state text;
  v_master_version_id uuid; v_now timestamptz := now();
  v_payload jsonb; v_split RECORD; v_split_payload jsonb;
  v_split_version_id uuid; v_split_next_version int;
  v_previous_active_id uuid; v_split_previous_active_id uuid;
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
      FROM public.event_forecasts f WHERE f.event_id = _event_id), '[]'::jsonb)
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

  IF v_is_master THEN
    FOR v_split IN SELECT id, name, status FROM public.events WHERE parent_event_id = _event_id LOOP
      v_split_payload := jsonb_build_object(
        'event', jsonb_build_object('id', v_split.id, 'name', v_split.name, 'status', v_split.status, 'parent_event_id', _event_id),
        'snapshot_taken_at', v_now, 'cascaded_from_event_id', _event_id,
        'forecasts', COALESCE((SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.created_at)
          FROM public.event_forecasts f WHERE f.event_id = v_split.id), '[]'::jsonb));
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
$$;

-- Phase 7: discard_bp_version_draft + bp_version_linked_tx_count
CREATE OR REPLACE FUNCTION public.bp_version_linked_tx_count(_event_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COUNT(*)::int FROM public.event_forecasts f WHERE f.event_id = _event_id AND f.transaction_id IS NOT NULL; $$;

CREATE OR REPLACE FUNCTION public.discard_bp_version_draft(
  _version_id uuid, _performed_by uuid DEFAULT NULL, _performed_by_label text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_version RECORD; v_non_scenario_cascades int;
BEGIN
  SELECT * INTO v_version FROM public.bp_versions WHERE id = _version_id;
  IF v_version IS NULL THEN RAISE EXCEPTION 'Version % not found', _version_id; END IF;
  IF v_version.state <> 'draft' THEN RAISE EXCEPTION 'Apenas rascunhos podem ser descartados (estado atual: %)', v_version.state; END IF;
  SELECT COUNT(*) INTO v_non_scenario_cascades FROM public.bp_versions
   WHERE cascaded_from_version_id = _version_id AND state <> 'draft';
  IF v_non_scenario_cascades > 0 THEN
    RAISE EXCEPTION 'Não é possível descartar: existem % versão(ões) ativas/superseded em Splits que descendem deste rascunho.', v_non_scenario_cascades USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata)
  VALUES (_version_id, v_version.event_id, 'discarded', _performed_by, _performed_by_label,
    jsonb_build_object('version_number', v_version.version_number, 'scenario_label', v_version.scenario_label,
      'is_scenario', v_version.scenario_label IS NOT NULL));
  DELETE FROM public.bp_versions WHERE cascaded_from_version_id = _version_id AND state = 'draft';
  DELETE FROM public.bp_versions WHERE id = _version_id;
END;
$$;

-- Phase 8: unarchive
CREATE OR REPLACE FUNCTION public.unarchive_bp_version(
  _version_id uuid, _performed_by uuid DEFAULT NULL, _performed_by_label text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_version RECORD; v_split_version RECORD; v_new_state text;
BEGIN
  SELECT * INTO v_version FROM public.bp_versions WHERE id = _version_id;
  IF v_version IS NULL THEN RAISE EXCEPTION 'Version % not found', _version_id; END IF;
  IF v_version.state <> 'archived' THEN RETURN; END IF;
  IF v_version.approved_at IS NOT NULL THEN v_new_state := 'superseded'; ELSE v_new_state := 'draft'; END IF;
  UPDATE public.bp_versions SET state = v_new_state, archived_at = NULL WHERE id = _version_id;
  INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata)
  VALUES (_version_id, v_version.event_id, 'unarchived', _performed_by, _performed_by_label,
    jsonb_build_object('restored_state', v_new_state));
  FOR v_split_version IN SELECT * FROM public.bp_versions WHERE cascaded_from_version_id = _version_id LOOP
    IF v_split_version.state = 'archived' THEN
      UPDATE public.bp_versions SET state = v_new_state, archived_at = NULL WHERE id = v_split_version.id;
      INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata)
      VALUES (v_split_version.id, v_split_version.event_id, 'unarchived', _performed_by, _performed_by_label,
        jsonb_build_object('restored_state', v_new_state, 'cascaded_from', _version_id));
    END IF;
  END LOOP;
END;
$$;

-- Audit-log action whitelist (final list including all phases)
ALTER TABLE public.bp_version_audit_log DROP CONSTRAINT IF EXISTS bp_version_audit_log_action_check;
ALTER TABLE public.bp_version_audit_log ADD CONSTRAINT bp_version_audit_log_action_check
  CHECK (action IN ('created','scenario_created','cascaded_from_master','approved','superseded',
    'archived','unarchived','discarded','frozen','retroactive_snapshot','cascaded',
    'scenario_promoted','pinned','unpinned','reverted','reconciled','orphans_relinked',
    'kept_after_sibling_promotion','retroactive_snapshot_created','retroactive_override_applied'));

-- Auto-versioning trigger (initial / closing / reopen)
CREATE OR REPLACE FUNCTION public.auto_create_initial_bp_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_should_create_initial boolean := false;
  v_should_snapshot_closing boolean := false;
  v_should_snapshot_reopen boolean := false;
  v_has_versions boolean := false;
  v_description text;
BEGIN
  IF NEW.parent_event_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.bp_versions WHERE event_id = NEW.id) INTO v_has_versions;
  IF NEW.status IN ('confirmed', 'active') THEN
    IF TG_OP = 'INSERT' THEN v_should_create_initial := NOT v_has_versions;
    ELSIF TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status NOT IN ('confirmed', 'active'))
      AND NEW.status IN ('confirmed', 'active') AND NOT v_has_versions THEN
      v_should_create_initial := true;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status = 'active' AND NEW.status = 'completed' THEN v_should_snapshot_closing := true; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status
    AND OLD.status = 'completed' AND NEW.status IN ('active', 'confirmed') THEN v_should_snapshot_reopen := true; END IF;
  IF v_should_create_initial THEN
    BEGIN PERFORM public.create_bp_snapshot(_event_id := NEW.id,
      _description := 'Versão inicial — auto-criada ao ' || CASE NEW.status WHEN 'confirmed' THEN 'confirmar evento' ELSE 'ativar evento' END,
      _approve_immediately := true, _created_by := NULL, _created_by_label := 'sistema (auto v1)');
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'auto initial failed for %: %', NEW.id, SQLERRM; END;
  END IF;
  IF v_should_snapshot_closing THEN
    IF NOT EXISTS (SELECT 1 FROM public.bp_versions WHERE event_id = NEW.id AND state = 'active' AND description LIKE '%Fecho automático%') THEN
      BEGIN v_description := 'Fecho automático — snapshot ao concluir evento (' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ')';
      PERFORM public.create_bp_snapshot(_event_id := NEW.id, _description := v_description,
        _approve_immediately := true, _created_by := NULL, _created_by_label := 'sistema (auto fecho)');
      EXCEPTION WHEN OTHERS THEN RAISE WARNING 'auto closing failed for %: %', NEW.id, SQLERRM; END;
    END IF;
  END IF;
  IF v_should_snapshot_reopen THEN
    BEGIN v_description := 'Reabertura — snapshot ao reabrir evento concluído (' || to_char(now(), 'DD/MM/YYYY HH24:MI') || ')';
    PERFORM public.create_bp_snapshot(_event_id := NEW.id, _description := v_description,
      _approve_immediately := true, _created_by := NULL, _created_by_label := 'sistema (auto reabertura)');
    EXCEPTION WHEN OTHERS THEN RAISE WARNING 'auto reopen failed for %: %', NEW.id, SQLERRM; END;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_create_initial_bp_version ON public.events;
CREATE TRIGGER trg_auto_create_initial_bp_version
AFTER INSERT OR UPDATE OF status ON public.events
FOR EACH ROW EXECUTE FUNCTION public.auto_create_initial_bp_version();

-- Retroactive split snapshots trigger
CREATE OR REPLACE FUNCTION public.auto_create_retroactive_split_snapshots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_master_version RECORD; v_split_payload jsonb; v_split_version_id uuid; v_now timestamptz := now();
BEGIN
  IF NEW.parent_event_id IS NULL THEN RETURN NEW; END IF;
  FOR v_master_version IN
    SELECT mv.* FROM public.bp_versions mv
     WHERE mv.event_id = NEW.parent_event_id
       AND NOT EXISTS (SELECT 1 FROM public.bp_versions sv WHERE sv.event_id = NEW.id AND sv.cascaded_from_version_id = mv.id)
     ORDER BY mv.version_number ASC
  LOOP
    BEGIN
      v_split_payload := jsonb_build_object(
        'event', jsonb_build_object('id', NEW.id, 'name', NEW.name, 'status', NEW.status, 'parent_event_id', NEW.parent_event_id),
        'snapshot_taken_at', v_now, 'cascaded_from_event_id', NEW.parent_event_id,
        'is_retroactive_snapshot', true,
        'forecasts', COALESCE((SELECT jsonb_agg(to_jsonb(f.*) ORDER BY f.created_at) FROM public.event_forecasts f WHERE f.event_id = NEW.id), '[]'::jsonb));
      INSERT INTO public.bp_versions (event_id, version_number, state, created_by, created_by_label,
        description, snapshot_payload, approved_at, approved_by, superseded_at, superseded_by_version_id,
        archived_at, cascaded_from_version_id, scenario_label, scenario_assumptions, is_pinned_scenario, is_retroactive_snapshot)
      VALUES (NEW.id, v_master_version.version_number, v_master_version.state, NULL, 'sistema (split retroativo)',
        format('Snapshot retroativo — Split adicionado após v%s do Master', v_master_version.version_number),
        v_split_payload, v_master_version.approved_at, v_master_version.approved_by,
        v_master_version.superseded_at, v_master_version.superseded_by_version_id, v_master_version.archived_at,
        v_master_version.id, v_master_version.scenario_label, v_master_version.scenario_assumptions, false, true)
      RETURNING id INTO v_split_version_id;
      INSERT INTO public.bp_version_audit_log (version_id, event_id, action, performed_by, performed_by_label, metadata)
      VALUES (v_split_version_id, NEW.id, 'retroactive_snapshot_created', NULL, 'sistema (split retroativo)',
        jsonb_build_object('master_version_id', v_master_version.id, 'master_event_id', NEW.parent_event_id,
          'master_version_number', v_master_version.version_number, 'master_state', v_master_version.state, 'split_event_id', NEW.id));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_create_retroactive_split_snapshots failed for split % / master version %: %', NEW.id, v_master_version.id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_create_retroactive_split_snapshots ON public.events;
CREATE TRIGGER trg_auto_create_retroactive_split_snapshots
AFTER INSERT ON public.events
FOR EACH ROW EXECUTE FUNCTION public.auto_create_retroactive_split_snapshots();