-- =====================================================================
-- Helpers: captura/reposição de vínculos transactions.forecast_id
-- =====================================================================

CREATE OR REPLACE FUNCTION public.bp_capture_tx_links(_event_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'tx_id', t.id,
      'forecast_id', f.id,
      'category_id', f.category_id,
      'description', f.description
    )), '[]'::jsonb)
  FROM public.transactions t
  JOIN public.event_forecasts f ON f.id = t.forecast_id
  WHERE f.event_id = _event_id
    AND f.version_id IS NULL;
$function$;

REVOKE EXECUTE ON FUNCTION public.bp_capture_tx_links(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bp_capture_tx_links(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bp_capture_tx_links(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.bp_restore_tx_links(_event_id uuid, _links jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_by_id int := 0;
  v_by_desc int := 0;
  v_ambiguous int := 0;
  v_unmatched int := 0;
  v_target uuid;
  v_cnt int;
BEGIN
  IF _links IS NULL OR jsonb_typeof(_links) <> 'array' THEN
    RETURN jsonb_build_object('relinked', 0, 'by_id', 0, 'by_description', 0,
                              'ambiguous', 0, 'unmatched', 0);
  END IF;

  FOR r IN
    SELECT (e->>'tx_id')::uuid AS tx_id,
           NULLIF(e->>'forecast_id','')::uuid AS forecast_id,
           NULLIF(e->>'category_id','')::uuid AS category_id,
           e->>'description' AS description
      FROM jsonb_array_elements(_links) AS e
  LOOP
    v_target := NULL;

    -- 1) mesma linha, se continuar viva
    SELECT f.id INTO v_target
      FROM public.event_forecasts f
     WHERE f.id = r.forecast_id
       AND f.event_id = _event_id
       AND f.version_id IS NULL;

    IF v_target IS NOT NULL THEN
      UPDATE public.transactions SET forecast_id = v_target WHERE id = r.tx_id;
      v_by_id := v_by_id + 1;
      CONTINUE;
    END IF;

    -- 2) (category_id, description) — só quando há exactamente uma candidata
    SELECT count(*) INTO v_cnt
      FROM public.event_forecasts f
     WHERE f.event_id = _event_id
       AND f.version_id IS NULL
       AND f.category_id IS NOT DISTINCT FROM r.category_id
       AND f.description IS NOT DISTINCT FROM r.description;

    IF v_cnt = 1 THEN
      SELECT f.id INTO v_target
        FROM public.event_forecasts f
       WHERE f.event_id = _event_id
         AND f.version_id IS NULL
         AND f.category_id IS NOT DISTINCT FROM r.category_id
         AND f.description IS NOT DISTINCT FROM r.description
       LIMIT 1;
      UPDATE public.transactions SET forecast_id = v_target WHERE id = r.tx_id;
      v_by_desc := v_by_desc + 1;
    ELSIF v_cnt > 1 THEN
      v_ambiguous := v_ambiguous + 1;
    ELSE
      v_unmatched := v_unmatched + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'relinked', v_by_id + v_by_desc,
    'by_id', v_by_id,
    'by_description', v_by_desc,
    'ambiguous', v_ambiguous,
    'unmatched', v_unmatched
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.bp_restore_tx_links(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bp_restore_tx_links(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bp_restore_tx_links(uuid, jsonb) TO service_role;

-- =====================================================================
-- Trava: contar vínculos reais (transactions.forecast_id), não a âncora
-- =====================================================================

CREATE OR REPLACE FUNCTION public.bp_version_linked_tx_count(_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT count(*)::int
    FROM public.transactions t
    JOIN public.event_forecasts f ON f.id = t.forecast_id
   WHERE f.event_id = _event_id
     AND f.version_id IS NULL;
$function$;

-- =====================================================================
-- promote_scenario_draft_to_active
-- =====================================================================

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
        scenario_label = COALESCE(_new_active_label, scenario_label),
        description = COALESCE(_new_active_description, description)
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
      SET state = 'active', approved_at = now(), approved_by = v_user_id
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

-- =====================================================================
-- _revert_event_to_version
-- =====================================================================

CREATE OR REPLACE FUNCTION public._revert_event_to_version(_event_id uuid, _target_version_id uuid, _performed_by uuid, _performed_by_label text, _force boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target RECORD;
  v_active_id uuid;
  v_linked_count int;
  v_now timestamptz := now();
  v_next_version int;
  v_new_version_id uuid;
  v_payload jsonb;
  v_row jsonb;
  v_tx_links jsonb;
  v_tx_result jsonb;
BEGIN
  SELECT * INTO v_target FROM public.bp_versions WHERE id = _target_version_id;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'Target version % not found', _target_version_id;
  END IF;
  IF v_target.event_id <> _event_id THEN
    RAISE EXCEPTION 'Version % does not belong to event %', _target_version_id, _event_id;
  END IF;

  v_linked_count := public.bp_version_linked_tx_count(_event_id);
  IF v_linked_count > 0 AND NOT _force THEN
    RAISE EXCEPTION 'Reversão bloqueada: existem % linha(s) do BP atual com transações vinculadas. Desvincule ou elimine essas transações antes de reverter.', v_linked_count
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_active_id
    FROM public.bp_versions
   WHERE event_id = _event_id AND state = 'active'
   LIMIT 1;

  -- Demote active BEFORE inserting new active to satisfy partial unique index.
  IF v_active_id IS NOT NULL THEN
    UPDATE public.bp_versions
       SET state = 'superseded',
           superseded_at = v_now
     WHERE id = v_active_id;
  END IF;

  -- Captura vínculos BP↔TX antes do DELETE (ON DELETE SET NULL apaga-os).
  v_tx_links := public.bp_capture_tx_links(_event_id);

  DELETE FROM public.event_forecasts WHERE event_id = _event_id;

  v_payload := COALESCE(v_target.snapshot_payload->'forecasts', '[]'::jsonb);
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_payload)
  LOOP
    INSERT INTO public.event_forecasts (
      id, event_id, category_id, type, description, amount, currency,
      original_amount, fx_rate, fx_rate_source,
      formula_type, formula_value, iva_rate, status,
      approved_at, approved_by, transaction_id, cache_config_id,
      master_forecast_id, invoice_group_id, attachment_refs,
      historic_overrides, is_overhead, is_retroactive_override,
      is_transitory, exclude_from_result, notes, specification,
      created_at, updated_at
    )
    VALUES (
      COALESCE((v_row->>'id')::uuid, gen_random_uuid()),
      _event_id,
      NULLIF(v_row->>'category_id', '')::uuid,
      v_row->>'type',
      v_row->>'description',
      COALESCE((v_row->>'amount')::numeric, 0),
      COALESCE(v_row->>'currency', 'EUR'),
      NULLIF(v_row->>'original_amount', '')::numeric,
      NULLIF(v_row->>'fx_rate', '')::numeric,
      v_row->>'fx_rate_source',
      COALESCE(v_row->>'formula_type', 'fixed'),
      COALESCE((v_row->>'formula_value')::numeric, 0),
      COALESCE((v_row->>'iva_rate')::numeric, 0),
      COALESCE(v_row->>'status', 'pending'),
      NULLIF(v_row->>'approved_at', '')::timestamptz,
      NULLIF(v_row->>'approved_by', '')::uuid,
      NULL,
      NULLIF(v_row->>'cache_config_id', '')::uuid,
      NULLIF(v_row->>'master_forecast_id', '')::uuid,
      NULLIF(v_row->>'invoice_group_id', '')::uuid,
      COALESCE(v_row->'attachment_refs', '[]'::jsonb),
      COALESCE(v_row->'historic_overrides', '[]'::jsonb),
      COALESCE((v_row->>'is_overhead')::boolean, false),
      COALESCE((v_row->>'is_retroactive_override')::boolean, false),
      COALESCE((v_row->>'is_transitory')::boolean, false),
      COALESCE((v_row->>'exclude_from_result')::boolean, false),
      v_row->>'notes',
      v_row->>'specification',
      COALESCE(NULLIF(v_row->>'created_at', '')::timestamptz, v_now),
      v_now
    );
  END LOOP;

  v_tx_result := public.bp_restore_tx_links(_event_id, v_tx_links);

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_version
    FROM public.bp_versions
   WHERE event_id = _event_id;

  INSERT INTO public.bp_versions (
    event_id, version_number, state, created_by, created_by_label,
    description, snapshot_payload, approved_at, approved_by,
    is_retroactive_snapshot, cascaded_from_version_id
  )
  VALUES (
    _event_id, v_next_version, 'active', _performed_by, _performed_by_label,
    format('Reversão para v%s', v_target.version_number),
    v_target.snapshot_payload, v_now, _performed_by,
    true, NULL
  )
  RETURNING id INTO v_new_version_id;

  IF v_active_id IS NOT NULL AND v_active_id <> v_new_version_id THEN
    UPDATE public.bp_versions
       SET superseded_by_version_id = v_new_version_id
     WHERE id = v_active_id;

    INSERT INTO public.bp_version_audit_log (
      version_id, event_id, action, performed_by, performed_by_label, metadata
    ) VALUES (
      v_active_id, _event_id, 'superseded', _performed_by, _performed_by_label,
      jsonb_build_object('superseded_by_version_id', v_new_version_id, 'cause', 'revert')
    );
  END IF;

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    v_new_version_id, _event_id, 'reverted', _performed_by, _performed_by_label,
    jsonb_build_object(
      'reverted_to_version_id', _target_version_id,
      'reverted_to_version_number', v_target.version_number,
      'previous_active_id', v_active_id,
      'forced', _force,
      'linked_tx_count', v_linked_count,
      'tx_links', v_tx_result
    )
  );
END;
$function$;
