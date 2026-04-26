-- Phase 10b — Reconciliation guards for scenario promote/discard
--
-- 1. promote_scenario_to_active gains a `_force` flag and refuses to run when
--    the current active BP has transactions linked to its forecasts (would
--    otherwise orphan them, since the snapshot deliberately drops transaction_id).
-- 2. The cascade to Splits ALSO refuses unless _force is true and a Split has
--    linked transactions — keeps Master/Split BP coherent.
-- 3. discard_bp_version_draft is hardened: a scenario draft never carries
--    active forecasts, so no reconciliation is required, but we now refuse to
--    discard a draft that has been "cascaded from" by other event drafts that
--    are NOT scenarios (those are non-scenario draft cascades — should not
--    silently disappear).

CREATE OR REPLACE FUNCTION public.promote_scenario_to_active(
  _scenario_version_id uuid,
  _description text DEFAULT NULL,
  _performed_by uuid DEFAULT NULL,
  _performed_by_label text DEFAULT NULL,
  _force boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  v_linked_master int;
  v_linked_split int;
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

  -- Safety: block when active forecasts of the Master have linked transactions
  v_linked_master := public.bp_version_linked_tx_count(v_scenario.event_id);
  IF v_linked_master > 0 AND NOT _force THEN
    RAISE EXCEPTION 'Promoção bloqueada: existem % linha(s) do BP atual com transações vinculadas. Confirme com a opção "Forçar" para promover assim mesmo (as transações ficarão órfãs do BP).', v_linked_master
      USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_previous_active_id
    FROM public.bp_versions
   WHERE event_id = v_scenario.event_id AND state = 'active'
   LIMIT 1;

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
       SET state = 'superseded',
           superseded_at = v_now,
           superseded_by_version_id = v_new_version_id
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
      'forced', _force,
      'linked_tx_orphaned', v_linked_master
    )
  );

  -- Replace event_forecasts with the scenario snapshot
  DELETE FROM public.event_forecasts WHERE event_id = v_scenario.event_id;

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
    COALESCE(r->>'status', 'pending'),
    NULLIF(r->>'approved_at', '')::timestamptz,
    NULLIF(r->>'approved_by', '')::uuid,
    NULL,
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
    COALESCE(NULLIF(r->>'created_at', '')::timestamptz, v_now),
    v_now
  FROM jsonb_array_elements(COALESCE(v_scenario.snapshot_payload->'forecasts', '[]'::jsonb)) r;

  -- Reconcile bypasses against the new approved budget
  BEGIN
    PERFORM public.reconcile_bp_overrides_for_event(
      v_scenario.event_id, v_new_version_id, v_next_version,
      _performed_by, _performed_by_label
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Reconciliation failed for event %: %', v_scenario.event_id, SQLERRM;
  END;

  -- Cascade to Splits
  FOR v_split IN
    SELECT id FROM public.events WHERE parent_event_id = v_event.id
  LOOP
    SELECT * INTO v_split_scenario
      FROM public.bp_versions
     WHERE event_id = v_split.id
       AND cascaded_from_version_id = _scenario_version_id
     LIMIT 1;

    IF v_split_scenario IS NULL THEN
      CONTINUE;
    END IF;

    -- Same safety on Splits
    v_linked_split := public.bp_version_linked_tx_count(v_split.id);
    IF v_linked_split > 0 AND NOT _force THEN
      RAISE EXCEPTION 'Promoção bloqueada no Split %: % linha(s) do BP têm transações vinculadas. Use "Forçar" para prosseguir (Master e demais Splits também serão revertidos).', v_split.id, v_linked_split
        USING ERRCODE = 'P0001';
    END IF;

    SELECT id INTO v_split_previous_active_id
      FROM public.bp_versions
     WHERE event_id = v_split.id AND state = 'active'
     LIMIT 1;

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
      COALESCE(_description, format('Promovido do cenário "%s"', v_scenario.scenario_label)),
      v_split_scenario.snapshot_payload, v_now, _performed_by,
      v_new_version_id
    )
    RETURNING id INTO v_split_new_version_id;

    IF v_split_previous_active_id IS NOT NULL THEN
      UPDATE public.bp_versions
         SET state = 'superseded',
             superseded_at = v_now,
             superseded_by_version_id = v_split_new_version_id
       WHERE id = v_split_previous_active_id;

      INSERT INTO public.bp_version_audit_log (
        version_id, event_id, action, performed_by, performed_by_label, metadata
      ) VALUES (
        v_split_previous_active_id, v_split.id, 'superseded',
        _performed_by, _performed_by_label,
        jsonb_build_object('superseded_by_version_id', v_split_new_version_id, 'cause', 'scenario_promoted')
      );
    END IF;

    UPDATE public.bp_versions
       SET is_pinned_scenario = false
     WHERE id = v_split_scenario.id;

    INSERT INTO public.bp_version_audit_log (
      version_id, event_id, action, performed_by, performed_by_label, metadata
    ) VALUES (
      v_split_new_version_id, v_split.id, 'scenario_promoted',
      _performed_by, _performed_by_label,
      jsonb_build_object(
        'source_scenario_id', v_split_scenario.id,
        'master_scenario_id', _scenario_version_id,
        'cascaded_from', v_new_version_id,
        'forced', _force,
        'linked_tx_orphaned', v_linked_split
      )
    );

    DELETE FROM public.event_forecasts WHERE event_id = v_split.id;

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
    SELECT
      COALESCE((r->>'id')::uuid, gen_random_uuid()),
      v_split.id,
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
      COALESCE(r->>'status', 'pending'),
      NULLIF(r->>'approved_at', '')::timestamptz,
      NULLIF(r->>'approved_by', '')::uuid,
      NULL,
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
      COALESCE(NULLIF(r->>'created_at', '')::timestamptz, v_now),
      v_now
    FROM jsonb_array_elements(COALESCE(v_split_scenario.snapshot_payload->'forecasts', '[]'::jsonb)) r;

    BEGIN
      PERFORM public.reconcile_bp_overrides_for_event(
        v_split.id, v_split_new_version_id, v_split_next_version,
        _performed_by, _performed_by_label
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Reconciliation failed for split %: %', v_split.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_new_version_id;
END;
$$;


-- Discard hardening: refuse if other event drafts cascade from this one and
-- are NOT scenario drafts (would silently delete cross-event work).
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
  v_non_scenario_cascades int;
BEGIN
  SELECT * INTO v_version FROM public.bp_versions WHERE id = _version_id;
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'Version % not found', _version_id;
  END IF;

  IF v_version.state <> 'draft' THEN
    RAISE EXCEPTION 'Apenas rascunhos podem ser descartados (estado atual: %)', v_version.state;
  END IF;

  SELECT COUNT(*) INTO v_non_scenario_cascades
    FROM public.bp_versions
   WHERE cascaded_from_version_id = _version_id
     AND state <> 'draft';
  IF v_non_scenario_cascades > 0 THEN
    RAISE EXCEPTION 'Não é possível descartar: existem % versão(ões) ativas/superseded em Splits que descendem deste rascunho.', v_non_scenario_cascades
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.bp_version_audit_log (
    version_id, event_id, action, performed_by, performed_by_label, metadata
  ) VALUES (
    _version_id, v_version.event_id, 'discarded', _performed_by, _performed_by_label,
    jsonb_build_object(
      'version_number', v_version.version_number,
      'scenario_label', v_version.scenario_label,
      'is_scenario', v_version.scenario_label IS NOT NULL
    )
  );

  -- Cascade to splits cascaded from this draft (only drafts)
  DELETE FROM public.bp_versions
   WHERE cascaded_from_version_id = _version_id
     AND state = 'draft';

  DELETE FROM public.bp_versions WHERE id = _version_id;
END;
$function$;