-- Archive a version (master + cascade to splits)
CREATE OR REPLACE FUNCTION public.archive_bp_version(
  _version_id uuid,
  _performed_by uuid DEFAULT NULL,
  _performed_by_label text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_version RECORD;
  v_split_version RECORD;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_version FROM public.bp_versions WHERE id = _version_id;
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Version % not found', _version_id;
  END IF;

  IF v_version.state = 'active' THEN
    RAISE EXCEPTION 'Não é possível arquivar a versão ativa. Crie uma nova versão ativa primeiro.';
  END IF;

  IF v_version.state = 'archived' THEN
    RETURN;
  END IF;

  -- Update master/standalone version
  UPDATE public.bp_versions
     SET state = 'archived',
         archived_at = v_now
   WHERE id = _version_id;

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    _version_id, v_version.event_id, 'archived', _performed_by, _performed_by_label,
    jsonb_build_object('previous_state', v_version.state)
  );

  -- Cascade to splits if this was a master version
  FOR v_split_version IN
    SELECT * FROM public.bp_versions WHERE cascaded_from_version_id = _version_id
  LOOP
    IF v_split_version.state <> 'active' AND v_split_version.state <> 'archived' THEN
      UPDATE public.bp_versions
         SET state = 'archived',
             archived_at = v_now
       WHERE id = v_split_version.id;

      INSERT INTO public.bp_version_audit_log (
        version_id, event_id, action, performed_by, performed_by_label, metadata
      ) VALUES (
        v_split_version.id, v_split_version.event_id, 'archived',
        _performed_by, _performed_by_label,
        jsonb_build_object('previous_state', v_split_version.state, 'cascaded_from', _version_id)
      );
    END IF;
  END LOOP;
END;
$function$;

-- Unarchive a version
CREATE OR REPLACE FUNCTION public.unarchive_bp_version(
  _version_id uuid,
  _performed_by uuid DEFAULT NULL,
  _performed_by_label text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_version RECORD;
  v_split_version RECORD;
  v_new_state text;
BEGIN
  SELECT * INTO v_version FROM public.bp_versions WHERE id = _version_id;
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Version % not found', _version_id;
  END IF;

  IF v_version.state <> 'archived' THEN
    RETURN;
  END IF;

  -- Restore to draft (if no approved_at) or superseded (if there is a newer active)
  IF v_version.approved_at IS NOT NULL THEN
    v_new_state := 'superseded';
  ELSE
    v_new_state := 'draft';
  END IF;

  UPDATE public.bp_versions
     SET state = v_new_state,
         archived_at = NULL
   WHERE id = _version_id;

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    _version_id, v_version.event_id, 'unarchived', _performed_by, _performed_by_label,
    jsonb_build_object('restored_state', v_new_state)
  );

  FOR v_split_version IN
    SELECT * FROM public.bp_versions WHERE cascaded_from_version_id = _version_id
  LOOP
    IF v_split_version.state = 'archived' THEN
      UPDATE public.bp_versions
         SET state = v_new_state,
             archived_at = NULL
       WHERE id = v_split_version.id;

      INSERT INTO public.bp_version_audit_log (
        version_id, event_id, action, performed_by, performed_by_label, metadata
      ) VALUES (
        v_split_version.id, v_split_version.event_id, 'unarchived',
        _performed_by, _performed_by_label,
        jsonb_build_object('restored_state', v_new_state, 'cascaded_from', _version_id)
      );
    END IF;
  END LOOP;
END;
$function$;

-- Discard a draft (delete permanently)
CREATE OR REPLACE FUNCTION public.discard_bp_version_draft(
  _version_id uuid,
  _performed_by uuid DEFAULT NULL,
  _performed_by_label text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_version RECORD;
BEGIN
  SELECT * INTO v_version FROM public.bp_versions WHERE id = _version_id;
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Version % not found', _version_id;
  END IF;

  IF v_version.state <> 'draft' THEN
    RAISE EXCEPTION 'Apenas rascunhos podem ser descartados (estado atual: %)', v_version.state;
  END IF;

  -- Audit BEFORE delete (cascaded splits also deleted by FK)
  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    _version_id, v_version.event_id, 'discarded', _performed_by, _performed_by_label,
    jsonb_build_object(
      'version_number', v_version.version_number,
      'scenario_label', v_version.scenario_label
    )
  );

  -- Cascade to splits cascaded from this draft
  DELETE FROM public.bp_versions
   WHERE cascaded_from_version_id = _version_id
     AND state = 'draft';

  DELETE FROM public.bp_versions WHERE id = _version_id;
END;
$function$;

-- Allow new audit actions
ALTER TABLE public.bp_version_audit_log
  DROP CONSTRAINT IF EXISTS bp_version_audit_log_action_check;

ALTER TABLE public.bp_version_audit_log
  ADD CONSTRAINT bp_version_audit_log_action_check
  CHECK (action IN (
    'created', 'approved', 'superseded', 'archived', 'unarchived',
    'discarded', 'cascaded_from_master', 'scenario_created',
    'scenario_promoted', 'pinned', 'unpinned', 'reverted'
  ));