CREATE OR REPLACE FUNCTION public.batch_update_event_forecasts(_event_id uuid, _version_id uuid DEFAULT NULL::uuid, _edits jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_caller uuid := auth.uid();
  v_can_edit boolean;
  v_is_partner_editor boolean;
  v_edit jsonb;
  v_id uuid;
  v_row record;
  v_cat record;
  v_iva int;
  v_amount numeric;
  v_formalidade text;
  v_results jsonb := '[]'::jsonb;
  v_count int := 0;
  v_updated int := 0;
  v_allowed_event_ids uuid[];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO v_company_id FROM events WHERE id = _event_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Event % not found', _event_id USING ERRCODE = 'P0002';
  END IF;

  v_can_edit := public.is_platform_admin()
             OR public.has_role(v_caller, 'admin'::app_role)
             OR public.has_role(v_caller, 'manager'::app_role);

  IF NOT v_can_edit THEN
    SELECT EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = v_caller
        AND pea.is_active = true
        AND pea.can_edit_bp = true
        AND (
          pea.event_id = _event_id
          OR pea.event_id IN (SELECT id FROM events WHERE parent_event_id = _event_id)
          OR _event_id IN (SELECT id FROM events WHERE parent_event_id = pea.event_id)
        )
    ) INTO v_is_partner_editor;
    v_can_edit := v_is_partner_editor;
  END IF;

  IF NOT v_can_edit THEN
    RAISE EXCEPTION 'Insufficient permission to edit BP' USING ERRCODE = '42501';
  END IF;

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

    SELECT f.*
    INTO v_row
    FROM event_forecasts f
    WHERE f.id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Forecast % not found', v_id USING ERRCODE = 'P0002';
    END IF;

    IF v_row.company_id <> v_company_id THEN
      RAISE EXCEPTION 'Forecast % belongs to another company', v_id USING ERRCODE = '42501';
    END IF;
    IF NOT (v_row.event_id = ANY(v_allowed_event_ids)) THEN
      RAISE EXCEPTION 'Forecast % not in scope of event %', v_id, _event_id USING ERRCODE = '42501';
    END IF;
    IF v_row.version_id IS DISTINCT FROM _version_id THEN
      RAISE EXCEPTION 'Forecast % belongs to a different BP version', v_id USING ERRCODE = '42501';
    END IF;

    -- Overheads / linhas excluídas do resultado: valores continuam read-only aqui,
    -- mas a FORMALIDADE é editável (estado comercial, nunca reescrito por recálculos).
    IF v_row.is_overhead OR v_row.exclude_from_result THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_object_keys(v_edit) AS k
        WHERE k NOT IN ('id', 'formalidade')
      ) THEN
        RAISE EXCEPTION 'Forecast % is an overhead/excluded row: only formalidade is editable here', v_id USING ERRCODE = '42501';
      END IF;
    END IF;
    IF v_row.master_forecast_id IS NOT NULL THEN
      RAISE EXCEPTION 'Forecast % is adopted from the Master BP and read-only here', v_id USING ERRCODE = '42501';
    END IF;
    IF v_row.is_retroactive_override THEN
      RAISE EXCEPTION 'Forecast % is a retroactive override and read-only', v_id USING ERRCODE = '42501';
    END IF;

    IF v_edit ? 'category_id' THEN
      IF v_edit->>'category_id' IS NULL OR v_edit->>'category_id' = '' THEN
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

    IF v_edit ? 'iva_rate' THEN
      v_iva := (v_edit->>'iva_rate')::int;
      IF v_iva NOT IN (0, 6, 13, 23) THEN
        RAISE EXCEPTION 'Row %: iva_rate must be 0/6/13/23', v_id USING ERRCODE = '23514';
      END IF;
    END IF;

    IF v_edit ? 'amount' THEN
      v_amount := (v_edit->>'amount')::numeric;
      IF v_amount < 0 THEN
        RAISE EXCEPTION 'Row %: amount must be >= 0', v_id USING ERRCODE = '23514';
      END IF;
    END IF;

    IF v_edit ? 'formalidade' THEN
      v_formalidade := v_edit->>'formalidade';
      IF v_formalidade NOT IN ('estimado','negociacao','fechado','pago_parcial','pago_total') THEN
        RAISE EXCEPTION 'Row %: invalid formalidade %', v_id, v_formalidade USING ERRCODE = '23514';
      END IF;
    END IF;

    UPDATE event_forecasts SET
      description     = CASE WHEN v_edit ? 'description'   THEN v_edit->>'description' ELSE description END,
      category_id     = CASE WHEN v_edit ? 'category_id'   THEN NULLIF(v_edit->>'category_id','')::uuid ELSE category_id END,
      iva_rate        = CASE WHEN v_edit ? 'iva_rate'      THEN (v_edit->>'iva_rate')::int ELSE iva_rate END,
      amount          = CASE WHEN v_edit ? 'amount'        THEN (v_edit->>'amount')::numeric ELSE amount END,
      notes           = CASE WHEN v_edit ? 'notes'         THEN NULLIF(v_edit->>'notes','') ELSE notes END,
      specification   = CASE WHEN v_edit ? 'specification' THEN NULLIF(v_edit->>'specification','') ELSE specification END,
      formalidade     = CASE WHEN v_edit ? 'formalidade'   THEN (v_edit->>'formalidade')::bp_formalidade ELSE formalidade END,
      formalidade_changed_at = CASE WHEN v_edit ? 'formalidade' AND (v_edit->>'formalidade')::bp_formalidade IS DISTINCT FROM formalidade THEN now() ELSE formalidade_changed_at END,
      formalidade_changed_by = CASE WHEN v_edit ? 'formalidade' AND (v_edit->>'formalidade')::bp_formalidade IS DISTINCT FROM formalidade THEN v_caller ELSE formalidade_changed_by END,
      updated_at = now()
    WHERE id = v_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'Forecast % was validated but not updated', v_id USING ERRCODE = 'P0001';
    END IF;

    v_count := v_count + 1;
    v_results := v_results || jsonb_build_object('id', v_id, 'ok', true);
  END LOOP;

  RETURN jsonb_build_object('updated', v_count, 'results', v_results);
END;
$function$;