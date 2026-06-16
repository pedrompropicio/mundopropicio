-- Add specification to batch_insert_event_forecasts RPC
CREATE OR REPLACE FUNCTION public.batch_insert_event_forecasts(
  _event_id uuid,
  _version_id uuid DEFAULT NULL,
  _inserts jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_caller uuid := auth.uid();
  v_can_edit boolean;
  v_is_partner_editor boolean := false;
  v_ins jsonb;
  v_cat record;
  v_iva int;
  v_amount numeric;
  v_type text;
  v_desc text;
  v_form text;
  v_new_id uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_count int := 0;
  v_idx int := 0;
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
    SELECT (
      public.has_permission(v_caller, 'edit_approved_bp')
      AND EXISTS (
        SELECT 1 FROM public.partner_event_access pea
        WHERE pea.user_id = v_caller
          AND pea.is_active = true
          AND pea.can_edit_bp = true
          AND (
            pea.event_id = _event_id
            OR pea.event_id IN (SELECT id FROM events WHERE parent_event_id = _event_id)
            OR _event_id IN (SELECT id FROM events WHERE parent_event_id = pea.event_id)
          )
      )
    ) INTO v_is_partner_editor;
    v_can_edit := v_is_partner_editor;
  END IF;

  IF NOT v_can_edit THEN
    RAISE EXCEPTION 'Insufficient permission to edit BP' USING ERRCODE = '42501';
  END IF;

  IF _inserts IS NULL OR jsonb_array_length(_inserts) = 0 THEN
    RETURN jsonb_build_object('inserted', 0, 'ids', '[]'::jsonb);
  END IF;

  FOR v_ins IN SELECT * FROM jsonb_array_elements(_inserts) LOOP
    v_idx := v_idx + 1;

    v_type := lower(coalesce(v_ins->>'type', ''));
    IF v_is_partner_editor AND v_type <> 'expense' THEN
      RAISE EXCEPTION 'Linha %: parceiros só podem criar linhas de despesa', v_idx USING ERRCODE = '42501';
    END IF;
    IF v_type NOT IN ('income', 'expense') THEN
      RAISE EXCEPTION 'Linha %: tipo inválido (%)', v_idx, v_type;
    END IF;

    v_desc := trim(coalesce(v_ins->>'description', ''));
    IF length(v_desc) = 0 THEN
      RAISE EXCEPTION 'Linha %: descrição obrigatória', v_idx;
    END IF;

    v_amount := coalesce((v_ins->>'amount')::numeric, 0);
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'Linha %: valor não pode ser negativo', v_idx;
    END IF;

    v_iva := coalesce((v_ins->>'iva_rate')::int, 23);
    IF v_iva NOT IN (0, 6, 13, 23) THEN
      RAISE EXCEPTION 'Linha %: IVA inválido (%)', v_idx, v_iva;
    END IF;

    v_form := coalesce(NULLIF(v_ins->>'formalidade', ''), 'estimado');
    IF v_form NOT IN ('estimado', 'negociacao', 'fechado', 'pago_parcial', 'pago_total') THEN
      RAISE EXCEPTION 'Linha %: formalidade inválida (%)', v_idx, v_form;
    END IF;

    IF (v_ins->>'category_id') IS NOT NULL AND length(v_ins->>'category_id') > 0 THEN
      SELECT id, type, parent_id INTO v_cat
      FROM account_categories
      WHERE id = (v_ins->>'category_id')::uuid
        AND company_id = v_company_id;
      IF v_cat.id IS NULL THEN
        RAISE EXCEPTION 'Linha %: categoria não encontrada', v_idx;
      END IF;
      IF v_cat.type <> v_type THEN
        RAISE EXCEPTION 'Linha %: categoria não corresponde ao tipo (%)', v_idx, v_type;
      END IF;
      IF EXISTS (SELECT 1 FROM account_categories WHERE parent_id = v_cat.id) THEN
        RAISE EXCEPTION 'Linha %: selecione uma categoria L3 (sem filhos)', v_idx;
      END IF;
    END IF;

    INSERT INTO event_forecasts (
      event_id, type, description, specification, amount, iva_rate, category_id,
      notes, formalidade, company_id, version_id,
      is_overhead, exclude_from_result, status
    ) VALUES (
      _event_id,
      v_type,
      v_desc,
      NULLIF(v_ins->>'specification', ''),
      v_amount,
      v_iva,
      NULLIF(v_ins->>'category_id', '')::uuid,
      NULLIF(v_ins->>'notes', ''),
      v_form::bp_formalidade,
      v_company_id,
      _version_id,
      false,
      false,
      'draft'
    ) RETURNING id INTO v_new_id;

    v_ids := array_append(v_ids, v_new_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_count, 'ids', to_jsonb(v_ids));
END;
$$;

GRANT EXECUTE ON FUNCTION public.batch_insert_event_forecasts(uuid, uuid, jsonb) TO authenticated;