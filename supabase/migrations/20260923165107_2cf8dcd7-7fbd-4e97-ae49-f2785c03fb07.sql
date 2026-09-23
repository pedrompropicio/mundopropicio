-- #240 — Porta 1 (vínculo transactions.forecast_id pertence ao evento) + Porta 2 (chão e observação na redução de linha aprovada)

-- ========== PORTA 1 ==========
CREATE OR REPLACE FUNCTION public.enforce_tx_forecast_same_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fc record;
  v_tx_company uuid;
  v_written boolean;
  v_consumes boolean;
  v_mode text;
  v_tx_ev_name text;
  v_fc_ev_name text;
BEGIN
  IF NEW.forecast_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.forecast_id IS NOT DISTINCT FROM NEW.forecast_id
     AND OLD.event_id IS NOT DISTINCT FROM NEW.event_id THEN
    RETURN NEW;
  END IF;

  SELECT f.event_id, f.company_id, f.version_id INTO v_fc
    FROM public.event_forecasts f WHERE f.id = NEW.forecast_id;
  IF NOT FOUND THEN RETURN NEW; END IF; -- a FK trata

  v_written := TG_OP = 'INSERT' OR OLD.forecast_id IS DISTINCT FROM NEW.forecast_id;

  IF v_fc.version_id IS NOT NULL THEN
    IF v_written THEN
      RAISE EXCEPTION 'Vínculo recusado: a linha de BP pertence a uma versão/cenário. Só se vinculam transações a linhas vivas do Business Plan.' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- no INSERT trg_set_company_id corre depois; resolve a empresa pelo evento
  v_tx_company := COALESCE(NEW.company_id,
    (SELECT e.company_id FROM public.events e WHERE e.id = NEW.event_id));

  IF v_fc.version_id IS NULL
     AND public.bp_tx_link_allowed(NEW.event_id, v_tx_company, v_fc.event_id, v_fc.company_id) THEN
    RETURN NEW;
  END IF;

  IF v_written THEN
    SELECT name INTO v_tx_ev_name FROM public.events WHERE id = NEW.event_id;
    SELECT name INTO v_fc_ev_name FROM public.events WHERE id = v_fc.event_id;
    RAISE EXCEPTION 'Vínculo recusado: a transação pertence ao evento "%" e a linha do Business Plan ao evento "%". Uma linha de BP só pode ser vinculada a transações do mesmo evento (ou sem evento, no desenho master/subeventos) e da mesma empresa.',
      COALESCE(v_tx_ev_name, '(sem evento)'), COALESCE(v_fc_ev_name, '(sem evento)');
  END IF;

  -- só mudou o event_id
  v_consumes := NEW.type = 'expense'
    AND COALESCE(NEW.is_transitory, false) = false
    AND COALESCE(NEW.exclude_from_result, false) = false
    AND NEW.reversed_at IS NULL
    AND COALESCE(NEW.is_hidden, false) = false
    AND NEW.shared_cost_account_id IS NULL;

  IF NEW.event_id IS NOT NULL THEN
    -- mesma expressão de public.event_budget_mode, sem a verificação de empresa activa
    SELECT COALESCE(e.budget_mode, c.default_budget_mode, 'with_bp') INTO v_mode
      FROM public.events e JOIN public.companies c ON c.id = e.company_id
     WHERE e.id = NEW.event_id;
  END IF;

  IF v_consumes AND NEW.status IN ('approved','paid','partially_paid')
     AND NEW.event_id IS NOT NULL AND v_mode = 'with_bp' THEN
    RAISE EXCEPTION 'Esta transação já está aprovada. Ao mudar de evento, escolhe no mesmo acto a linha de BP do evento novo.' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, metadata, company_id)
  VALUES ('transactions', NEW.id::text, 'auto_unlink_tx_forecast_event_change',
          COALESCE((SELECT email FROM public.profiles WHERE id = auth.uid()), auth.uid()::text, 'service_role'),
          jsonb_build_object('forecast_id', NEW.forecast_id, 'old_event_id', OLD.event_id, 'new_event_id', NEW.event_id),
          v_tx_company);
  NEW.forecast_id := NULL;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.enforce_tx_forecast_same_event() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_tx_forecast_same_event() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_tx_forecast_same_event() TO service_role;

DROP TRIGGER IF EXISTS trg_enforce_tx_forecast_same_event ON public.transactions;
CREATE TRIGGER trg_enforce_tx_forecast_same_event
  BEFORE INSERT OR UPDATE OF forecast_id, event_id ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tx_forecast_same_event();

-- ========== PORTA 2 ==========
CREATE OR REPLACE FUNCTION public.enforce_forecast_amount_floor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_realized numeric;
  v_obs text;
  v_actor text;
BEGIN
  IF NEW.version_id IS NOT NULL OR NEW.status IS DISTINCT FROM 'approved'
     OR NEW.type IS DISTINCT FROM 'expense'
     OR COALESCE(NEW.amount, 0) >= COALESCE(OLD.amount, 0) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(t.amount), 0) INTO v_realized
  FROM public.transactions t
  WHERE t.forecast_id = NEW.id
    AND t.type = 'expense'
    AND t.status IN ('approved','paid','partially_paid')
    AND COALESCE(t.is_transitory, false) = false
    AND COALESCE(t.exclude_from_result, false) = false
    AND t.reversed_at IS NULL
    AND COALESCE(t.is_hidden, false) = false;

  IF COALESCE(NEW.amount, 0) < v_realized - 0.005 THEN
    RAISE EXCEPTION 'A verba da linha de BP não pode ficar abaixo do realizado: pedido % €, realizado % €.',
      to_char(COALESCE(NEW.amount,0), 'FM999999999990.00'), to_char(v_realized, 'FM999999999990.00')
      USING ERRCODE = '22023';
  END IF;

  v_obs := NULLIF(btrim(COALESCE(current_setting('mp.bp_change_observation', true), '')), '');
  IF v_realized > 0 AND v_obs IS NULL THEN
    RAISE EXCEPTION 'Observação obrigatória para reduzir uma linha de BP com realizado.' USING ERRCODE = '22023';
  END IF;

  IF auth.uid() IS NULL THEN
    v_actor := 'service_role';
  ELSE
    SELECT COALESCE(p.email, auth.uid()::text) INTO v_actor FROM public.profiles p WHERE p.id = auth.uid();
    v_actor := COALESCE(v_actor, auth.uid()::text);
  END IF;

  -- baseline_amount nunca é tocado (D3)
  INSERT INTO public.forecast_audit_log (forecast_id, changed_by, field_name, old_value, new_value, observation, company_id)
  VALUES (NEW.id, v_actor, 'Redução de verba',
          to_char(COALESCE(OLD.amount,0), 'FM999999999990.00'),
          to_char(COALESCE(NEW.amount,0), 'FM999999999990.00'),
          v_obs, NEW.company_id);
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.enforce_forecast_amount_floor() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_forecast_amount_floor() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_forecast_amount_floor() TO service_role;

DROP TRIGGER IF EXISTS trg_enforce_forecast_amount_floor ON public.event_forecasts;
CREATE TRIGGER trg_enforce_forecast_amount_floor
  BEFORE UPDATE OF amount ON public.event_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_forecast_amount_floor();

-- Q1: sync Coala (service_role) grava amount com observação na mesma ligação
CREATE OR REPLACE FUNCTION public.set_forecast_amount_with_observation(_forecast_id uuid, _amount numeric, _observation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('mp.bp_change_observation', COALESCE(_observation, ''), true);
  UPDATE public.event_forecasts SET amount = _amount, updated_at = now() WHERE id = _forecast_id;
  PERFORM set_config('mp.bp_change_observation', '', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.set_forecast_amount_with_observation(uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_forecast_amount_with_observation(uuid, numeric, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_forecast_amount_with_observation(uuid, numeric, text) TO service_role;

-- reduce_forecast_budget: observação via set_config; o trigger escreve o audit
CREATE OR REPLACE FUNCTION public.reduce_forecast_budget(_forecast_id uuid, _new_amount numeric, _observation text)
 RETURNS event_forecasts LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.event_forecasts;
  v_old_amount numeric;
  v_realized numeric;
  v_is_service boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    v_is_service := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '') = 'service_role';
    IF NOT v_is_service THEN
      RAISE EXCEPTION 'Sem identidade de utilizador para ajustar verbas de BP.' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_row FROM public.event_forecasts WHERE id = _forecast_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de BP não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT v_is_service THEN
    IF NOT (public.is_platform_admin(v_uid) OR public.has_permission_in(v_uid, 'manage_bp', v_row.company_id)) THEN
      RAISE EXCEPTION 'Sem permissão para ajustar verbas de BP nesta empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _observation IS NULL OR btrim(_observation) = '' THEN
    RAISE EXCEPTION 'Observação obrigatória para ajustar a verba da linha de BP.' USING ERRCODE = '22023';
  END IF;

  v_old_amount := COALESCE(v_row.amount, 0);
  IF _new_amount IS NULL OR _new_amount >= v_old_amount THEN
    RAISE EXCEPTION 'A nova verba tem de ser inferior à verba actual da linha.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(t.amount), 0) INTO v_realized
  FROM public.transactions t
  WHERE t.forecast_id = _forecast_id
    AND t.type = 'expense'
    AND t.status IN ('approved','paid','partially_paid')
    AND COALESCE(t.is_transitory, false) = false
    AND COALESCE(t.exclude_from_result, false) = false
    AND t.reversed_at IS NULL
    AND COALESCE(t.is_hidden, false) = false;

  IF _new_amount < v_realized - 0.005 THEN
    RAISE EXCEPTION 'A nova verba (%) não pode ficar abaixo do realizado da linha (%).',
      to_char(_new_amount, 'FM999999999990.00'), to_char(v_realized, 'FM999999999990.00')
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('mp.bp_change_observation', '[ajuste de fecho] ' || btrim(_observation), true);

  -- NUNCA toca em baseline_amount (D3). O audit é escrito por trg_enforce_forecast_amount_floor.
  UPDATE public.event_forecasts SET amount = _new_amount, updated_at = now()
   WHERE id = _forecast_id RETURNING * INTO v_row;

  PERFORM set_config('mp.bp_change_observation', '', true);
  RETURN v_row;
END;
$function$;

-- batch_update_event_forecasts: chave opcional 'observation' por edit
CREATE OR REPLACE FUNCTION public.batch_update_event_forecasts(_event_id uuid, _version_id uuid DEFAULT NULL::uuid, _edits jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
             OR public.has_permission_in(v_caller, 'manage_bp', v_company_id);

  IF NOT v_can_edit THEN
    SELECT EXISTS (
      SELECT 1 FROM public.partner_event_access pea
      WHERE pea.user_id = v_caller AND pea.is_active = true AND pea.can_edit_bp = true
        AND (pea.event_id = _event_id
          OR pea.event_id IN (SELECT id FROM events WHERE parent_event_id = _event_id)
          OR _event_id IN (SELECT id FROM events WHERE parent_event_id = pea.event_id))
    ) INTO v_is_partner_editor;
    v_can_edit := v_is_partner_editor;
  END IF;

  IF NOT v_can_edit THEN
    RAISE EXCEPTION 'Insufficient permission to edit BP' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(id) INTO v_allowed_event_ids FROM events WHERE id = _event_id OR parent_event_id = _event_id;

  IF jsonb_array_length(_edits) = 0 THEN
    RETURN jsonb_build_object('updated', 0, 'results', '[]'::jsonb);
  END IF;

  FOR v_edit IN SELECT * FROM jsonb_array_elements(_edits) LOOP
    v_id := (v_edit->>'id')::uuid;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Missing id in edits payload'; END IF;

    SELECT f.* INTO v_row FROM event_forecasts f WHERE f.id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Forecast % not found', v_id USING ERRCODE = 'P0002'; END IF;

    IF v_row.company_id <> v_company_id THEN
      RAISE EXCEPTION 'Forecast % belongs to another company', v_id USING ERRCODE = '42501';
    END IF;
    IF NOT (v_row.event_id = ANY(v_allowed_event_ids)) THEN
      RAISE EXCEPTION 'Forecast % not in scope of event %', v_id, _event_id USING ERRCODE = '42501';
    END IF;
    IF v_row.version_id IS DISTINCT FROM _version_id THEN
      RAISE EXCEPTION 'Forecast % belongs to a different BP version', v_id USING ERRCODE = '42501';
    END IF;

    IF v_row.is_overhead OR v_row.exclude_from_result THEN
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(v_edit) AS k WHERE k NOT IN ('id', 'formalidade', 'observation')) THEN
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
        INTO v_cat FROM account_categories ac WHERE ac.id = (v_edit->>'category_id')::uuid;
        IF v_cat IS NULL THEN RAISE EXCEPTION 'Row %: category not found', v_id USING ERRCODE = '23503'; END IF;
        IF NOT v_cat.is_active THEN RAISE EXCEPTION 'Row %: category is inactive', v_id USING ERRCODE = '23514'; END IF;
        IF v_cat.children > 0 THEN RAISE EXCEPTION 'Row %: only L3 (leaf) categories are selectable', v_id USING ERRCODE = '23514'; END IF;
        IF v_cat.type <> v_row.type THEN
          RAISE EXCEPTION 'Row %: category type % does not match row type %', v_id, v_cat.type, v_row.type USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;

    IF v_edit ? 'iva_rate' THEN
      v_iva := (v_edit->>'iva_rate')::int;
      IF v_iva NOT IN (0, 6, 13, 23) THEN RAISE EXCEPTION 'Row %: iva_rate must be 0/6/13/23', v_id USING ERRCODE = '23514'; END IF;
    END IF;

    IF v_edit ? 'amount' THEN
      v_amount := (v_edit->>'amount')::numeric;
      IF v_amount < 0 THEN RAISE EXCEPTION 'Row %: amount must be >= 0', v_id USING ERRCODE = '23514'; END IF;
    END IF;

    IF v_edit ? 'formalidade' THEN
      v_formalidade := v_edit->>'formalidade';
      IF v_formalidade NOT IN ('estimado','negociacao','fechado','pago_parcial','pago_total') THEN
        RAISE EXCEPTION 'Row %: invalid formalidade %', v_id, v_formalidade USING ERRCODE = '23514';
      END IF;
    END IF;

    -- #240: observação lida por trg_enforce_forecast_amount_floor
    PERFORM set_config('mp.bp_change_observation', COALESCE(v_edit->>'observation', ''), true);

    UPDATE event_forecasts SET
      description     = CASE WHEN v_edit ? 'description'   THEN v_edit->>'description' ELSE description END,
      category_id     = CASE WHEN v_edit ? 'category_id'   THEN NULLIF(v_edit->>'category_id','')::uuid ELSE category_id END,
      iva_rate        = CASE WHEN v_edit ? 'iva_rate'      THEN (v_edit->>'iva_rate')::int ELSE iva_rate END,
      amount          = CASE WHEN v_edit ? 'amount'        THEN (v_edit->>'amount')::numeric ELSE amount END,
      notes           = CASE WHEN v_edit ? 'notes'         THEN NULLIF(v_edit->>'notes','') ELSE notes END,
      specification   = CASE WHEN v_edit ? 'specification' THEN NULLIF(v_edit->>'specification','') ELSE specification END,
      ordering_partner_id = CASE WHEN v_edit ? 'ordering_partner_id' THEN NULLIF(v_edit->>'ordering_partner_id','')::uuid ELSE ordering_partner_id END,
      paying_partner_id   = CASE WHEN v_edit ? 'paying_partner_id'   THEN NULLIF(v_edit->>'paying_partner_id','')::uuid ELSE paying_partner_id END,
      formalidade     = CASE WHEN v_edit ? 'formalidade'   THEN (v_edit->>'formalidade')::bp_formalidade ELSE formalidade END,
      formalidade_changed_at = CASE WHEN v_edit ? 'formalidade' AND (v_edit->>'formalidade')::bp_formalidade IS DISTINCT FROM formalidade THEN now() ELSE formalidade_changed_at END,
      formalidade_changed_by = CASE WHEN v_edit ? 'formalidade' AND (v_edit->>'formalidade')::bp_formalidade IS DISTINCT FROM formalidade THEN v_caller ELSE formalidade_changed_by END,
      updated_at = now()
    WHERE id = v_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    PERFORM set_config('mp.bp_change_observation', '', true);
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'Forecast % was validated but not updated', v_id USING ERRCODE = 'P0001';
    END IF;

    v_count := v_count + 1;
    v_results := v_results || jsonb_build_object('id', v_id, 'ok', true);
  END LOOP;

  RETURN jsonb_build_object('updated', v_count, 'results', v_results);
END;
$function$;

-- event_bp_evolution: badge próprio para 'Redução de verba'
DO $do$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.event_bp_evolution(uuid,date,date)'::regprocedure);
  v_def := replace(v_def,
    $$CASE WHEN a.field_name = 'Elevação de verba' THEN 'budget_raise' ELSE 'annotated_change' END$$,
    $$CASE WHEN a.field_name = 'Elevação de verba' THEN 'budget_raise' WHEN a.field_name = 'Redução de verba' THEN 'budget_reduction' ELSE 'annotated_change' END$$);
  IF position('budget_reduction' in v_def) = 0 THEN
    RAISE EXCEPTION 'event_bp_evolution: padrão não encontrado';
  END IF;
  EXECUTE v_def;
END $do$;