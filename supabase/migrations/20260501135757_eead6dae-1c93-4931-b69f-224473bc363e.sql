CREATE OR REPLACE FUNCTION public.merge_forecasts_into_active_snapshot(
  _event_id uuid,
  _forecast_ids uuid[]
)
RETURNS TABLE (
  merged_into_master integer,
  merged_into_splits integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role_ok boolean;
  _master_version_id uuid;
  _master_payload jsonb;
  _master_forecasts jsonb;
  _new_rows jsonb;
  _existing_ids uuid[];
  _master_count integer := 0;
  _split_count integer := 0;
  _split_event record;
  _split_version_id uuid;
  _split_payload jsonb;
  _split_forecasts jsonb;
  _split_new_rows jsonb;
  _split_existing_ids uuid[];
BEGIN
  -- Permission check
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('admin','manager','editor')
  ) INTO _role_ok;
  IF NOT _role_ok THEN
    RAISE EXCEPTION 'Permissão negada: só admin/manager/editor podem incorporar linhas no snapshot.';
  END IF;

  IF _forecast_ids IS NULL OR array_length(_forecast_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- ── MASTER ────────────────────────────────────────────────────────────
  SELECT id, snapshot_payload
    INTO _master_version_id, _master_payload
  FROM public.bp_versions
  WHERE event_id = _event_id AND state = 'active'
  LIMIT 1;

  IF _master_version_id IS NULL THEN
    RAISE EXCEPTION 'Evento sem versão ativa de BP — congele uma versão antes de incorporar.';
  END IF;

  _master_forecasts := COALESCE(_master_payload->'forecasts', '[]'::jsonb);

  -- IDs já existentes no snapshot
  SELECT COALESCE(array_agg((elem->>'id')::uuid), ARRAY[]::uuid[])
    INTO _existing_ids
  FROM jsonb_array_elements(_master_forecasts) elem;

  -- Build snapshot rows for forecasts not already in snapshot
  SELECT COALESCE(jsonb_agg(to_jsonb(f) - 'formalidade'), '[]'::jsonb)
    INTO _new_rows
  FROM public.event_forecasts f
  WHERE f.event_id = _event_id
    AND f.id = ANY(_forecast_ids)
    AND NOT (f.id = ANY(_existing_ids));

  IF jsonb_array_length(_new_rows) > 0 THEN
    _master_payload := jsonb_set(
      COALESCE(_master_payload, '{}'::jsonb),
      '{forecasts}',
      _master_forecasts || _new_rows,
      true
    );
    UPDATE public.bp_versions
       SET snapshot_payload = _master_payload
     WHERE id = _master_version_id;
    _master_count := jsonb_array_length(_new_rows);
  END IF;

  -- ── SPLITS (quando existirem linhas filhas via master_forecast_id) ────
  FOR _split_event IN
    SELECT DISTINCT ef.event_id AS split_event_id
    FROM public.event_forecasts ef
    WHERE ef.master_forecast_id = ANY(_forecast_ids)
      AND ef.event_id <> _event_id
  LOOP
    SELECT id, snapshot_payload
      INTO _split_version_id, _split_payload
    FROM public.bp_versions
    WHERE event_id = _split_event.split_event_id AND state = 'active'
    LIMIT 1;

    IF _split_version_id IS NULL THEN
      CONTINUE;
    END IF;

    _split_forecasts := COALESCE(_split_payload->'forecasts', '[]'::jsonb);

    SELECT COALESCE(array_agg((elem->>'id')::uuid), ARRAY[]::uuid[])
      INTO _split_existing_ids
    FROM jsonb_array_elements(_split_forecasts) elem;

    SELECT COALESCE(jsonb_agg(to_jsonb(f) - 'formalidade'), '[]'::jsonb)
      INTO _split_new_rows
    FROM public.event_forecasts f
    WHERE f.event_id = _split_event.split_event_id
      AND f.master_forecast_id = ANY(_forecast_ids)
      AND NOT (f.id = ANY(_split_existing_ids));

    IF jsonb_array_length(_split_new_rows) > 0 THEN
      _split_payload := jsonb_set(
        COALESCE(_split_payload, '{}'::jsonb),
        '{forecasts}',
        _split_forecasts || _split_new_rows,
        true
      );
      UPDATE public.bp_versions
         SET snapshot_payload = _split_payload
       WHERE id = _split_version_id;
      _split_count := _split_count + jsonb_array_length(_split_new_rows);
    END IF;
  END LOOP;

  RETURN QUERY SELECT _master_count, _split_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_forecasts_into_active_snapshot(uuid, uuid[]) TO authenticated;