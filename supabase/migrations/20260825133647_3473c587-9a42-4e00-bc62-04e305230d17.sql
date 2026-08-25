ALTER TABLE public.event_partners
  ADD COLUMN IF NOT EXISTS can_order boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pay boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.event_partners.can_order IS
  'Este socio pode ser Ordenador de despesas do evento.';
COMMENT ON COLUMN public.event_partners.can_pay IS
  'Este socio pode ser Pagador de despesas do evento. Nao confundir com partner_paid_expenses.';

UPDATE public.event_partners SET can_order = true;
UPDATE public.event_partners ep
   SET can_pay = true
 WHERE EXISTS (
   SELECT 1
     FROM public.event_forecasts f
    WHERE f.paying_partner_id = ep.id
 );

CREATE OR REPLACE FUNCTION public.validate_event_forecast_partner_roles()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_event_parent_id uuid;
  v_partner record;
BEGIN
  IF NEW.ordering_partner_id IS NOT NULL THEN
    SELECT ep.id, ep.event_id, ep.can_order, s.name AS supplier_name
      INTO v_partner
      FROM public.event_partners ep
      LEFT JOIN public.suppliers s ON s.id = ep.supplier_id
     WHERE ep.id = NEW.ordering_partner_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ordenador inválido: sócio não encontrado.' USING ERRCODE = '23503';
    END IF;

    SELECT parent_event_id INTO v_event_parent_id
      FROM public.events
     WHERE id = NEW.event_id;

    IF v_partner.event_id <> NEW.event_id AND v_partner.event_id IS DISTINCT FROM v_event_parent_id THEN
      RAISE EXCEPTION 'Ordenador inválido: o sócio "%" pertence a outro evento.', COALESCE(v_partner.supplier_name, 'Sócio') USING ERRCODE = '23514';
    END IF;

    IF NOT COALESCE(v_partner.can_order, false) THEN
      RAISE EXCEPTION 'Ordenador inválido: o sócio "%" não tem a opção "Pode ser ordenador de despesas" ligada.', COALESCE(v_partner.supplier_name, 'Sócio') USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.paying_partner_id IS NOT NULL THEN
    SELECT ep.id, ep.event_id, ep.can_pay, s.name AS supplier_name
      INTO v_partner
      FROM public.event_partners ep
      LEFT JOIN public.suppliers s ON s.id = ep.supplier_id
     WHERE ep.id = NEW.paying_partner_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pagador inválido: sócio não encontrado.' USING ERRCODE = '23503';
    END IF;

    SELECT parent_event_id INTO v_event_parent_id
      FROM public.events
     WHERE id = NEW.event_id;

    IF v_partner.event_id <> NEW.event_id AND v_partner.event_id IS DISTINCT FROM v_event_parent_id THEN
      RAISE EXCEPTION 'Pagador inválido: o sócio "%" pertence a outro evento.', COALESCE(v_partner.supplier_name, 'Sócio') USING ERRCODE = '23514';
    END IF;

    IF NOT COALESCE(v_partner.can_pay, false) THEN
      RAISE EXCEPTION 'Pagador inválido: o sócio "%" não tem a opção "Pode ser pagador de despesas" ligada.', COALESCE(v_partner.supplier_name, 'Sócio') USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_event_forecast_partner_roles ON public.event_forecasts;
CREATE TRIGGER trg_validate_event_forecast_partner_roles
BEFORE INSERT OR UPDATE OF event_id, ordering_partner_id, paying_partner_id
ON public.event_forecasts
FOR EACH ROW
EXECUTE FUNCTION public.validate_event_forecast_partner_roles();

CREATE OR REPLACE FUNCTION public.prevent_event_partner_role_disable_if_used()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
  v_name text;
BEGIN
  IF OLD.can_order = true AND NEW.can_order = false THEN
    SELECT count(*) INTO v_count
      FROM public.event_forecasts
     WHERE ordering_partner_id = OLD.id;
    IF v_count > 0 THEN
      SELECT COALESCE(s.name, 'Sócio') INTO v_name
        FROM public.event_partners ep
        LEFT JOIN public.suppliers s ON s.id = ep.supplier_id
       WHERE ep.id = OLD.id;
      RAISE EXCEPTION 'Não é possível desligar "Pode ser ordenador de despesas" para "%": existem % linha(s) do BP a usar este sócio como Ordenador.', v_name, v_count USING ERRCODE = '23514';
    END IF;
  END IF;

  IF OLD.can_pay = true AND NEW.can_pay = false THEN
    SELECT count(*) INTO v_count
      FROM public.event_forecasts
     WHERE paying_partner_id = OLD.id;
    IF v_count > 0 THEN
      SELECT COALESCE(s.name, 'Sócio') INTO v_name
        FROM public.event_partners ep
        LEFT JOIN public.suppliers s ON s.id = ep.supplier_id
       WHERE ep.id = OLD.id;
      RAISE EXCEPTION 'Não é possível desligar "Pode ser pagador de despesas" para "%": existem % linha(s) do BP a usar este sócio como Pagador.', v_name, v_count USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_event_partner_role_disable_if_used ON public.event_partners;
CREATE TRIGGER trg_prevent_event_partner_role_disable_if_used
BEFORE UPDATE OF can_order, can_pay
ON public.event_partners
FOR EACH ROW
EXECUTE FUNCTION public.prevent_event_partner_role_disable_if_used();

DO $$
DECLARE
  v_def text;
  v_next text;
BEGIN
  v_def := pg_get_functiondef('public.create_scenario_draft(uuid,text,jsonb,text)'::regprocedure);
  v_next := v_def;

  v_next := replace(v_next,
'    is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
    currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
    is_overhead, historic_overrides, version_id
  )
  SELECT
    event_id, category_id, type, description, amount, iva_rate, notes,
    status, specification, formula_type, formula_value, cache_config_id,
    is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
    currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
    is_overhead, historic_overrides, v_new_version_id',
'    is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
    currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
    is_overhead, historic_overrides, ordering_partner_id, paying_partner_id, version_id
  )
  SELECT
    event_id, category_id, type, description, amount, iva_rate, notes,
    status, specification, formula_type, formula_value, cache_config_id,
    is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
    currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
    is_overhead, historic_overrides, ordering_partner_id, paying_partner_id, v_new_version_id');

  v_next := replace(v_next,
'      is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
      currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
      is_overhead, historic_overrides, version_id
    )
    SELECT
      event_id, category_id, type, description, amount, iva_rate, notes,
      status, specification, formula_type, formula_value, cache_config_id,
      is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
      currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
      is_overhead, historic_overrides, v_new_split_version_id',
'      is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
      currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
      is_overhead, historic_overrides, ordering_partner_id, paying_partner_id, version_id
    )
    SELECT
      event_id, category_id, type, description, amount, iva_rate, notes,
      status, specification, formula_type, formula_value, cache_config_id,
      is_transitory, exclude_from_result, master_forecast_id, attachment_refs,
      currency, original_amount, fx_rate, fx_rate_source, invoice_group_id,
      is_overhead, historic_overrides, ordering_partner_id, paying_partner_id, v_new_split_version_id');

  IF v_next = v_def OR position('ordering_partner_id, paying_partner_id, version_id' in v_next) = 0 THEN
    RAISE EXCEPTION 'create_scenario_draft não foi atualizado: fragmento esperado não encontrado.';
  END IF;

  EXECUTE v_next;
END;
$$;

DO $$
DECLARE
  v_def text;
  v_next text;
BEGIN
  v_def := pg_get_functiondef('public.promote_scenario_to_active(uuid,text,uuid,text,boolean,jsonb)'::regprocedure);
  v_next := v_def;

  v_next := replace(v_next,
'    created_at, updated_at, version_id,
    formalidade, formalidade_changed_at, formalidade_changed_by
  )',
'    created_at, updated_at, version_id,
    formalidade, formalidade_changed_at, formalidade_changed_by,
    ordering_partner_id, paying_partner_id
  )');

  v_next := replace(v_next,
'      created_at, updated_at, version_id,
      formalidade, formalidade_changed_at, formalidade_changed_by
    )',
'      created_at, updated_at, version_id,
      formalidade, formalidade_changed_at, formalidade_changed_by,
      ordering_partner_id, paying_partner_id
    )');

  v_next := replace(v_next,
'    COALESCE(carry.formalidade, ''estimado''::bp_formalidade),
    carry.formalidade_changed_at,
    carry.formalidade_changed_by
  FROM jsonb_array_elements',
'    COALESCE(carry.formalidade, ''estimado''::bp_formalidade),
    carry.formalidade_changed_at,
    carry.formalidade_changed_by,
    NULLIF(r->>''ordering_partner_id'', '''')::uuid,
    NULLIF(r->>''paying_partner_id'', '''')::uuid
  FROM jsonb_array_elements');

  v_next := replace(v_next,
'      COALESCE(carry.formalidade, ''estimado''::bp_formalidade),
      carry.formalidade_changed_at,
      carry.formalidade_changed_by
    FROM jsonb_array_elements',
'      COALESCE(carry.formalidade, ''estimado''::bp_formalidade),
      carry.formalidade_changed_at,
      carry.formalidade_changed_by,
      NULLIF(r->>''ordering_partner_id'', '''')::uuid,
      NULLIF(r->>''paying_partner_id'', '''')::uuid
    FROM jsonb_array_elements');

  IF v_next = v_def OR position('NULLIF(r->>''paying_partner_id''' in v_next) = 0 THEN
    RAISE EXCEPTION 'promote_scenario_to_active não foi atualizado: fragmento esperado não encontrado.';
  END IF;

  EXECUTE v_next;
END;
$$;

DO $$
DECLARE
  v_def text;
  v_next text;
BEGIN
  v_def := pg_get_functiondef('public.batch_update_event_forecasts(uuid,uuid,jsonb)'::regprocedure);
  v_next := v_def;

  v_next := replace(v_next,
'      specification   = CASE WHEN v_edit ? ''specification'' THEN NULLIF(v_edit->>''specification'','''') ELSE specification END,
      formalidade     = CASE WHEN v_edit ? ''formalidade''   THEN (v_edit->>''formalidade'')::bp_formalidade ELSE formalidade END,',
'      specification   = CASE WHEN v_edit ? ''specification'' THEN NULLIF(v_edit->>''specification'','''') ELSE specification END,
      ordering_partner_id = CASE WHEN v_edit ? ''ordering_partner_id'' THEN NULLIF(v_edit->>''ordering_partner_id'','''')::uuid ELSE ordering_partner_id END,
      paying_partner_id   = CASE WHEN v_edit ? ''paying_partner_id''   THEN NULLIF(v_edit->>''paying_partner_id'','''')::uuid ELSE paying_partner_id END,
      formalidade     = CASE WHEN v_edit ? ''formalidade''   THEN (v_edit->>''formalidade'')::bp_formalidade ELSE formalidade END,');

  IF v_next = v_def OR position('paying_partner_id   = CASE' in v_next) = 0 THEN
    RAISE EXCEPTION 'batch_update_event_forecasts não foi atualizado: fragmento esperado não encontrado.';
  END IF;

  EXECUTE v_next;
END;
$$;

DO $$
DECLARE
  v_def text;
  v_next text;
BEGIN
  v_def := pg_get_functiondef('public.batch_insert_event_forecasts(uuid,uuid,jsonb)'::regprocedure);
  v_next := v_def;

  v_next := replace(v_next,
'      notes, formalidade, company_id, version_id,
      is_overhead, exclude_from_result, status
    ) VALUES (',
'      notes, formalidade, company_id, version_id,
      is_overhead, exclude_from_result, ordering_partner_id, paying_partner_id, status
    ) VALUES (');

  v_next := replace(v_next,
'      false,
      false,
      ''draft''
    ) RETURNING id INTO v_new_id;',
'      false,
      false,
      CASE WHEN v_type = ''expense'' THEN NULLIF(v_ins->>''ordering_partner_id'', '''')::uuid ELSE NULL END,
      CASE WHEN v_type = ''expense'' THEN NULLIF(v_ins->>''paying_partner_id'', '''')::uuid ELSE NULL END,
      ''draft''
    ) RETURNING id INTO v_new_id;');

  IF v_next = v_def OR position('paying_partner_id, status' in v_next) = 0 THEN
    RAISE EXCEPTION 'batch_insert_event_forecasts não foi atualizado: fragmento esperado não encontrado.';
  END IF;

  EXECUTE v_next;
END;
$$;