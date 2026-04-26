CREATE OR REPLACE FUNCTION public._revert_event_to_version(
  _event_id uuid,
  _target_version_id uuid,
  _performed_by uuid,
  _performed_by_label text,
  _force boolean
)
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
      'linked_tx_count', v_linked_count
    )
  );
END;
$function$;