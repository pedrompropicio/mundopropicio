CREATE OR REPLACE FUNCTION public.promote_scenario_draft_to_active(_scenario_version_id uuid, _new_active_label text DEFAULT NULL::text, _new_active_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_label text;
  v_scenario record;
  v_split_scenario record;
  v_old_active record;
  v_next_number int;
  v_tx_links jsonb;
  v_tx_result jsonb;
BEGIN
  IF NOT (
    public.has_role(v_user_id, 'admin'::app_role)
    OR public.has_role(v_user_id, 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Apenas admin ou manager pode promover cenários';
  END IF;

  SELECT COALESCE(full_name, email, 'Sistema') INTO v_user_label
    FROM public.profiles WHERE id = v_user_id;

  SELECT * INTO v_scenario FROM public.bp_versions WHERE id = _scenario_version_id;

  IF NOT FOUND OR v_scenario.state <> 'working_draft' THEN
    RAISE EXCEPTION 'Cenário inválido ou já promovido';
  END IF;

  -- ============ MASTER ============
  SELECT * INTO v_old_active
    FROM public.bp_versions
    WHERE event_id = v_scenario.event_id AND state = 'active'
    LIMIT 1;

  IF FOUND THEN
    UPDATE public.bp_versions
      SET state = 'superseded', superseded_at = now(), superseded_by_version_id = _scenario_version_id
      WHERE id = v_old_active.id;
  END IF;

  UPDATE public.bp_versions
    SET state = 'active',
        approved_at = now(),
        approved_by = v_user_id,
        description = COALESCE(_new_active_description, description, scenario_label),
        scenario_label = NULL
    WHERE id = _scenario_version_id;

  -- Captura vínculos BP↔TX antes de o DELETE disparar o ON DELETE SET NULL
  v_tx_links := public.bp_capture_tx_links(v_scenario.event_id);

  DELETE FROM public.event_forecasts
    WHERE event_id = v_scenario.event_id AND version_id IS NULL;

  UPDATE public.event_forecasts
    SET version_id = NULL
    WHERE version_id = _scenario_version_id;

  v_tx_result := public.bp_restore_tx_links(v_scenario.event_id, v_tx_links);

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    _scenario_version_id, v_scenario.event_id, 'scenario_promoted_to_active',
    v_user_id, v_user_label,
    jsonb_build_object('previous_active_id', v_old_active.id,
                      'scenario_label', v_scenario.scenario_label,
                      'tx_links', v_tx_result)
  );

  -- ============ SPLITS (cascade) ============
  FOR v_split_scenario IN
    SELECT * FROM public.bp_versions
    WHERE cascaded_from_version_id = _scenario_version_id AND state = 'working_draft'
  LOOP
    SELECT * INTO v_old_active
      FROM public.bp_versions
      WHERE event_id = v_split_scenario.event_id AND state = 'active'
      LIMIT 1;

    IF FOUND THEN
      UPDATE public.bp_versions
        SET state = 'superseded', superseded_at = now(), superseded_by_version_id = v_split_scenario.id
        WHERE id = v_old_active.id;
    END IF;

    UPDATE public.bp_versions
      SET state = 'active',
          approved_at = now(),
          approved_by = v_user_id,
          description = COALESCE(_new_active_description, description, scenario_label),
          scenario_label = NULL
      WHERE id = v_split_scenario.id;

    v_tx_links := public.bp_capture_tx_links(v_split_scenario.event_id);

    DELETE FROM public.event_forecasts
      WHERE event_id = v_split_scenario.event_id AND version_id IS NULL;

    UPDATE public.event_forecasts
      SET version_id = NULL
      WHERE version_id = v_split_scenario.id;

    v_tx_result := public.bp_restore_tx_links(v_split_scenario.event_id, v_tx_links);

    INSERT INTO public.bp_version_audit_log (
      version_id, event_id, action, performed_by, performed_by_label, metadata
    ) VALUES (
      v_split_scenario.id, v_split_scenario.event_id, 'scenario_promoted_to_active_cascade',
      v_user_id, v_user_label,
      jsonb_build_object('parent_scenario_id', _scenario_version_id,
                         'tx_links', v_tx_result)
    );
  END LOOP;

  RETURN _scenario_version_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rename_bp_version(_version_id uuid, _new_label text DEFAULT NULL::text, _new_description text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_label text;
  v_version record;
  v_new_label text;
  v_new_description text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida — é necessário estar autenticado.';
  END IF;

  IF NOT (
    public.has_role(v_user_id, 'admin'::app_role)
    OR public.has_role(v_user_id, 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Apenas admin ou manager pode renomear versões do BP.';
  END IF;

  SELECT * INTO v_version FROM public.bp_versions WHERE id = _version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versão do BP não encontrada.';
  END IF;

  -- scenario_label: só editável se já existir; nunca pode ficar vazio nem ser criado
  IF v_version.scenario_label IS NOT NULL THEN
    IF _new_label IS NULL THEN
      v_new_label := v_version.scenario_label;
    ELSIF btrim(_new_label) = '' THEN
      RAISE EXCEPTION 'Um cenário tem sempre de ter nome.';
    ELSE
      v_new_label := btrim(_new_label);
    END IF;
  ELSE
    v_new_label := NULL;
  END IF;

  IF _new_description IS NULL THEN
    v_new_description := v_version.description;
  ELSIF btrim(_new_description) = '' THEN
    v_new_description := NULL;
  ELSE
    v_new_description := btrim(_new_description);
  END IF;

  UPDATE public.bp_versions
    SET scenario_label = v_new_label,
        description = v_new_description
    WHERE id = _version_id;

  SELECT COALESCE(full_name, email, 'Sistema') INTO v_user_label
    FROM public.profiles WHERE id = v_user_id;

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    _version_id, v_version.event_id, 'renamed', v_user_id, COALESCE(v_user_label, 'Sistema'),
    jsonb_build_object(
      'old_scenario_label', v_version.scenario_label,
      'new_scenario_label', v_new_label,
      'old_description', v_version.description,
      'new_description', v_new_description
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rename_bp_version(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_bp_version(uuid, text, text) TO authenticated;