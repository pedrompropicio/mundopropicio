-- RPC: batch_update_event_forecasts
-- Phase A.1 — UPDATEs only. Validates L3 category, FK, type match, IVA, locked rows, scope.
-- Returns array of {id, ok, error} per row. Whole transaction rolls back if any row fails.

CREATE OR REPLACE FUNCTION public.batch_update_event_forecasts(
  _event_id uuid,
  _version_id uuid DEFAULT NULL,
  _edits jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_caller uuid := auth.uid();
  v_can_edit boolean;
  v_edit jsonb;
  v_id uuid;
  v_row record;
  v_cat record;
  v_iva int;
  v_amount numeric;
  v_formalidade text;
  v_results jsonb := '[]'::jsonb;
  v_count int := 0;
  v_allowed_event_ids uuid[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Resolve event + company + permissions
  SELECT company_id INTO v_company_id FROM events WHERE id = _event_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Event % not found', _event_id USING ERRCODE = 'P0002';
  END IF;

  -- Permission: admin or manager only for BP edits (mirrors canEditBP in UI)
  v_can_edit := public.is_platform_admin()
             OR public.has_role(v_caller, 'admin'::app_role)
             OR public.has_role(v_caller, 'manager'::app_role);
  IF NOT v_can_edit THEN
    RAISE EXCEPTION 'Insufficient permission to edit BP' USING ERRCODE = '42501';
  END IF;

  -- Allow rows from this event OR child events (Master+Subs view)
  SELECT array_agg(id) INTO v_allowed_event_ids
  FROM events
  WHERE id = _event_id OR parent_event_id = _event_id;

  IF jsonb_array_length(_edits) = 0 THEN
    RETURN jsonb_build_object('updated', 0, 'results', '[]'::jsonb);
  END IF;

  FOR v_edit IN SELECT * FROM jsonb_array_elements(_edits) LOOP
    v_id := (v_edit->>'id')::uuid;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Missing id in edits payload';
    END IF;

    -- Lock row & fetch
    SELECT f.*, ac.type AS cat_type
    INTO v_row
    FROM event_forecasts f
    LEFT JOIN account_categories ac ON ac.id = f.category_id
    WHERE f.id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Forecast % not found', v_id USING ERRCODE = 'P0002';
    END IF;

    -- Tenant + scope
    IF v_row.company_id <> v_company_id THEN
      RAISE EXCEPTION 'Forecast % belongs to another company', v_id USING ERRCODE = '42501';
    END IF;
    IF NOT (v_row.event_id = ANY(v_allowed_event_ids)) THEN
      RAISE EXCEPTION 'Forecast % not in scope of event %', v_id, _event_id USING ERRCODE = '42501';
    END IF;
    -- Version scope must match
    IF v_row.version_id IS DISTINCT FROM _version_id THEN
      RAISE EXCEPTION 'Forecast % belongs to a different BP version', v_id USING ERRCODE = '42501';
    END IF;

    -- Locked: overhead rows (must use dedicated overhead UI)
    IF v_row.is_overhead OR v_row.exclude_from_result THEN
      RAISE EXCEPTION 'Forecast % is an overhead/excluded row and is read-only here', v_id USING ERRCODE = '42501';
    END IF;
    -- Locked: split lines adopted from master
    IF v_row.master_forecast_id IS NOT NULL THEN
      RAISE EXCEPTION 'Forecast % is adopted from the Master BP and read-only here', v_id USING ERRCODE = '42501';
    END IF;
    -- Locked: retroactive override on historical events
    IF v_row.is_retroactive_override THEN
      RAISE EXCEPTION 'Forecast % is a retroactive override and read-only', v_id USING ERRCODE = '42501';
    END IF;

    -- Validate category (if present in edit)
    IF v_edit ? 'category_id' THEN
      IF v_edit->>'category_id' IS NULL OR v_edit->>'category_id' = '' THEN
        -- Allow keeping NULL only if it was already NULL (legacy rows)
        IF v_row.category_id IS NOT NULL THEN
          RAISE EXCEPTION 'Row %: category_id is required', v_id USING ERRCODE = '23502';
        END IF;
      ELSE
        SELECT ac.id, ac.type, ac.is_active,
               (SELECT COUNT(*) FROM account_categories c WHERE c.parent_id = ac.id) AS children
        INTO v_cat
        FROM account_categories ac
        WHERE ac.id = (v_edit->>'category_id')::uuid;

        IF v_cat IS NULL THEN
          RAISE EXCEPTION 'Row %: category not found', v_id USING ERRCODE = '23503';
        END IF;
        IF NOT v_cat.is_active THEN
          RAISE EXCEPTION 'Row %: category is inactive', v_id USING ERRCODE = '23514';
        END IF;
        IF v_cat.children > 0 THEN
          RAISE EXCEPTION 'Row %: only L3 (leaf) categories are selectable', v_id USING ERRCODE = '23514';
        END IF;
        IF v_cat.type <> v_row.type THEN
          RAISE EXCEPTION 'Row %: category type % does not match row type %', v_id, v_cat.type, v_row.type USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;

    -- Validate IVA
    IF v_edit ? 'iva_rate' THEN
      v_iva := (v_edit->>'iva_rate')::int;
      IF v_iva NOT IN (0, 6, 13, 23) THEN
        RAISE EXCEPTION 'Row %: iva_rate must be 0/6/13/23', v_id USING ERRCODE = '23514';
      END IF;
    END IF;

    -- Validate amount
    IF v_edit ? 'amount' THEN
      v_amount := (v_edit->>'amount')::numeric;
      IF v_amount < 0 THEN
        RAISE EXCEPTION 'Row %: amount must be >= 0', v_id USING ERRCODE = '23514';
      END IF;
    END IF;

    -- Validate formalidade
    IF v_edit ? 'formalidade' THEN
      v_formalidade := v_edit->>'formalidade';
      IF v_formalidade NOT IN ('estimado','negociacao','fechado','pago_parcial','pago_total') THEN
        RAISE EXCEPTION 'Row %: invalid formalidade %', v_id, v_formalidade USING ERRCODE = '23514';
      END IF;
    END IF;

    -- Apply update (only fields present in edit payload)
    UPDATE event_forecasts SET
      description     = CASE WHEN v_edit ? 'description'   THEN v_edit->>'description' ELSE description END,
      category_id     = CASE WHEN v_edit ? 'category_id'   THEN NULLIF(v_edit->>'category_id','')::uuid ELSE category_id END,
      iva_rate        = CASE WHEN v_edit ? 'iva_rate'      THEN (v_edit->>'iva_rate')::int ELSE iva_rate END,
      amount          = CASE WHEN v_edit ? 'amount'        THEN (v_edit->>'amount')::numeric ELSE amount END,
      notes           = CASE WHEN v_edit ? 'notes'         THEN NULLIF(v_edit->>'notes','') ELSE notes END,
      specification   = CASE WHEN v_edit ? 'specification' THEN NULLIF(v_edit->>'specification','') ELSE specification END,
      formalidade     = CASE WHEN v_edit ? 'formalidade'   THEN (v_edit->>'formalidade')::formalidade_status ELSE formalidade END,
      formalidade_changed_at = CASE WHEN v_edit ? 'formalidade' AND (v_edit->>'formalidade')::formalidade_status IS DISTINCT FROM formalidade THEN now() ELSE formalidade_changed_at END,
      formalidade_changed_by = CASE WHEN v_edit ? 'formalidade' AND (v_edit->>'formalidade')::formalidade_status IS DISTINCT FROM formalidade THEN v_caller ELSE formalidade_changed_by END,
      updated_at = now()
    WHERE id = v_id;

    v_count := v_count + 1;
    v_results := v_results || jsonb_build_object('id', v_id, 'ok', true);
  END LOOP;

  RETURN jsonb_build_object('updated', v_count, 'results', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.batch_update_event_forecasts(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_update_event_forecasts(uuid, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.batch_update_event_forecasts(uuid, uuid, jsonb) IS
  'Phase A.1 BP Grid editor: atomic batch UPDATE of event_forecasts rows. Validates L3 category, FK, type, IVA, scope, locked rows. Rolls back entire transaction on any error.';