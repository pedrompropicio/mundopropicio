-- LOCAL replay of installed definitions, no Live writes. Auth helpers recorded in catalog.json.
CREATE OR REPLACE FUNCTION public.log_formalidade_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_label text;
  v_auto boolean := false;
  v_setting text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.formalidade IS DISTINCT FROM OLD.formalidade THEN
    v_user := auth.uid();
    SELECT full_name INTO v_label FROM public.profiles WHERE id = v_user;

    -- Lê GUC de sessão; se for 'true', marca log como auto-sugerido.
    BEGIN
      v_setting := current_setting('app.formalidade_auto_suggested', true);
      IF v_setting IS NOT NULL AND lower(v_setting) IN ('true', 't', '1', 'on') THEN
        v_auto := true;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_auto := false;
    END;

    NEW.formalidade_changed_at := now();
    NEW.formalidade_changed_by := v_user;

    INSERT INTO public.event_forecast_formalidade_log
      (forecast_id, from_state, to_state, changed_by, changed_by_label, auto_suggested)
    VALUES
      (NEW.id, OLD.formalidade, NEW.formalidade, v_user, v_label, v_auto);
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.force_exclude_from_result_for_shared_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- A parte de terceiros nunca e custo da MP (D-ERP69). Nao depende de toggle na UI.
  IF NEW.shared_cost_account_id IS NOT NULL THEN
    NEW.exclude_from_result := true;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_held_revenue_is_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.held_by_supplier_id IS NOT NULL THEN
    NEW.status := 'paid';
    NEW.payment_date := COALESCE(NEW.payment_date, NEW.date);
    NEW.paid_amount := NEW.amount;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_tx_paid_requires_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND NEW.account_id IS NULL THEN
    -- Isenções documentadas:
    --  * fluxos server-side (edge functions / importações) correm como service_role
    --  * transitórias (caução, irmã "extra do sócio"), fora do resultado e reembolsos
    --    nascem legitimamente sem conta da empresa
    --  * (g7) compensação: encontro de contas NUNCA tem conta por desenho
    --    (trigger force_no_account_on_compensation limpa account_id), e uma receita
    --    com "Recebido por" nasce paga (trg_enforce_held_revenue_is_paid)
    IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_storage_admin')
       OR COALESCE(NEW.is_transitory, false)
       OR COALESCE(NEW.exclude_from_result, false)
       OR COALESCE(NEW.is_reimbursement, false)
       OR COALESCE(NEW.payment_method, '') = 'compensation' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Transação paga exige conta financeira associada (account_id).';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.reverse_transaction(p_tx_id, p_kind, p_reason, p_valid_until, false);
$function$
;
CREATE OR REPLACE FUNCTION public.force_confidential_for_restricted_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.account_id IS NOT NULL AND NEW.is_confidential IS NOT TRUE THEN
    IF EXISTS (
      SELECT 1 FROM public.financial_accounts a
      WHERE a.id = NEW.account_id AND a.is_restricted = true
    ) THEN
      NEW.is_confidential := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.unlink_forecasts_on_tx_event_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  IF NEW.event_id IS NOT DISTINCT FROM OLD.event_id THEN RETURN NULL; END IF;
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;

  FOR r IN
    SELECT f.id, f.event_id, f.company_id
      FROM public.event_forecasts f
     WHERE f.transaction_id = NEW.id
       AND f.version_id IS NULL
  LOOP
    IF public.bp_tx_link_allowed(NEW.event_id, NEW.company_id, r.event_id, r.company_id) THEN
      CONTINUE;
    END IF;

    UPDATE public.event_forecasts SET transaction_id = NULL WHERE id = r.id;

    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.id, 'auto_unlink_forecast_tx_event_change', 'sistema (trigger)',
            jsonb_build_object('forecast_transaction_id', NEW.id),
            jsonb_build_object('forecast_transaction_id', NULL),
            jsonb_build_object('forecast_id', r.id, 'old_event_id', OLD.event_id, 'new_event_id', NEW.event_id,
                               'forecast_event_id', r.event_id, 'source', 'trigger'),
            COALESCE(NEW.company_id, r.company_id));
  END LOOP;

  RETURN NULL;
END $function$
;
CREATE OR REPLACE FUNCTION public.validate_payment_date_not_future()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  IF NEW.payment_date IS NOT NULL AND NEW.payment_date > v_hoje THEN
    RAISE EXCEPTION 'Data de pagamento no futuro (%). Um pagamento regista dinheiro que já saiu — para uma saída prevista use a data de vencimento na transação.', NEW.payment_date;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_line public.bank_statement_lines;
  v_current uuid;
  v_email text;
  v_sign_type text;
  v_target numeric;
  v_sum numeric := 0;
  v_n int;
  v_item jsonb;
  v_tx public.transactions;
  v_tx_id uuid;
  v_mode text;
  v_amount numeric;
  v_gross numeric;
  v_open numeric;
  v_ids uuid[] := '{}';
  v_pay_date date;
  v_rows int;
  v_action text;
  v_sys_date date;
  v_pending jsonb := '[]'::jsonb;
  v_kept jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nada a conciliar: p_items tem de ser um array com pelo menos um item.';
  end if;

  select * into v_line from public.bank_statement_lines where id = p_line_id;
  if v_line.id is null then
    raise exception 'Linha do banco inexistente ou sem acesso: %', p_line_id;
  end if;

  v_current := public.current_company_id();
  if v_current is null or v_current <> v_line.company_id then
    raise exception 'A linha do banco pertence a outra empresa (%) — empresa activa %.', v_line.company_id, v_current;
  end if;

  if v_line.status <> 'unmatched'
     or v_line.matched_transaction_id is not null
     or v_line.created_transaction_id is not null
     or exists (select 1 from public.bank_line_transactions b where b.line_id = v_line.id) then
    raise exception 'Linha do banco já está conciliada: %', v_line.id;
  end if;

  v_sign_type := case when v_line.amount >= 0 then 'income' else 'expense' end;
  v_target := round(abs(coalesce(v_line.amount, 0))::numeric, 2);
  v_pay_date := coalesce(v_line.value_date, v_line.booking_date);

  v_email := coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    (select p.email from public.profiles p where p.id = auth.uid()),
    'sistema'
  );

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tx_id := nullif(v_item ->> 'transaction_id', '')::uuid;
    v_mode := coalesce(v_item ->> 'mode', 'link');
    v_amount := round(coalesce((v_item ->> 'amount')::numeric, 0), 2);
    v_action := nullif(v_item ->> 'date_action', '');

    if v_tx_id is null then
      raise exception 'Item sem transaction_id.';
    end if;
    if v_mode not in ('link', 'settle') then
      raise exception 'Modo inválido (%) — só "link" ou "settle".', v_mode;
    end if;
    if v_action is not null and v_action not in ('align', 'keep') then
      raise exception 'date_action inválida (%) — só "align" ou "keep".', v_action;
    end if;
    if v_amount <= 0 then
      raise exception 'Valor inválido para a transação %: %.', v_tx_id, v_amount;
    end if;
    if v_tx_id = any(v_ids) then
      raise exception 'Transação repetida no mesmo pedido: %', v_tx_id;
    end if;

    select * into v_tx from public.transactions where id = v_tx_id;
    if v_tx.id is null then
      raise exception 'Transação inexistente ou sem acesso: %', v_tx_id;
    end if;
    if v_tx.company_id <> v_current then
      raise exception 'A transação % pertence a outra empresa.', v_tx_id;
    end if;
    if v_tx.reversed_at is not null then
      raise exception 'A transação % está revertida.', v_tx_id;
    end if;
    if v_tx.type <> v_sign_type then
      raise exception 'Sinal incompatível: a linha do banco é % e a transação % é "%".',
        case when v_sign_type = 'income' then 'a crédito (receita)' else 'a débito (despesa)' end,
        v_tx_id, v_tx.type;
    end if;

    if v_mode = 'link' then
      -- #233: a data no sistema tem de bater com a do banco, ou a pessoa decide.
      v_sys_date := coalesce(v_tx.payment_date,
        (select max(tp.payment_date) from public.transaction_payments tp
          where tp.transaction_id = v_tx_id and tp.status = 'paid'));
      if v_pay_date is not null and v_sys_date is distinct from v_pay_date then
        if v_action is null then
          v_pending := v_pending || jsonb_build_object('transaction_id', v_tx_id, 'system_date', v_sys_date,
                                                      'bank_date', v_pay_date, 'amount', v_amount);
        elsif v_action = 'align' then
          update public.transaction_payments
             set payment_date = v_pay_date, updated_at = now()
           where transaction_id = v_tx_id and status = 'paid' and payment_date is not distinct from v_sys_date;
          get diagnostics v_rows = row_count;
          if v_rows = 0 then
            update public.transactions set payment_date = v_pay_date where id = v_tx_id;
          end if;
          insert into public.transaction_audit_log (transaction_id, changed_by, changed_at, field_name, old_value, new_value, company_id)
          values (v_tx_id, v_email, now(), 'payment_date', v_sys_date::text,
                  v_pay_date::text || ' (alinhada pela data do banco, #233)', v_current);
        else
          v_kept := v_kept || jsonb_build_object('transaction_id', v_tx_id, 'system_date', v_sys_date,
                     'bank_date', v_pay_date, 'amount', v_amount, 'accepted_by', v_email, 'accepted_at', now());
        end if;
      end if;
    end if;

    if v_mode = 'settle' then
      v_gross := round(coalesce(v_tx.amount, 0) * (1 + coalesce(v_tx.iva_rate, 0) / 100.0), 2);
      v_open := round(v_gross - coalesce(v_tx.paid_amount, 0), 2);
      if v_open <= 0 then
        raise exception 'A transação % não tem valor em aberto.', v_tx_id;
      end if;
      if v_amount > v_open + 0.01 then
        raise exception 'Valor a liquidar (%) acima do que está em aberto (%) na transação %.', v_amount, v_open, v_tx_id;
      end if;

      insert into public.transaction_payments
        (transaction_id, amount, payment_date, account_id, payment_method,
         payment_reference, notes, created_by)
      values
        (v_tx_id, v_amount, v_pay_date, v_line.financial_account_id, 'transfer',
         left(coalesce(v_line.description, ''), 500), 'Liquidação pela conciliação bancária', v_email);

      if v_tx.account_id is null then
        update public.transactions set account_id = v_line.financial_account_id where id = v_tx_id;
      end if;
    end if;

    v_ids := v_ids || v_tx_id;
    v_sum := v_sum + v_amount;
  end loop;

  if jsonb_array_length(v_pending) > 0 then
    raise exception 'Data de pagamento diferente da do banco — escolher alinhar ou manter.'
      using errcode = 'P0410', detail = v_pending::text;
  end if;

  v_sum := round(v_sum, 2);
  if abs(v_sum - v_target) > 0.01 then
    raise exception 'A soma dos valores (%) não bate com a linha do banco (%).', v_sum, v_target;
  end if;

  v_n := array_length(v_ids, 1);

  update public.bank_statement_lines
     set status = 'matched',
         matched_transaction_id = case when v_n = 1 then v_ids[1] else null end,
         matched_payment_list_id = null,
         matched_sepa_export_id = null,
         matched_by = case when v_n = 1 then 'manual:' else 'manual-multi:' end || v_email,
         matched_at = now(),
         date_divergence = case when jsonb_array_length(v_kept) > 0 then v_kept else null end
   where id = v_line.id;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'A linha do banco não ficou conciliada.';
  end if;

  delete from public.bank_line_transactions where line_id = v_line.id;
  if v_n > 1 then
    insert into public.bank_line_transactions (line_id, transaction_id)
    select v_line.id, x from unnest(v_ids) x;
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_tx_forecast_same_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.enforce_forecast_amount_floor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.realign_tx_category_from_forecast()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_forecast RECORD;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF NEW.category_id IS NULL THEN RETURN NULL; END IF;

  SELECT id, category_id, event_id, company_id INTO v_forecast
    FROM public.event_forecasts
   WHERE transaction_id = NEW.id
     AND version_id IS NULL
     AND category_id IS NOT NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_forecast.id IS NULL THEN RETURN NULL; END IF;
  IF v_forecast.category_id IS NOT DISTINCT FROM NEW.category_id THEN RETURN NULL; END IF;

  IF NOT public.bp_tx_link_allowed(NEW.event_id, NEW.company_id, v_forecast.event_id, v_forecast.company_id) THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.id, 'blocked_cross_event_category_sync', 'sistema (trigger)',
            jsonb_build_object('category_id', NEW.category_id),
            jsonb_build_object('category_id', v_forecast.category_id),
            jsonb_build_object('forecast_id', v_forecast.id, 'direction', 'tx_to_forecast',
                               'tx_event_id', NEW.event_id, 'forecast_event_id', v_forecast.event_id),
            COALESCE(NEW.company_id, v_forecast.company_id));
    RETURN NULL;
  END IF;

  UPDATE public.transactions
     SET category_id = v_forecast.category_id
   WHERE id = NEW.id;

  IF NEW.company_id IS NOT NULL THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.id, 'auto_realign_tx_category', 'sistema (trigger)',
            jsonb_build_object('category_id', NEW.category_id),
            jsonb_build_object('category_id', v_forecast.category_id),
            jsonb_build_object('forecast_id', v_forecast.id, 'source', 'trigger', 'direction', 'tx_to_forecast'),
            NEW.company_id);
  END IF;

  RETURN NULL;
END $function$
;
CREATE OR REPLACE FUNCTION public.validate_paid_requires_payment_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  IF NEW.status = 'paid' AND NEW.payment_date IS NULL THEN
    RAISE EXCEPTION 'Transações pagas devem ter uma data de pagamento (payment_date)';
  END IF;

  IF NEW.payment_date IS NOT NULL AND NEW.payment_date > v_hoje THEN
    RAISE EXCEPTION 'Data de pagamento no futuro (%). Um pagamento regista dinheiro que já saiu — para uma saída prevista use a data de vencimento.', NEW.payment_date;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_event_forecast_partner_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.tx_has_installment_schedule(_tx_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.transaction_payments
    WHERE transaction_id = _tx_id
      AND (scheduled_date IS NOT NULL OR status IN ('planned','cancelled'))
  );
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_payment_list_batch_channel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_export boolean;
  v_in_export boolean;
  v_method text;
BEGIN
  IF NEW.payment_list_id IS NULL OR NEW.outside_batch THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_list_items i
    WHERE i.payment_list_id = NEW.payment_list_id
      AND i.transaction_id = NEW.transaction_id
      AND i.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Transação % não está ativa na lista de pagamento %.', NEW.transaction_id, NEW.payment_list_id
      USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.payment_list_sepa_exports x WHERE x.payment_list_id = NEW.payment_list_id),
         EXISTS (SELECT 1 FROM public.payment_list_sepa_exports x WHERE x.payment_list_id = NEW.payment_list_id AND NEW.transaction_id = ANY (x.transaction_ids))
    INTO v_has_export, v_in_export;

  IF v_has_export THEN
    IF NOT v_in_export THEN
      RAISE EXCEPTION 'A transação % não foi no ficheiro SEPA desta lista: liquida-se uma a uma por outro canal.', NEW.transaction_id
        USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT coalesce(t.payment_method, 'transfer') INTO v_method FROM public.transactions t WHERE t.id = NEW.transaction_id;
    IF v_method <> 'transfer' THEN
      RAISE EXCEPTION 'A transação % é paga por % — não vai no lote; liquida-se uma a uma.', NEW.transaction_id, v_method
        USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date DEFAULT NULL::date, p_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_payment public.transaction_payments%ROWTYPE;
  v_tx public.transactions%ROWTYPE;
  v_credit_id uuid;
  v_credit_amount numeric;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'permission_denied: apenas administradores podem estornar pagamentos';
  END IF;

  IF p_kind NOT IN ('cash_refund','supplier_credit') THEN
    RAISE EXCEPTION 'invalid_kind: % (esperado cash_refund | supplier_credit)', p_kind;
  END IF;

  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'reason_required: motivo do estorno é obrigatório';
  END IF;

  SELECT * INTO v_payment FROM public.transaction_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found: %', p_payment_id;
  END IF;

  IF v_payment.reversal_kind IS NOT NULL THEN
    RAISE EXCEPTION 'already_reversed: este pagamento já foi estornado (%)', v_payment.reversal_kind;
  END IF;

  IF v_payment.status <> 'paid' THEN
    RAISE EXCEPTION 'payment_not_paid: só parcelas pagas podem ser estornadas (status atual: %)', v_payment.status;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = v_payment.transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transaction_not_found';
  END IF;

  IF p_kind = 'supplier_credit' THEN
    IF v_tx.supplier_id IS NULL THEN
      RAISE EXCEPTION 'no_supplier: a transação não tem fornecedor definido — não é possível criar crédito';
    END IF;

    v_credit_amount := coalesce(p_amount, v_payment.amount);
    IF v_credit_amount <= 0 OR v_credit_amount > v_payment.amount + 0.01 THEN
      RAISE EXCEPTION 'invalid_amount: valor do crédito deve estar entre 0 e % (valor do pagamento)', v_payment.amount;
    END IF;

    INSERT INTO public.supplier_credits (
      supplier_id, origin_event_id, amount, used_amount, reason, valid_until, status, created_by, company_id
    )
    VALUES (
      v_tx.supplier_id,
      v_tx.event_id,
      v_credit_amount,
      0,
      'Estorno: ' || p_reason || ' (TX ref ' || v_tx.id::text || ')',
      p_valid_until,
      'active',
      coalesce((SELECT email FROM auth.users WHERE id = v_uid), 'sistema'),
      v_payment.company_id
    )
    RETURNING id INTO v_credit_id;

    UPDATE public.transaction_payments
       SET reversal_kind = 'supplier_credit',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = v_credit_id,
           updated_at = now()
     WHERE id = p_payment_id;

  ELSE
    UPDATE public.transaction_payments
       SET status = 'reversed',
           reversal_kind = 'cash_refund',
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           updated_at = now()
     WHERE id = p_payment_id;

    IF NOT public.tx_has_installment_schedule(v_tx.id) THEN
      DECLARE
        v_paid_sum numeric;
        v_max_date date;
        v_gross numeric := v_tx.amount * (1 + coalesce(v_tx.iva_rate, 0) / 100.0);
      BEGIN
        SELECT coalesce(SUM(amount),0), MAX(payment_date) INTO v_paid_sum, v_max_date
          FROM public.transaction_payments
         WHERE transaction_id = v_tx.id AND status = 'paid';

        IF v_paid_sum <= 0.01 THEN
          UPDATE public.transactions
             SET paid_amount = 0,
                 status = CASE WHEN status IN ('paid','partially_paid') THEN 'approved' ELSE status END,
                 payment_date = NULL,
                 updated_at = now()
           WHERE id = v_tx.id;
        ELSIF v_paid_sum >= v_gross - 0.01 THEN
          UPDATE public.transactions
             SET paid_amount = v_paid_sum, status = 'paid', payment_date = v_max_date, updated_at = now()
           WHERE id = v_tx.id;
        ELSE
          UPDATE public.transactions
             SET paid_amount = v_paid_sum, status = 'partially_paid', payment_date = NULL, updated_at = now()
           WHERE id = v_tx.id;
        END IF;
      END;
    END IF;

    DELETE FROM public.payment_list_items
     WHERE transaction_id = v_tx.id
       AND payment_list_id IN (
         SELECT id FROM public.payment_lists
          WHERE status IN ('draft','pending_approval')
       );
  END IF;

  BEGIN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata)
    VALUES (
      'transaction_payment',
      p_payment_id::text,
      'reverse_payment_' || p_kind,
      coalesce((SELECT email FROM auth.users WHERE id = v_uid), 'sistema'),
      jsonb_build_object('status', v_payment.status, 'amount', v_payment.amount, 'account_id', v_payment.account_id),
      jsonb_build_object('reversal_kind', p_kind, 'reason', p_reason, 'supplier_credit_id', v_credit_id, 'credit_amount', v_credit_amount),
      jsonb_build_object('transaction_id', v_tx.id, 'event_id', v_tx.event_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'kind', p_kind,
    'payment_id', p_payment_id,
    'transaction_id', v_tx.id,
    'supplier_credit_id', v_credit_id,
    'credit_amount', v_credit_amount
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.coala_capture_forecast_category_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fallback_id uuid;
  v_desc_norm text;
  v_src text;
  v_actor uuid;
BEGIN
  IF NEW.category_id IS NULL OR NEW.supplier_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_fallback_id
    FROM public.account_categories
   WHERE company_id = NEW.company_id
     AND code IN ('0.0.99','2.6.08')
   ORDER BY (code = '0.0.99') DESC
   LIMIT 1;
  IF v_fallback_id IS NOT NULL AND NEW.category_id = v_fallback_id THEN
    RETURN NEW;
  END IF;

  v_desc_norm := public.norm_coala_desc(NEW.description);
  IF v_desc_norm IS NULL OR length(v_desc_norm) < 3 THEN RETURN NEW; END IF;

  v_src := COALESCE(NULLIF(current_setting('app.coala_match_source', true), ''), 'bp_edit');
  v_actor := auth.uid();

  INSERT INTO public.coala_supplier_category_map AS m (
    company_id, supplier_id, description_normalized, category_id,
    confirmed_count, matched_via, created_by, last_used_at
  ) VALUES (
    NEW.company_id, NEW.supplier_id, v_desc_norm, NEW.category_id,
    1, v_src, v_actor, now()
  )
  ON CONFLICT (company_id, supplier_id, description_normalized) DO UPDATE
    SET category_id     = EXCLUDED.category_id,
        confirmed_count = CASE
          WHEN m.category_id = EXCLUDED.category_id THEN m.confirmed_count + 1
          ELSE 1
        END,
        matched_via     = EXCLUDED.matched_via,
        last_used_at    = now(),
        updated_at      = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'coala_capture_forecast_category_change failed: %', SQLERRM;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public._derive_paid_amount(p_tx_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric; v_iva_rate numeric; v_status text; v_currency text;
  v_parent uuid; v_split numeric; v_reimb boolean;
  v_gross numeric; v_paid_sum numeric; v_max_paid_date date; v_closes boolean;
BEGIN
  SELECT t.amount, COALESCE(t.iva_rate, 0), t.status, COALESCE(t.currency, 'EUR'),
         t.parent_transaction_id, t.split_percentage, COALESCE(t.is_reimbursement, false)
    INTO v_amount, v_iva_rate, v_status, v_currency, v_parent, v_split, v_reimb
    FROM public.transactions t WHERE t.id = p_tx_id;
  IF v_amount IS NULL THEN RETURN; END IF;
  IF (v_parent IS NOT NULL AND v_split IS NOT NULL)
     OR v_reimb
     OR EXISTS (SELECT 1 FROM public.partner_paid_expenses p WHERE p.transaction_id = p_tx_id)
  THEN RETURN; END IF;

  v_gross := v_amount * (1 + v_iva_rate / 100.0);
  SELECT COALESCE(SUM(p.amount), 0), MAX(p.payment_date),
         COALESCE(bool_or(COALESCE(p.closes_transaction, false)), false)
    INTO v_paid_sum, v_max_paid_date, v_closes
    FROM public.transaction_payments p
   WHERE p.transaction_id = p_tx_id AND p.status = 'paid';

  IF v_paid_sum <= 0.01 THEN
    UPDATE public.transactions
       SET paid_amount = 0,
           status = CASE WHEN v_status IN ('paid','partially_paid') THEN 'approved' ELSE v_status END,
           payment_date = NULL, updated_at = now()
     WHERE id = p_tx_id;
  ELSIF v_paid_sum >= v_gross - 0.05 OR (v_currency <> 'EUR' AND v_closes) THEN
    UPDATE public.transactions
       SET paid_amount = v_paid_sum, status = 'paid',
           payment_date = COALESCE(v_max_paid_date, CURRENT_DATE), updated_at = now()
     WHERE id = p_tx_id;
  ELSE
    UPDATE public.transactions
       SET paid_amount = v_paid_sum, status = 'approved', payment_date = NULL, updated_at = now()
     WHERE id = p_tx_id;
  END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  o record; op record; src record; oth record;
  v_other uuid; v_open numeric; v_amt numeric; v_new uuid;
BEGIN
  SELECT * INTO o FROM public.transaction_offsets WHERE id = p_offset_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO op FROM public.transaction_payments WHERE id = p_origin_payment_id;
  IF NOT FOUND OR op.payment_method = 'compensation' OR op.status <> 'paid' OR op.reversed_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  IF op.transaction_id = o.receivable_transaction_id THEN
    v_other := o.payable_transaction_id;
  ELSIF op.transaction_id = o.payable_transaction_id THEN
    v_other := o.receivable_transaction_id;
  ELSE
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.transaction_payments x
              WHERE x.offset_id = o.id AND x.transaction_id = v_other
                AND x.status = 'paid' AND x.reversed_at IS NULL) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO src FROM public.transactions WHERE id = op.transaction_id;
  SELECT * INTO oth FROM public.transactions WHERE id = v_other;
  SELECT round(oth.amount * (1 + COALESCE(oth.iva_rate, 0) / 100.0), 2)
         - COALESCE((SELECT SUM(x.amount) FROM public.transaction_payments x
                      WHERE x.transaction_id = v_other AND x.status IN ('planned','paid')), 0)
    INTO v_open;
  v_amt := round(LEAST(o.amount, v_open), 2);
  IF v_amt <= 0.01 THEN RETURN NULL; END IF;

  INSERT INTO public.transaction_payments (
    transaction_id, amount, payment_date, account_id, payment_method,
    payment_reference, notes, created_by, company_id, status, offset_id,
    closes_transaction, currency
  ) VALUES (
    v_other, v_amt, op.payment_date, NULL, 'compensation',
    left('Compensação com ' || COALESCE(src.description, src.id::text), 250),
    'Gerado pela ligação de compensação ' || o.id::text,
    op.created_by, oth.company_id, 'paid', o.id,
    (COALESCE(oth.currency, 'EUR') <> 'EUR' AND v_amt >= v_open - 0.05),
    'EUR'
  ) RETURNING id INTO v_new;

  -- Chamada a partir de um trigger: o sync_paid_amount_from_payments do INSERT
  -- acima corre com depth > 1 e sai sem derivar — deriva-se aqui com a MESMA
  -- função (contexto do dono do trigger). Chamada a partir da RPC (depth 0):
  -- o sync corre normalmente.
  IF pg_trigger_depth() > 0 THEN
    PERFORM public._derive_paid_amount(v_other);
  END IF;
  RETURN v_new;
END;
$function$
;
CREATE OR REPLACE FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record; v_other uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.transaction_payments x
              WHERE x.transaction_id = p_tx_id AND x.payment_method <> 'compensation'
                AND x.status = 'paid' AND x.reversed_at IS NULL) THEN
    RETURN;
  END IF;
  FOR o IN SELECT * FROM public.transaction_offsets
            WHERE receivable_transaction_id = p_tx_id OR payable_transaction_id = p_tx_id
  LOOP
    v_other := CASE WHEN o.receivable_transaction_id = p_tx_id
                    THEN o.payable_transaction_id ELSE o.receivable_transaction_id END;
    UPDATE public.transaction_payments
       SET status = 'reversed', reversed_at = now(), reversed_by = (SELECT auth.uid()),
           reversal_reason = 'estorno do pagamento de origem'
     WHERE offset_id = o.id AND transaction_id = v_other
       AND status = 'paid' AND reversed_at IS NULL;
    IF FOUND THEN
      PERFORM public._derive_paid_amount(v_other);
    END IF;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.card_load_on_out_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_in_id UUID;
BEGIN
  SELECT in_transaction_id INTO v_in_id
  FROM public.card_session_loads
  WHERE out_transaction_id = OLD.id;
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  DELETE FROM public.card_session_loads WHERE out_transaction_id = OLD.id;
  IF v_in_id IS NOT NULL THEN
    DELETE FROM public.transactions WHERE id = v_in_id;
  END IF;

  RETURN OLD;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_paid_amount_not_exceeds_gross()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_gross numeric;
  v_old_gross numeric;
BEGIN
  IF NEW.paid_amount IS NULL THEN
    RETURN NEW;
  END IF;

  v_gross := COALESCE(NEW.amount, 0) * (1 + COALESCE(NEW.iva_rate, 0) / 100.0);

  IF v_gross <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.paid_amount > v_gross + 0.01 THEN
    -- Estado legado já excedido: permitir desde que não aumente.
    v_old_gross := COALESCE(OLD.amount, 0) * (1 + COALESCE(OLD.iva_rate, 0) / 100.0);
    IF COALESCE(OLD.paid_amount, 0) > v_old_gross + 0.01
       AND NEW.paid_amount <= COALESCE(OLD.paid_amount, 0) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Valor pago (% €) excede o valor bruto da transação (% €).',
      ROUND(NEW.paid_amount::numeric, 2), ROUND(v_gross::numeric, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_admin_window_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_flag boolean;
  v_code text;
  v_window uuid;
  v_window_name text;
  v_chosen_name text;
  v_uid uuid := auth.uid();
  v_reason text;
BEGIN
  -- Filhas de rateio e parcelas: a obrigação é da mãe (como D1/D8).
  IF NEW.parent_transaction_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.category_id IS NULL OR NEW.date IS NULL OR NEW.company_id IS NULL THEN RETURN NEW; END IF;

  -- UPDATE sem mudança real das chaves: nunca toca histórico.
  IF TG_OP = 'UPDATE'
     AND NEW.event_id IS NOT DISTINCT FROM OLD.event_id
     AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id
     AND NEW.date IS NOT DISTINCT FROM OLD.date
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.type IS NOT DISTINCT FROM OLD.type THEN
    RETURN NEW;
  END IF;

  SELECT allocate_to_active_event, code INTO v_flag, v_code
    FROM public.account_categories WHERE id = NEW.category_id;
  IF NOT coalesce(v_flag, false) THEN RETURN NEW; END IF;

  v_window := public.admin_window_event_for(NEW.company_id, NEW.date);
  IF v_window IS NULL OR NEW.event_id IS NOT DISTINCT FROM v_window THEN RETURN NEW; END IF;

  SELECT name INTO v_window_name FROM public.events WHERE id = v_window;
  SELECT name INTO v_chosen_name FROM public.events WHERE id = NEW.event_id;

  v_reason := nullif(btrim(coalesce(current_setting('mp.admin_cost_override_reason', true), '')), '');

  IF v_uid IS NULL OR v_reason IS NULL
     OR NOT public.has_permission_in(v_uid, 'admin_cost_override', NEW.company_id) THEN
    RAISE EXCEPTION 'Esta conta é custo do evento % nesta data. Escolhe esse evento ou pede a excepção.', v_window_name
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, company_id, new_data, metadata)
  VALUES ('transaction', NEW.id::text, 'admin_cost_override',
          coalesce(auth.jwt() ->> 'email', v_uid::text), NEW.company_id,
          jsonb_build_object('event_id', NEW.event_id, 'category_code', v_code, 'date', NEW.date, 'type', NEW.type, 'op', TG_OP),
          jsonb_build_object(
            'evento_da_janela', jsonb_build_object('id', v_window, 'nome', v_window_name),
            'evento_escolhido', CASE WHEN NEW.event_id IS NULL THEN NULL
                                     ELSE jsonb_build_object('id', NEW.event_id, 'nome', v_chosen_name) END,
            'justificacao', v_reason));
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_forecast_baseline_amount()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.baseline_amount := COALESCE(NEW.baseline_amount, NEW.amount);
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.card_load_on_out_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_load  public.card_session_loads%ROWTYPE;
  v_sess  public.card_sessions%ROWTYPE;
  v_src_name TEXT;
  v_card_name TEXT;
  v_cat_id UUID;
  v_in_id UUID;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_load
  FROM public.card_session_loads
  WHERE out_transaction_id = NEW.id
    AND in_transaction_id IS NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_sess FROM public.card_sessions WHERE id = v_load.session_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT name INTO v_src_name  FROM public.financial_accounts WHERE id = v_load.source_account_id;
  SELECT name INTO v_card_name FROM public.financial_accounts WHERE id = v_sess.card_account_id;
  SELECT id   INTO v_cat_id    FROM public.account_categories  WHERE code = '10.3' LIMIT 1;

  INSERT INTO public.transactions (
    company_id, type, description, amount, iva_rate, date,
    status, paid_amount, payment_date,
    is_transitory, transitory_reason, exclude_from_result, category_id, account_id
  ) VALUES (
    NEW.company_id, 'income',
    'Carga de ' || COALESCE(v_src_name,'origem') || ' (' || COALESCE(v_src_name,'origem') || ' → ' || COALESCE(v_card_name,'cartão') || ')',
    v_load.amount, 0, v_load.load_date,
    'paid', v_load.amount, COALESCE(NEW.payment_date, v_load.load_date),
    TRUE, 'carga_cartao', TRUE, v_cat_id, v_sess.card_account_id
  ) RETURNING id INTO v_in_id;

  UPDATE public.card_session_loads
     SET in_transaction_id = v_in_id
   WHERE id = v_load.id;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_transaction_approval_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_check_permission boolean := false;
  v_check_bp_line boolean := false;
  v_verba numeric;
  v_desc text;
  v_rubrica text;
  v_real numeric;
BEGIN
  -- ===== PERMISSAO (approve_transactions) =====
  -- So no UPDATE que transita para 'approved'.
  -- NAO se exige no INSERT: quem nasce aprovado nasce pela regra do saldo do BP
  -- (a aprovacao previa e a verba, decidida em TransactionFormModal), e o gate
  -- da linha abaixo garante que existe linha de BP por tras. Aprovar FORA da
  -- verba e que e acto humano, e esse caminho passa sempre por UPDATE.
  -- Alterado 03/09/2026 apos a migracao D13 ter bloqueado todo o lancamento.
  IF TG_OP = 'UPDATE' THEN
    v_check_permission := (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved');
  END IF;

  -- ===== LINHA DE BP (D1 + D8) =====
  -- Corre no INSERT que nasce 'approved' OU 'paid' (cartoes pre-pagos, camarim,
  -- caches: transacoes que nunca passam por 'pending'), e no UPDATE que transita
  -- para 'approved'.
  --
  -- NAO corre no UPDATE que transita para 'paid'. E DELIBERADO: existem 462
  -- transacoes antigas ja aprovadas sem linha de BP em eventos geridos com BP;
  -- bloquear o pagamento delas seria mexer para tras no meio do fecho. Quem ja
  -- esta aprovado paga-se. Nao "corrijas" isto sem uma decisao explicita e sem
  -- primeiro sanar o historico.
  IF TG_OP = 'INSERT' THEN
    v_check_bp_line := (NEW.status IN ('approved', 'paid'));
  ELSIF TG_OP = 'UPDATE' THEN
    v_check_bp_line := (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved');
  END IF;

  -- service_role / crons / edge functions / syncs: sem identidade de utilizador -> permitido
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_check_permission THEN
    IF NOT (
      public.is_platform_admin()
      OR public.has_permission_in(v_uid, 'approve_transactions', NEW.company_id)
    ) THEN
      RAISE EXCEPTION 'Sem permissao para aprovar transacoes nesta empresa.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_check_bp_line THEN
    -- Isencoes da linha: ver historico (09/09 predicado countsAsBudgetCommitment,
    -- 16/09 D-ERP69 custo partilhado, 20/09 #111 rubrica 10.3).
    IF NEW.type = 'expense'
       AND NEW.event_id IS NOT NULL
       AND NEW.forecast_id IS NULL
       AND NEW.parent_transaction_id IS NULL
       AND COALESCE(NEW.is_transitory, false) = false
       AND COALESCE(NEW.exclude_from_result, false) = false
       AND NEW.reversed_at IS NULL
       AND COALESCE(NEW.is_hidden, false) = false
       AND NEW.shared_cost_account_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.account_categories c
          WHERE c.id = NEW.category_id
            AND c.code LIKE '10.3%'
       )
       AND public.event_budget_mode(NEW.event_id) = 'with_bp'
    THEN
      RAISE EXCEPTION 'Esta transacao nao tem linha de BP. Escolhe a linha (ou cria uma) antes de aprovar ou pagar.'
        USING ERRCODE = '42501';
    END IF;

    -- ===== VERBA DA LINHA (D2, #114, 10/10/2026) =====
    -- Aprovar/inserir aprovada ou paga uma despesa que leve o realizado da linha
    -- acima de event_forecasts.amount e recusado. Elevar no mesmo acto =
    -- raise_forecast_budget antes (sobe amount), por isso aqui basta comparar.
    -- Base liquida (D11). Realizado exclui transitorias, excluidas do resultado,
    -- revertidas e escondidas. Filhas de rateio/parcelas isentas (obrigacao do pai).
    -- UPDATE -> paid continua fora (D13, #111). baseline_amount nao e lido nem tocado.
    IF NEW.type = 'expense'
       AND NEW.forecast_id IS NOT NULL
       AND NEW.parent_transaction_id IS NULL
       AND COALESCE(NEW.is_transitory, false) = false
       AND COALESCE(NEW.exclude_from_result, false) = false
       AND NEW.reversed_at IS NULL
       AND COALESCE(NEW.is_hidden, false) = false
    THEN
      SELECT f.amount, f.description, COALESCE(c.code || ' ' || c.name, '')
        INTO v_verba, v_desc, v_rubrica
        FROM public.event_forecasts f
        LEFT JOIN public.account_categories c ON c.id = f.category_id
       WHERE f.id = NEW.forecast_id
       FOR UPDATE OF f;

      IF FOUND THEN
        SELECT COALESCE(sum(t.amount), 0) INTO v_real
          FROM public.transactions t
         WHERE t.forecast_id = NEW.forecast_id
           AND t.id <> NEW.id
           AND t.type = 'expense'
           AND t.status IN ('approved', 'paid')
           AND COALESCE(t.is_transitory, false) = false
           AND COALESCE(t.exclude_from_result, false) = false
           AND t.reversed_at IS NULL
           AND COALESCE(t.is_hidden, false) = false;
        v_real := v_real + COALESCE(NEW.amount, 0);
        IF v_real > COALESCE(v_verba, 0) + 0.005 THEN
          RAISE EXCEPTION 'Verba excedida na rubrica % ("%"): verba % €, realizado com esta despesa % €, excesso % €. Eleve a verba da linha no mesmo acto antes de aprovar.',
            v_rubrica, v_desc,
            replace(to_char(COALESCE(v_verba,0), 'FM999999990.00'), '.', ','),
            replace(to_char(v_real, 'FM999999990.00'), '.', ','),
            replace(to_char(v_real - COALESCE(v_verba,0), 'FM999999990.00'), '.', ',')
            USING ERRCODE = 'P0409';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.reimbursement_revert_on_tx_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.reimbursement_notes
  SET status = 'approved',
      payment_transaction_id = NULL,
      paid_at = NULL,
      updated_at = now()
  WHERE payment_transaction_id = OLD.id
    AND status = 'pending_payment';
  RETURN OLD;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.guard_paid_amount_vs_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_sum numeric;
BEGIN
  IF NEW.paid_amount IS NOT DISTINCT FROM OLD.paid_amount THEN RETURN NEW; END IF;
  IF public._paid_guard_is_exempt(NEW) THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM public.transaction_payments
   WHERE transaction_id = NEW.id AND status = 'paid';
  IF COALESCE(NEW.paid_amount, 0) < v_sum - 0.01 AND pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'O valor pago (% €) não pode ficar abaixo da soma dos pagamentos registados (% €). Para reduzir, estorne ou apague o pagamento no separador Pagamento da transação.',
      round(COALESCE(NEW.paid_amount, 0), 2), round(v_sum, 2)
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.materialize_paid_amount_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_sum numeric; v_diff numeric; v_method text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.paid_amount IS NOT DISTINCT FROM OLD.paid_amount THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' AND COALESCE(NEW.paid_amount, 0) <= 0.01 THEN RETURN NULL; END IF;
  IF public._paid_guard_is_exempt(NEW) THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM public.transaction_payments
   WHERE transaction_id = NEW.id AND status = 'paid';
  v_diff := round(COALESCE(NEW.paid_amount, 0) - v_sum, 2);
  IF abs(v_diff) <= 0.01 THEN RETURN NULL; END IF;

  IF v_diff < 0 THEN
    UPDATE public.transaction_payments
       SET status = 'reversed', reversed_at = now(),
           reversal_reason = 'reajuste automático do valor pago (D-ERP157)'
     WHERE transaction_id = NEW.id AND status = 'paid' AND created_by = 'base D-ERP157';
    SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM public.transaction_payments
     WHERE transaction_id = NEW.id AND status = 'paid';
    v_diff := round(COALESCE(NEW.paid_amount, 0) - v_sum, 2);
  END IF;

  IF v_diff > 0.01 THEN
    v_method := CASE WHEN NEW.account_id IS NULL THEN 'compensation'
                     WHEN NEW.payment_method IN ('transfer','service_payment','direct_debit','state_payment') THEN NEW.payment_method
                     ELSE 'transfer' END;
    INSERT INTO public.transaction_payments
      (transaction_id, amount, payment_date, account_id, payment_method, status,
       closes_transaction, company_id, created_by, notes)
    VALUES
      (NEW.id, v_diff, COALESCE(NEW.payment_date, NEW.date, current_date),
       CASE WHEN v_method = 'compensation' THEN NULL ELSE NEW.account_id END,
       v_method, 'paid', NEW.status = 'paid', NEW.company_id, 'base D-ERP157',
       'Criado pela base: transação gravada com valor pago sem linha de pagamento ('
         || COALESCE(auth.jwt() ->> 'email', current_user) || ')');
  END IF;

  PERFORM public._derive_paid_amount(NEW.id);
  RETURN NULL;
END $function$
;
CREATE OR REPLACE FUNCTION public.validate_transaction_event_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_event uuid; v_sealed boolean; v_old_sealed boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.event_settlement_id IS NOT NULL
     AND NEW.event_settlement_id IS DISTINCT FROM OLD.event_settlement_id THEN
    SELECT is_sealed INTO v_old_sealed FROM public.event_settlements WHERE id = OLD.event_settlement_id;
    IF COALESCE(v_old_sealed, false) THEN
      RAISE EXCEPTION 'Fechamento selado: as transações não podem ser desmarcadas. Reabra primeiro.';
    END IF;
  END IF;

  IF NEW.event_settlement_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'Uma transação sem evento (mãe de rateio) não pode ser ligada a um fechamento';
  END IF;
  SELECT event_id, is_sealed INTO v_event, v_sealed FROM public.event_settlements WHERE id = NEW.event_settlement_id;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Fechamento % não existe', NEW.event_settlement_id;
  END IF;
  IF COALESCE(v_sealed, false) AND (TG_OP = 'INSERT' OR NEW.event_settlement_id IS DISTINCT FROM OLD.event_settlement_id) THEN
    RAISE EXCEPTION 'Fechamento selado: não é possível marcar novas transações. Reabra primeiro.';
  END IF;
  IF NEW.event_id <> v_event THEN
    RAISE EXCEPTION 'A transação só pode ser ligada a um fechamento do próprio evento';
  END IF;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.sync_tx_forecast_to_anchor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anchor uuid;
  v_next uuid;
  v_fc_event uuid;
  v_fc_company uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND OLD.forecast_id IS NOT NULL
     AND OLD.forecast_id IS DISTINCT FROM NEW.forecast_id THEN
    SELECT transaction_id, event_id, company_id INTO v_anchor, v_fc_event, v_fc_company
    FROM public.event_forecasts
    WHERE id = OLD.forecast_id AND version_id IS NULL;

    IF FOUND AND v_anchor = NEW.id THEN
      SELECT t.id INTO v_next
      FROM public.transactions t
      WHERE t.forecast_id = OLD.forecast_id AND t.id <> NEW.id
        AND public.bp_tx_link_allowed(t.event_id, t.company_id, v_fc_event, v_fc_company)
      ORDER BY t.date, t.created_at, t.id
      LIMIT 1;

      UPDATE public.event_forecasts
      SET transaction_id = v_next
      WHERE id = OLD.forecast_id AND version_id IS NULL;
    END IF;
  END IF;

  IF NEW.forecast_id IS NOT NULL THEN
    SELECT transaction_id INTO v_anchor
    FROM public.event_forecasts
    WHERE id = NEW.forecast_id AND version_id IS NULL;

    IF FOUND AND v_anchor IS NULL THEN
      UPDATE public.event_forecasts
      SET transaction_id = NEW.id
      WHERE id = NEW.forecast_id AND transaction_id IS NULL AND version_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rederive_paid_amount_on_amount_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.amount is distinct from old.amount
     or coalesce(new.iva_rate,0) is distinct from coalesce(old.iva_rate,0) then
    if exists (select 1 from public.transaction_payments p
                where p.transaction_id = new.id and p.status = 'paid') then
      perform public._derive_paid_amount(new.id);
    end if;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx RECORD;
  v_uid uuid := auth.uid();
  v_credit_id uuid;
  v_paid_amount numeric;
  v_account_name text;
  v_removed_from_lists jsonb := '[]'::jsonb;
  v_list RECORD;
BEGIN
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'platform_admin'::app_role)) THEN
    RAISE EXCEPTION 'Apenas administradores podem estornar transações';
  END IF;

  IF p_kind NOT IN ('cash_refund','supplier_credit') THEN
    RAISE EXCEPTION 'Tipo de estorno inválido: %', p_kind;
  END IF;

  IF coalesce(trim(p_reason),'') = '' THEN
    RAISE EXCEPTION 'Motivo é obrigatório';
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transação não encontrada'; END IF;
  IF v_tx.status = 'reversed' THEN RAISE EXCEPTION 'Transação já está estornada'; END IF;
  IF coalesce(v_tx.paid_amount,0) <= 0 AND v_tx.status <> 'paid' THEN
    RAISE EXCEPTION 'Só transações com pagamento registado podem ser estornadas';
  END IF;

  v_paid_amount := coalesce(v_tx.paid_amount, 0);

  SELECT name INTO v_account_name FROM public.financial_accounts WHERE id = v_tx.account_id;

  IF p_kind = 'supplier_credit' THEN
    IF v_tx.supplier_id IS NULL THEN
      RAISE EXCEPTION 'Transação não tem fornecedor — não é possível criar crédito';
    END IF;

    INSERT INTO public.supplier_credits (
      supplier_id, origin_event_id, amount, reason, valid_until,
      document_ref, status, created_by, company_id
    ) VALUES (
      v_tx.supplier_id, v_tx.event_id, v_paid_amount,
      'Estorno tx ' || v_tx.id::text || ' — ' || p_reason,
      p_valid_until, 'reverse_tx:' || v_tx.id::text, 'active',
      coalesce(v_uid::text, 'system'), v_tx.company_id
    ) RETURNING id INTO v_credit_id;

    UPDATE public.transaction_payments
       SET reversal_kind = 'supplier_credit', reversal_reason = p_reason,
           reversed_at = now(), reversed_by = v_uid, supplier_credit_id = v_credit_id
     WHERE transaction_id = p_tx_id AND status = 'paid' AND reversal_kind IS NULL;
  ELSE
    UPDATE public.transaction_payments
       SET status = 'reversed', reversal_kind = 'cash_refund',
           reversal_reason = p_reason, reversed_at = now(), reversed_by = v_uid
     WHERE transaction_id = p_tx_id AND status = 'paid';
  END IF;

  DELETE FROM public.payment_list_items pli
   USING public.payment_lists pl
   WHERE pli.transaction_id = p_tx_id
     AND pli.payment_list_id = pl.id
     AND pl.status IN ('draft','pending_approval');

  IF p_release_for_repayment THEN
    FOR v_list IN
      SELECT pl.id AS list_id, pl.title AS list_name, pl.status AS list_status, pli.id AS pli_id
        FROM public.payment_list_items pli
        JOIN public.payment_lists pl ON pl.id = pli.payment_list_id
       WHERE pli.transaction_id = p_tx_id
         AND pl.status IN ('partially_approved','approved','paid')
    LOOP
      DELETE FROM public.payment_list_items WHERE id = v_list.pli_id;
      v_removed_from_lists := v_removed_from_lists || jsonb_build_object(
        'list_id', v_list.list_id, 'list_name', v_list.list_name, 'list_status', v_list.list_status
      );
    END LOOP;
  ELSE
    FOR v_list IN
      SELECT pl.id AS list_id, pl.title AS list_name, pl.status AS list_status
        FROM public.payment_list_items pli
        JOIN public.payment_lists pl ON pl.id = pli.payment_list_id
       WHERE pli.transaction_id = p_tx_id
         AND pl.status IN ('partially_approved','approved','paid')
    LOOP
      INSERT INTO public.transaction_audit_log (
        transaction_id, changed_by, field_name, old_value, new_value, company_id
      ) VALUES (
        p_tx_id, coalesce(v_uid::text, 'system'),
        'Estorno — lista mantida',
        v_list.list_name || ' (' || v_list.list_status || ')',
        'Transação estornada mas mantida na lista (modo conservador). Para libertar, refaça o estorno com "libertar para nova liquidação".',
        v_tx.company_id
      );
    END LOOP;
  END IF;

  IF p_release_for_repayment THEN
    UPDATE public.transactions
       SET status = 'pending',
           paid_amount = 0,
           payment_date = NULL,
           reversal_kind = p_kind,
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = CASE WHEN p_kind='supplier_credit' THEN v_credit_id ELSE supplier_credit_id END,
           updated_at = now()
     WHERE id = p_tx_id;
  ELSE
    UPDATE public.transactions
       SET status = 'reversed',
           paid_amount = CASE WHEN p_kind='cash_refund' THEN 0 ELSE paid_amount END,
           payment_date = CASE WHEN p_kind='cash_refund' THEN NULL ELSE payment_date END,
           reversal_kind = p_kind,
           reversal_reason = p_reason,
           reversed_at = now(),
           reversed_by = v_uid,
           supplier_credit_id = CASE WHEN p_kind='supplier_credit' THEN v_credit_id ELSE supplier_credit_id END,
           updated_at = now()
     WHERE id = p_tx_id;
  END IF;

  INSERT INTO public.transaction_audit_log (
    transaction_id, changed_by, field_name, old_value, new_value, company_id
  ) VALUES (
    p_tx_id,
    coalesce(v_uid::text, 'system'),
    'Estorno',
    'paid',
    CASE WHEN p_kind = 'cash_refund'
         THEN 'Devolução em dinheiro — ' || to_char(v_paid_amount,'FM999G999G990D00') || ' € repostos' ||
              coalesce(' em ' || v_account_name, '') || ' — ' || p_reason
         ELSE 'Crédito do fornecedor — ' || to_char(v_paid_amount,'FM999G999G990D00') || ' € — ' || p_reason
    END
      || CASE WHEN p_release_for_repayment
              THEN ' · Libertada para nova liquidação (status → A pagar)'
              ELSE ' · Estornada (status → Estornada)'
         END,
    v_tx.company_id
  );

  INSERT INTO public.system_audit_log (
    entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id
  ) VALUES (
    'transaction', p_tx_id::text, 'reverse_transaction_' || p_kind,
    coalesce(v_uid::text, 'system'), to_jsonb(v_tx),
    jsonb_build_object(
      'status', CASE WHEN p_release_for_repayment THEN 'pending' ELSE 'reversed' END,
      'reversal_kind', p_kind,
      'reversal_reason', p_reason,
      'supplier_credit_id', v_credit_id,
      'released_for_repayment', p_release_for_repayment,
      'removed_from_lists', v_removed_from_lists
    ),
    jsonb_build_object(
      'reason', p_reason,
      'amount', v_paid_amount,
      'supplier_credit_id', v_credit_id,
      'valid_until', p_valid_until,
      'released_for_repayment', p_release_for_repayment
    ),
    v_tx.company_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'transaction_id', p_tx_id,
    'kind', p_kind,
    'supplier_credit_id', v_credit_id,
    'released_for_repayment', p_release_for_repayment,
    'new_status', CASE WHEN p_release_for_repayment THEN 'pending' ELSE 'reversed' END,
    'removed_from_lists', v_removed_from_lists
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_paid_amount_from_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  PERFORM public._derive_paid_amount(COALESCE(NEW.transaction_id, OLD.transaction_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_tx_category_from_forecast()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_cat uuid;
  v_company uuid;
  v_tx_event uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;

  IF NEW.version_id IS NOT NULL THEN RETURN NULL; END IF;
  IF NEW.transaction_id IS NULL OR NEW.category_id IS NULL THEN RETURN NULL; END IF;

  SELECT category_id, company_id, event_id INTO v_old_cat, v_company, v_tx_event
    FROM public.transactions WHERE id = NEW.transaction_id;

  IF v_old_cat IS NOT DISTINCT FROM NEW.category_id THEN RETURN NULL; END IF;

  IF NOT public.bp_tx_link_allowed(v_tx_event, v_company, NEW.event_id, NEW.company_id) THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.transaction_id, 'blocked_cross_event_category_sync', 'sistema (trigger)',
            jsonb_build_object('category_id', v_old_cat),
            jsonb_build_object('category_id', NEW.category_id),
            jsonb_build_object('forecast_id', NEW.id, 'direction', 'forecast_to_tx',
                               'tx_event_id', v_tx_event, 'forecast_event_id', NEW.event_id),
            COALESCE(v_company, NEW.company_id));
    RETURN NULL;
  END IF;

  UPDATE public.transactions
     SET category_id = NEW.category_id
   WHERE id = NEW.transaction_id
     AND category_id IS DISTINCT FROM NEW.category_id;

  IF v_company IS NOT NULL THEN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transaction', NEW.transaction_id, 'auto_realign_tx_category', 'sistema (trigger)',
            jsonb_build_object('category_id', v_old_cat),
            jsonb_build_object('category_id', NEW.category_id),
            jsonb_build_object('forecast_id', NEW.id, 'source', 'trigger', 'direction', 'forecast_to_tx'),
            v_company);
  END IF;

  RETURN NULL;
END $function$
;
CREATE OR REPLACE FUNCTION public.log_table_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_action text;
  v_entity_id text;
  v_old jsonb;
  v_new jsonb;
  v_user text;
  v_company uuid;
  v_row jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_row := v_new;
    BEGIN v_entity_id := (NEW.id)::text; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_row := v_new;
    BEGIN v_entity_id := (NEW.id)::text; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_row := v_old;
    BEGIN v_entity_id := (OLD.id)::text; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
  END IF;

  BEGIN
    v_user := COALESCE(auth.uid()::text, 'system');
  EXCEPTION WHEN OTHERS THEN
    v_user := 'system';
  END;

  -- Resolver company_id de forma robusta:
  -- 1) Se a tabela é `companies`, usa o id da própria empresa (a auditoria pertence-lhe).
  -- 2) Senão, tenta a current_company_id() do utilizador autenticado.
  -- 3) Senão, tenta extrair `company_id` da própria linha.
  IF TG_TABLE_NAME = 'companies' THEN
    v_company := COALESCE(NULLIF(v_row->>'id','')::uuid, NULL);
  ELSE
    BEGIN
      v_company := current_company_id();
    EXCEPTION WHEN OTHERS THEN
      v_company := NULL;
    END;
    IF v_company IS NULL THEN
      BEGIN
        v_company := NULLIF(v_row->>'company_id','')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_company := NULL;
      END;
    END IF;
  END IF;

  -- D-ERP170: empresa já apagada (DELETE de companies ou cascata) → company_id NULL; o id fica em entity_id/old_data.
  IF v_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company) THEN
    v_company := NULL;
  END IF;

  BEGIN
    INSERT INTO public.system_audit_log (
      entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id
    ) VALUES (
      TG_TABLE_NAME,
      COALESCE(v_entity_id, gen_random_uuid()::text),
      v_action,
      v_user,
      v_old,
      v_new,
      jsonb_build_object('schema', TG_TABLE_SCHEMA, 'op', TG_OP),
      v_company
    );
  EXCEPTION WHEN not_null_violation THEN
    -- Última defesa: nunca bloquear a operação principal por falha de auditoria.
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_company_id_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := public.current_company_id();
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'company_id cannot be NULL — user has no associated company';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.force_transitory_for_capital_branch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
BEGIN
  IF NEW.category_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id)
  THEN
    SELECT code INTO v_code
    FROM public.account_categories
    WHERE id = NEW.category_id;

    -- Ramo Capital (10.1.*) → movimento de capital: entra na tesouraria, fora do resultado.
    -- Nunca força para false noutras rubricas.
    IF v_code IS NOT NULL AND v_code LIKE '10.1.%' THEN
      NEW.is_transitory := true;
      -- D-ERP80 (adenda 22/09/2026): o motivo do ramo 10.1 é DERIVADO da rubrica
      -- e sobrepõe-se sempre ao que vier do ecrã (havia aportes gravados como
      -- 'entrada_a_repassar' porque o modal do banco mandava o seu próprio motivo).
      NEW.transitory_reason := CASE
        WHEN v_code = '10.1.04' THEN 'emprestimo_socio'
        ELSE 'aporte_socio'
      END;
    END IF;
  END IF;

  -- Deixou de ser transitória: o motivo cai com ela.
  IF coalesce(NEW.is_transitory, false) = false THEN
    NEW.transitory_reason := NULL;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.trg_camarim_session_leg_follows_bank()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM public.camarim_sync_session_leg_payment(OLD.transaction_id); END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.transaction_id <> OLD.transaction_id) THEN
    PERFORM public.camarim_sync_session_leg_payment(NEW.transaction_id);
  END IF;
  RETURN NULL;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.force_no_account_on_compensation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Compensacao e encontro de contas sem movimento de caixa: nunca pode ter
  -- conta, senao entra na formula do saldo (que soma por t.account_id) e
  -- inflaciona a conta com dinheiro que nunca la entrou.
  -- Precedente: 4 transacoes do Coala, 103.467,78 EUR, apontadas ao Santander;
  -- so nao corromperam o saldo porque sao anteriores a data de corte de 31/08.
  IF NEW.payment_method = 'compensation' AND NEW.account_id IS NOT NULL THEN
    NEW.account_id := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.protect_master_split_forecast_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  has_split_children boolean := false;
  has_child_transactions boolean := false;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.type <> 'expense' then
    return new;
  end if;

  if old.transaction_id is null or new.transaction_id is not distinct from old.transaction_id then
    return new;
  end if;

  select exists (
    select 1
    from public.events se
    where se.parent_event_id = old.event_id
  ) into has_split_children;

  if not has_split_children then
    return new;
  end if;

  select exists (
    select 1
    from public.transactions t
    join public.events se on se.id = t.event_id
    where se.parent_event_id = old.event_id
      and t.parent_transaction_id = old.transaction_id
  ) into has_child_transactions;

  if has_child_transactions then
    raise exception 'Não é permitido alterar/remover transaction_id de um BP Master com transações-filhas vinculadas nos subeventos';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_transaction_offset()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; p record; v_sum numeric;
BEGIN
  IF NEW.receivable_transaction_id = NEW.payable_transaction_id THEN
    RAISE EXCEPTION 'Compensação: a receita e a despesa têm de ser transações diferentes.' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO r FROM public.transactions WHERE id = NEW.receivable_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compensação: a receita indicada não existe.' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO p FROM public.transactions WHERE id = NEW.payable_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compensação: a despesa indicada não existe.' USING ERRCODE = 'check_violation'; END IF;
  IF r.type <> 'income' THEN
    RAISE EXCEPTION 'Compensação: o lado a receber tem de ser uma receita (é "%").', r.type USING ERRCODE = 'check_violation';
  END IF;
  IF p.type <> 'expense' THEN
    RAISE EXCEPTION 'Compensação: o lado a pagar tem de ser uma despesa (é "%").', p.type USING ERRCODE = 'check_violation';
  END IF;
  IF r.company_id IS DISTINCT FROM p.company_id OR r.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'Compensação: as duas transações têm de ser da mesma empresa.' USING ERRCODE = 'check_violation';
  END IF;
  IF r.supplier_id IS NULL OR p.supplier_id IS NULL THEN
    RAISE EXCEPTION 'Compensação: as duas transações têm de ter fornecedor/cliente.' USING ERRCODE = 'check_violation';
  END IF;
  IF r.supplier_id <> p.supplier_id THEN
    RAISE EXCEPTION 'Compensação: a receita e a despesa têm de ser do mesmo fornecedor/cliente.' USING ERRCODE = 'check_violation';
  END IF;
  IF r.reversed_at IS NOT NULL OR r.status = 'reversed' OR p.reversed_at IS NOT NULL OR p.status = 'reversed' THEN
    RAISE EXCEPTION 'Compensação: não se liga uma transação estornada.' USING ERRCODE = 'check_violation';
  END IF;
  IF COALESCE(r.is_hidden, false) OR COALESCE(p.is_hidden, false) THEN
    RAISE EXCEPTION 'Compensação: não se liga uma transação escondida.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(SUM(o.amount), 0) + NEW.amount INTO v_sum
    FROM public.transaction_offsets o
   WHERE o.receivable_transaction_id = NEW.receivable_transaction_id AND o.id <> NEW.id;
  IF v_sum > round(r.amount * (1 + COALESCE(r.iva_rate, 0) / 100.0), 2) + 0.01 THEN
    RAISE EXCEPTION 'Compensação: o total ligado à receita (% €) excede o seu valor bruto (% €).',
      round(v_sum, 2), round(r.amount * (1 + COALESCE(r.iva_rate, 0) / 100.0), 2) USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(SUM(o.amount), 0) + NEW.amount INTO v_sum
    FROM public.transaction_offsets o
   WHERE o.payable_transaction_id = NEW.payable_transaction_id AND o.id <> NEW.id;
  IF v_sum > round(p.amount * (1 + COALESCE(p.iva_rate, 0) / 100.0), 2) + 0.01 THEN
    RAISE EXCEPTION 'Compensação: o total ligado à despesa (% €) excede o seu valor bruto (% €).',
      round(v_sum, 2), round(p.amount * (1 + COALESCE(p.iva_rate, 0) / 100.0), 2) USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := COALESCE((SELECT auth.uid())::text, 'sistema');
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.apply_transaction_offsets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.payment_method = 'compensation' OR NEW.status <> 'paid' OR NEW.reversed_at IS NOT NULL THEN
      RETURN NEW;
    END IF;
    FOR o IN SELECT id FROM public.transaction_offsets
              WHERE receivable_transaction_id = NEW.transaction_id
                 OR payable_transaction_id = NEW.transaction_id
    LOOP
      PERFORM public._apply_transaction_offset(o.id, NEW.id);
    END LOOP;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.payment_method <> 'compensation' AND OLD.status = 'paid' AND OLD.reversed_at IS NULL
       AND (NEW.status <> 'paid' OR NEW.reversed_at IS NOT NULL) THEN
      PERFORM public._reverse_transaction_offsets_for(NEW.transaction_id);
    END IF;
    RETURN NEW;
  ELSE
    IF OLD.payment_method <> 'compensation' AND OLD.status = 'paid' AND OLD.reversed_at IS NULL THEN
      PERFORM public._reverse_transaction_offsets_for(OLD.transaction_id);
    END IF;
    RETURN OLD;
  END IF;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_forecast_addback()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settlement_event uuid;
  v_parent uuid;
  v_sealed boolean;
BEGIN
  IF NEW.addback_settlement_id IS NULL THEN
    NEW.addback_reason := NULL;
    RETURN NEW;
  END IF;

  IF lower(coalesce(NEW.type, '')) <> 'expense' THEN
    RAISE EXCEPTION 'Só linhas de despesa podem ser devolvidas a um fechamento.';
  END IF;

  IF NEW.addback_reason IS NULL OR btrim(NEW.addback_reason) = '' THEN
    RAISE EXCEPTION 'Indique o motivo da devolução da linha ao fechamento.';
  END IF;

  SELECT s.event_id, s.parent_id, coalesce(s.is_sealed, false)
    INTO v_settlement_event, v_parent, v_sealed
  FROM public.event_settlements s
  WHERE s.id = NEW.addback_settlement_id;

  IF v_settlement_event IS NULL THEN
    RAISE EXCEPTION 'Fechamento de devolução inexistente.';
  END IF;

  IF v_settlement_event <> NEW.event_id THEN
    RAISE EXCEPTION 'O fechamento de devolução tem de pertencer ao mesmo evento da linha.';
  END IF;

  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Não é possível devolver uma linha ao fechamento raiz.';
  END IF;

  IF v_sealed THEN
    RAISE EXCEPTION 'O fechamento de devolução está selado.';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_forecast_event_settlement()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_event uuid; v_sealed boolean; v_old_sealed boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.event_settlement_id IS NOT NULL
     AND NEW.event_settlement_id IS DISTINCT FROM OLD.event_settlement_id THEN
    SELECT is_sealed INTO v_old_sealed FROM public.event_settlements WHERE id = OLD.event_settlement_id;
    IF COALESCE(v_old_sealed, false) THEN
      RAISE EXCEPTION 'Fechamento selado: as linhas do BP não podem ser desmarcadas. Reabra primeiro.';
    END IF;
  END IF;

  IF NEW.event_settlement_id IS NULL THEN RETURN NEW; END IF;
  SELECT event_id, is_sealed INTO v_event, v_sealed FROM public.event_settlements WHERE id = NEW.event_settlement_id;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Fechamento % não existe', NEW.event_settlement_id;
  END IF;
  IF COALESCE(v_sealed, false) AND (TG_OP = 'INSERT' OR NEW.event_settlement_id IS DISTINCT FROM OLD.event_settlement_id) THEN
    RAISE EXCEPTION 'Fechamento selado: não é possível marcar novas linhas do BP. Reabra primeiro.';
  END IF;
  IF NEW.event_id IS NULL OR NEW.event_id <> v_event THEN
    RAISE EXCEPTION 'A linha do BP só pode ser ligada a um fechamento do próprio evento';
  END IF;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.sync_forecast_anchor_to_tx()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Ignorar snapshots de versões/cenários
  IF NEW.version_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Âncora removida: NÃO limpar forecast_id (modelo N transações -> 1 linha)
  IF NEW.transaction_id IS NULL THEN RETURN NEW; END IF;

  SELECT forecast_id INTO v_existing
  FROM public.transactions
  WHERE id = NEW.transaction_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_existing IS NULL THEN
    UPDATE public.transactions SET forecast_id = NEW.id WHERE id = NEW.transaction_id;
  ELSIF v_existing = NEW.id THEN
    NULL; -- já coerente (idempotente)
  ELSE
    RAISE EXCEPTION 'Incoerência de vínculo BP↔transação: a transação % já está vinculada à linha de BP % e não pode ser usada como âncora da linha %. Desvincule-a primeiro.',
      NEW.transaction_id, v_existing, NEW.id;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_partner_aporte_mirror()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_src       record;
  v_acc       record;
  v_partner   record;
  v_cat_id    uuid;
  v_amount    numeric := 0;
  v_bridge_id uuid;
  v_aporte_id uuid;
  v_ret       record;
begin
  if TG_OP = 'DELETE' then v_src := OLD; else v_src := NEW; end if;
  if TG_OP = 'DELETE' then v_ret := OLD; else v_ret := NEW; end if;

  -- Só despesas geram aporte. O aporte espelhado e receita, logo nunca se espelha a si proprio.
  if v_src.type is distinct from 'expense' then
    return v_ret;
  end if;

  select id, aporte_transaction_id into v_bridge_id, v_aporte_id
    from partner_aporte_mirror
   where source_transaction_id = v_src.id;

  if TG_OP <> 'DELETE' then
    select * into v_acc from financial_accounts where id = NEW.account_id;
    if v_acc.id is not null
       and coalesce(v_acc.mirror_partner_aporte, false)
       and v_acc.partner_id is not null
       and NEW.status = 'paid'
       and NEW.reversed_at is null
    then
      v_amount := coalesce(NEW.paid_amount, 0);
    end if;
  end if;

  -- Nada a fazer
  if v_amount <= 0 and v_bridge_id is null then
    return v_ret;
  end if;

  -- Deixou de haver aporte: apagar o espelho (a ponte e o movimento de capital caem por cascata)
  if v_amount <= 0 then
    delete from transactions where id = v_aporte_id;
    return v_ret;
  end if;

  select * into v_partner from event_partners where id = v_acc.partner_id;
  select id into v_cat_id from account_categories
   where company_id = NEW.company_id and code = '10.1.01' limit 1;
  if v_cat_id is null then
    raise exception 'Conta-espelho: rubrica 10.1.01 nao existe na empresa %', NEW.company_id;
  end if;

  if v_bridge_id is null then
    insert into transactions (
      company_id, type, description, amount, paid_amount, iva_rate,
      date, payment_date, status, account_id, event_id, supplier_id,
      category_id, payment_method
    ) values (
      NEW.company_id, 'income',
      'Aporte automatico — ' || NEW.description,
      v_amount, v_amount, 0,
      coalesce(NEW.payment_date, NEW.date), coalesce(NEW.payment_date, NEW.date), 'paid',
      NEW.account_id, v_partner.event_id, v_partner.supplier_id,
      v_cat_id, 'transfer'
    ) returning id into v_aporte_id;

    insert into partner_aporte_mirror
      (company_id, account_id, source_transaction_id, aporte_transaction_id)
    values (NEW.company_id, NEW.account_id, NEW.id, v_aporte_id);

    insert into partner_capital_moves
      (company_id, event_id, partner_id, transaction_id, kind, flow)
    values (NEW.company_id, v_partner.event_id, v_acc.partner_id, v_aporte_id,
            'aporte', 'partner_settlement');
  else
    update transactions set
      description  = 'Aporte automatico — ' || NEW.description,
      amount       = v_amount,
      paid_amount  = v_amount,
      date         = coalesce(NEW.payment_date, NEW.date),
      payment_date = coalesce(NEW.payment_date, NEW.date),
      account_id   = NEW.account_id,
      event_id     = v_partner.event_id,
      supplier_id  = v_partner.supplier_id,
      updated_at   = now()
    where id = v_aporte_id;

    update partner_aporte_mirror
       set account_id = NEW.account_id, updated_at = now()
     where id = v_bridge_id;
  end if;

  return v_ret;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sync_shared_cost_mirror()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_src        record;
  v_ret        record;
  v_bridge_id  uuid;
  v_mirror_id  uuid;
  v_amount     numeric := 0;
  v_cat_id     uuid;
begin
  if TG_OP = 'DELETE' then v_src := OLD; v_ret := OLD; else v_src := NEW; v_ret := NEW; end if;

  -- Guarda anti-recursao: o proprio espelho nunca dispara logica de espelho.
  if exists (select 1 from shared_cost_mirror where mirror_transaction_id = v_src.id) then
    return v_ret;
  end if;

  select id, mirror_transaction_id into v_bridge_id, v_mirror_id
    from shared_cost_mirror
   where source_transaction_id = v_src.id;

  if TG_OP <> 'DELETE'
     and NEW.type = 'expense'
     and NEW.shared_cost_account_id is not null
     and NEW.status = 'paid'
     and NEW.reversed_at is null
  then
    v_amount := coalesce(NEW.paid_amount, 0);
  end if;

  -- Nada a fazer
  if v_amount <= 0 and v_bridge_id is null then
    return v_ret;
  end if;

  -- Deixou de haver adiantamento: apagar o espelho (a ponte cai por cascata)
  if v_amount <= 0 then
    delete from transactions where id = v_mirror_id;
    return v_ret;
  end if;

  select id into v_cat_id from account_categories
   where company_id = NEW.company_id and code = '10.12.01' limit 1;
  if v_cat_id is null then
    raise exception 'Custo partilhado: rubrica 10.12.01 nao existe na empresa %', NEW.company_id;
  end if;

  if v_bridge_id is null then
    insert into transactions (
      company_id, type, description, amount, paid_amount, iva_rate,
      date, payment_date, status, account_id, event_id, supplier_id,
      category_id, payment_method, exclude_from_result
    ) values (
      NEW.company_id, 'income',
      'Adiantamento por conta de terceiros — ' || coalesce(NEW.description, ''),
      v_amount, v_amount, 0,
      NEW.date, NEW.payment_date, 'paid',
      NEW.shared_cost_account_id, null, NEW.shared_cost_counterparty_id,
      v_cat_id, 'transfer', true
    ) returning id into v_mirror_id;

    insert into shared_cost_mirror
      (company_id, account_id, source_transaction_id, mirror_transaction_id)
    values (NEW.company_id, NEW.shared_cost_account_id, NEW.id, v_mirror_id);
  else
    update transactions set
      description  = 'Adiantamento por conta de terceiros — ' || coalesce(NEW.description, ''),
      amount       = v_amount,
      paid_amount  = v_amount,
      date         = NEW.date,
      payment_date = NEW.payment_date,
      account_id   = NEW.shared_cost_account_id,
      supplier_id  = NEW.shared_cost_counterparty_id,
      updated_at   = now()
    where id = v_mirror_id;

    update shared_cost_mirror
       set account_id = NEW.shared_cost_account_id, updated_at = now()
     where id = v_bridge_id;
  end if;

  return v_ret;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.coala_capture_category_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fallback_id uuid;
  v_desc_norm text;
  v_src text;
  v_actor uuid;
BEGIN
  -- só interessa quando categoria mudou para algo válido
  IF NEW.category_id IS NULL OR NEW.supplier_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  -- Ramo Capital (10.1.x): movimentos de capital — aportes, devoluções, distribuições,
  -- empréstimos a sócio — não são classificação de despesa e não alimentam o mapa de
  -- sugestão. Sem esta guarda, cada aporte espelhado automático escrevia uma linha aqui.
  IF EXISTS (
    SELECT 1 FROM public.account_categories c
     WHERE c.id = NEW.category_id AND c.code LIKE '10.1.%'
  ) THEN
    RETURN NEW;
  END IF;

  -- ignorar se for a categoria fallback "A Classificar"
  SELECT id INTO v_fallback_id
    FROM public.account_categories
   WHERE company_id = NEW.company_id
     AND code IN ('0.0.99','2.6.08')
   ORDER BY (code = '0.0.99') DESC
   LIMIT 1;
  IF v_fallback_id IS NOT NULL AND NEW.category_id = v_fallback_id THEN
    RETURN NEW;
  END IF;

  v_desc_norm := public.norm_coala_desc(NEW.description);
  IF v_desc_norm IS NULL OR length(v_desc_norm) < 3 THEN RETURN NEW; END IF;

  v_src := COALESCE(NULLIF(current_setting('app.coala_match_source', true), ''), 'inline_edit');
  v_actor := auth.uid();

  INSERT INTO public.coala_supplier_category_map AS m (
    company_id, supplier_id, description_normalized, category_id,
    confirmed_count, matched_via, created_by, last_used_at
  ) VALUES (
    NEW.company_id, NEW.supplier_id, v_desc_norm, NEW.category_id,
    1, v_src, v_actor, now()
  )
  ON CONFLICT (company_id, supplier_id, description_normalized) DO UPDATE
    SET category_id   = EXCLUDED.category_id,
        confirmed_count = CASE
          WHEN m.category_id = EXCLUDED.category_id THEN m.confirmed_count + 1
          ELSE 1
        END,
        matched_via   = EXCLUDED.matched_via,
        last_used_at  = now(),
        updated_at    = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'coala_capture_category_change failed: %', SQLERRM;
  RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.enforce_forecast_tx_same_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_event uuid;
  v_tx_company uuid;
  v_tx_found boolean := false;
  v_tx_ev_name text;
  v_fc_ev_name text;
BEGIN
  IF NEW.transaction_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.transaction_id IS NOT DISTINCT FROM NEW.transaction_id THEN RETURN NEW; END IF;
  IF NEW.version_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT t.event_id, t.company_id, true
    INTO v_tx_event, v_tx_company, v_tx_found
    FROM public.transactions t WHERE t.id = NEW.transaction_id;

  IF NOT COALESCE(v_tx_found, false) THEN RETURN NEW; END IF;

  IF public.bp_tx_link_allowed(v_tx_event, v_tx_company, NEW.event_id, NEW.company_id) THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_tx_ev_name FROM public.events WHERE id = v_tx_event;
  SELECT name INTO v_fc_ev_name FROM public.events WHERE id = NEW.event_id;

  RAISE EXCEPTION 'Vínculo recusado: a transação pertence ao evento "%" e a linha do Business Plan ao evento "%". Uma linha de BP só pode ser vinculada a transações do mesmo evento (ou sem evento, no desenho master/subeventos) e da mesma empresa.',
    COALESCE(v_tx_ev_name, '(sem evento)'), COALESCE(v_fc_ev_name, '(sem evento)');
END $function$
;
CREATE OR REPLACE FUNCTION public.bp_tx_link_allowed(_tx_event uuid, _tx_company uuid, _fc_event uuid, _fc_company uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _tx_company IS NOT NULL AND _fc_company IS NOT NULL AND _tx_company <> _fc_company THEN false
    WHEN _tx_event IS NULL THEN true
    WHEN _fc_event IS NULL THEN true
    WHEN _tx_event = _fc_event THEN true
    ELSE false
  END
$function$
;
CREATE OR REPLACE FUNCTION public.reimbursement_propagate_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_note RECORD;
BEGIN
  -- Só age em transições para 'paid'
  IF NEW.status IS DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_note
  FROM public.reimbursement_notes
  WHERE payment_transaction_id = NEW.id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Marca todos os itens como pagos (gross = base * (1 + iva/100))
  UPDATE public.transactions t
  SET status = 'paid',
      paid_amount = ROUND((t.amount * (1 + COALESCE(t.iva_rate,0) / 100.0))::numeric, 2),
      payment_date = COALESCE(NEW.payment_date, CURRENT_DATE),
      updated_at = now()
  FROM public.reimbursement_note_items i
  WHERE i.transaction_id = t.id
    AND i.reimbursement_note_id = v_note.id;

  -- Marca a nota como Paga
  UPDATE public.reimbursement_notes
  SET status = 'paid',
      paid_at = now(),
      updated_at = now()
  WHERE id = v_note.id
    AND status <> 'paid';

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_installments_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_amount numeric;
  v_iva_rate numeric;
  v_gross numeric;
  v_others numeric;
  v_sum numeric;
  v_old_sum numeric;
BEGIN
  SELECT amount, COALESCE(iva_rate, 0)
    INTO v_tx_amount, v_iva_rate
    FROM public.transactions
    WHERE id = NEW.transaction_id;

  IF v_tx_amount IS NULL THEN
    RETURN NEW;
  END IF;

  v_gross := v_tx_amount * (1 + v_iva_rate / 100.0);

  IF v_gross <= 0 THEN
    RETURN NEW;
  END IF;

  -- Soma das outras linhas (planned + paid; cancelled não conta)
  SELECT COALESCE(SUM(amount), 0)
    INTO v_others
    FROM public.transaction_payments
    WHERE transaction_id = NEW.transaction_id
      AND status IN ('planned','paid')
      AND id <> NEW.id;

  v_sum := v_others;
  IF NEW.status IN ('planned','paid') THEN
    v_sum := v_sum + NEW.amount;
  END IF;

  IF v_sum > v_gross + 0.01 THEN
    IF TG_OP = 'UPDATE' THEN
      v_old_sum := v_others;
      IF OLD.status IN ('planned','paid') THEN
        v_old_sum := v_old_sum + OLD.amount;
      END IF;
      -- linha legada: permitir desde que não piore
      IF v_sum <= v_old_sum THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'Soma das parcelas (% €) excede o valor bruto da transação (% €).',
      ROUND(v_sum::numeric, 2), ROUND(v_gross::numeric, 2)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.clear_reversal_on_repay()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_tx public.transactions; v_by text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'paid' OR NEW.reversed_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_tx FROM public.transactions WHERE id = NEW.transaction_id;
  IF v_tx.id IS NULL OR v_tx.reversed_at IS NULL THEN RETURN NEW; END IF;
  v_by := coalesce(NEW.created_by, nullif(auth.jwt() ->> 'email', ''), 'sistema');
  UPDATE public.transactions
     SET reversed_at = NULL, reversed_by = NULL,
         status = CASE WHEN status = 'reversed' THEN 'approved' ELSE status END
   WHERE id = v_tx.id;
  INSERT INTO public.transaction_audit_log (transaction_id, changed_by, changed_at, field_name, old_value, new_value, company_id)
  VALUES (v_tx.id, v_by, now(), 'reversed_at',
          'Estornada em ' || to_char(v_tx.reversed_at, 'YYYY-MM-DD') || coalesce(' (' || v_tx.reversal_reason || ')', ''),
          'Repaga em ' || NEW.payment_date::text || ' — estorno limpo (#101)', v_tx.company_id);
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.audit_transactions_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  f text; o jsonb := '{}'; n jsonb := '{}'; v_old jsonb; v_new jsonb;
  fields constant text[] := ARRAY['status','amount','reversed_at','payment_date','account_id','event_id'];
BEGIN
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  FOREACH f IN ARRAY fields LOOP
    IF TG_OP = 'UPDATE' AND (v_old -> f) IS NOT DISTINCT FROM (v_new -> f) THEN CONTINUE; END IF;
    IF v_old IS NOT NULL THEN o := o || jsonb_build_object(f, v_old -> f); END IF;
    IF v_new IS NOT NULL THEN n := n || jsonb_build_object(f, v_new -> f); END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND n = '{}'::jsonb THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO public.system_audit_log (entity_type, entity_id, action, changed_by, old_data, new_data, metadata, company_id)
    VALUES ('transactions', coalesce(NEW.id, OLD.id)::text,
            CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END,
            coalesce(auth.uid()::text, 'system'),
            CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE o END,
            CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE n END,
            jsonb_build_object('op', TG_OP, 'fields', 'status,amount,reversed_at,payment_date,account_id,event_id'),
            coalesce(NEW.company_id, OLD.company_id));
  EXCEPTION WHEN foreign_key_violation OR not_null_violation THEN NULL;
  END;
  RETURN coalesce(NEW, OLD);
END;
$function$
;
CREATE OR REPLACE FUNCTION public._paid_guard_is_exempt(p transactions)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(p.is_reimbursement, false)
      OR (p.parent_transaction_id IS NOT NULL AND p.split_percentage IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.partner_paid_expenses e WHERE e.transaction_id = p.id);
$function$
;
CREATE OR REPLACE FUNCTION public.admin_window_event_for(p_company_id uuid, p_date date)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id
    FROM public.events e
   WHERE e.company_id = p_company_id
     AND e.absorbs_admin_costs = true
     AND e.parent_event_id IS NULL
     AND e.admin_window_start IS NOT NULL
     AND p_date >= e.admin_window_start
     AND (e.admin_window_end IS NULL OR p_date <= e.admin_window_end)
   ORDER BY e.admin_window_start DESC
   LIMIT 1
$function$
;
CREATE OR REPLACE FUNCTION public.camarim_sync_session_leg_payment(p_tx uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record; v_sum numeric; v_date date; v_gross numeric; v_acc uuid; v_company uuid; v_cur text;
BEGIN
  FOR r IN
    SELECT l.bank_tx, l.session_tx
      FROM public.camarim_fund_moves m
      CROSS JOIN LATERAL public._camarim_fund_move_legs(m.id) l
     WHERE m.transaction_id = p_tx
        OR (m.move_type = 'refund' AND EXISTS (
              SELECT 1 FROM public.transactions a, public.transactions b
               WHERE a.id = m.transaction_id AND b.id = p_tx AND b.id <> a.id
                 AND b.description = a.description AND b.date = a.date AND b.amount = a.amount))
  LOOP
    CONTINUE WHEN r.bank_tx IS DISTINCT FROM p_tx;
    -- Pagamentos manuais na perna da sessão (ex.: correções de 09/10) mandam: não tocar.
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.transaction_payments p
                           WHERE p.transaction_id = r.session_tx AND p.status = 'paid'
                             AND p.created_by <> 'base #287');

    SELECT COALESCE(SUM(p.amount), 0), MAX(p.payment_date)
      INTO v_sum, v_date
      FROM public.transaction_payments p
     WHERE p.transaction_id = r.bank_tx AND p.status = 'paid';

    SELECT t.amount * (1 + COALESCE(t.iva_rate, 0) / 100.0), t.account_id, t.company_id, COALESCE(t.currency,'EUR')
      INTO v_gross, v_acc, v_company, v_cur
      FROM public.transactions t WHERE t.id = r.session_tx;

    -- Idempotente: a linha da base é recalculada a partir da perna do banco.
    IF EXISTS (SELECT 1 FROM public.transaction_payments p
                WHERE p.transaction_id = r.session_tx AND p.created_by = 'base #287'
                  AND p.status = 'paid' AND p.amount = LEAST(v_sum, v_gross)
                  AND p.payment_date = v_date)
       AND (SELECT count(*) FROM public.transaction_payments p
             WHERE p.transaction_id = r.session_tx AND p.created_by = 'base #287') = 1 THEN
      CONTINUE;
    END IF;

    DELETE FROM public.transaction_payments
     WHERE transaction_id = r.session_tx AND created_by = 'base #287';

    IF v_sum > 0.01 THEN
      INSERT INTO public.transaction_payments
        (transaction_id, amount, payment_date, account_id, payment_method, status,
         created_by, company_id, currency, notes)
      VALUES (r.session_tx, LEAST(v_sum, v_gross), v_date, v_acc, 'transfer', 'paid',
              'base #287', v_company, v_cur, 'Entrada na conta da sessão (espelho da perna do banco)');
    END IF;

    PERFORM public._derive_paid_amount(r.session_tx);
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.event_budget_mode(_event_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_mode text;
BEGIN
  SELECT e.company_id, COALESCE(e.budget_mode, c.default_budget_mode, 'with_bp')
    INTO v_company, v_mode
  FROM public.events e
  JOIN public.companies c ON c.id = e.company_id
  WHERE e.id = _event_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Isenção deliberada: sem identidade de utilizador (service_role, crons,
  -- edge functions, syncs) passa sem verificar. Não "corrigir" isto.
  IF v_uid IS NOT NULL
     AND NOT public.is_platform_admin(v_uid)
     AND v_company IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION 'Evento de outra empresa.' USING ERRCODE = '42501';
  END IF;

  RETURN v_mode;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.norm_coala_desc(s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'extensions'
AS $function$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(
          lower(unaccent(COALESCE(s, ''))),
          '[[:cntrl:][:punct:]•·●○◦‣⁃▪▫■□◆◇★☆]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  )
$function$
;
CREATE OR REPLACE FUNCTION public._camarim_fund_move_legs(p_move_id uuid)
 RETURNS TABLE(bank_tx uuid, session_tx uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH fm AS (
    SELECT m.move_type, m.transaction_id, s.advance_account_id AS sess_acc
      FROM public.camarim_fund_moves m
      JOIN public.camarim_sessions s ON s.id = m.session_id
     WHERE m.id = p_move_id AND m.transaction_id IS NOT NULL
       AND m.move_type IN ('advance','reinforcement','refund')
  ), linked AS (
    SELECT fm.*, t.* FROM fm JOIN public.transactions t ON t.id = fm.transaction_id
  ), twin AS (
    SELECT l.move_type, l.transaction_id, l.sess_acc,
           (SELECT t2.id FROM public.transactions t2
             WHERE t2.id <> l.id AND t2.company_id = l.company_id
               AND t2.description = l.description AND t2.date = l.date
               AND t2.amount = l.amount AND t2.category_id IS NOT DISTINCT FROM l.category_id
               AND t2.type <> l.type
               AND CASE WHEN l.move_type = 'refund'
                        THEN t2.account_id IS DISTINCT FROM l.sess_acc
                        ELSE t2.account_id = l.sess_acc END
             ORDER BY abs(extract(epoch FROM t2.created_at - l.created_at)) LIMIT 1) AS other
      FROM linked l
     WHERE CASE WHEN l.move_type = 'refund' THEN l.account_id = l.sess_acc
                ELSE l.account_id IS DISTINCT FROM l.sess_acc END
  )
  SELECT CASE WHEN move_type = 'refund' THEN other ELSE transaction_id END,
         CASE WHEN move_type = 'refund' THEN transaction_id ELSE other END
    FROM twin WHERE other IS NOT NULL;
$function$
;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_cache_contracts()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c1 bigint; s1 jsonb; c2 bigint; s2 jsonb; c3 bigint; s3 jsonb;
BEGIN
  WITH got AS (
    SELECT cc.contract_id, cc.event_id, cc.quota,
           coalesce((SELECT sum(t.amount) FROM public.transactions t
                      WHERE t.cache_contract_id = cc.contract_id AND t.event_id = cc.event_id AND t.reversed_at IS NULL
                        AND (t.parent_transaction_id IS NOT NULL OR t.cache_role = 'advance')),0) AS soma
      FROM public.cache_payment_contract_cities cc JOIN public.cache_payment_contracts k ON k.id = cc.contract_id
     WHERE k.cancelled_at IS NULL
  ), bad AS (SELECT * FROM got WHERE abs(quota - soma) > 0.01)
  SELECT count(*), coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM (SELECT * FROM bad LIMIT 6) b), '[]'::jsonb) INTO c1, s1 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c1, i.reference_count, c1 <= i.reference_count, i.notes, s1
    FROM public.system_invariants i WHERE i.name = 'cache_contrato_cidade_divergente';

  WITH bad AS (SELECT root_event_id, artist_supplier_id, count(*) n FROM public.cache_payment_contracts
                WHERE cancelled_at IS NULL GROUP BY 1,2 HAVING count(*) > public.cache_max_contracts())
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(bad)), '[]'::jsonb) INTO c2, s2 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c2, i.reference_count, c2 <= i.reference_count, i.notes, s2
    FROM public.system_invariants i WHERE i.name = 'cache_contratos_acima_limite';

  WITH bad AS (
    SELECT t.id, t.event_id, t.forecast_id FROM public.transactions t
     WHERE t.cache_role IS NOT NULL AND t.cache_contract_id IS NOT NULL AND (
       (t.parent_transaction_id IS NULL AND t.cache_role <> 'advance' AND (t.event_id IS NOT NULL OR t.forecast_id IS NOT NULL))
       OR (t.parent_transaction_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.events ch WHERE ch.parent_event_id = t.event_id))
       OR t.declared_withholding_amount IS NOT NULL OR t.iva_rate <> 0)
  )
  SELECT count(*), coalesce((SELECT jsonb_agg(to_jsonb(b)) FROM (SELECT * FROM bad LIMIT 6) b), '[]'::jsonb) INTO c3, s3 FROM bad;
  RETURN QUERY SELECT i.name, i.description, i.severity, i.scope, c3, i.reference_count, c3 <= i.reference_count, i.notes, s3
    FROM public.system_invariants i WHERE i.name = 'cache_contrato_estrutura_invalida';
END $function$
;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_extra()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cB bigint; sB jsonb;
  cX bigint; sX jsonb;
  cF bigint; sF jsonb;
  cP bigint; sP jsonb;
  cT bigint; sT jsonb;
  cL bigint; sL jsonb;
  cC bigint; sC jsonb;
  cM bigint; sM jsonb;
  cO bigint; sO jsonb;
  cS bigint; sS jsonb;
BEGIN
  WITH em_falta AS (
    SELECT c.id AS company_id, c.slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.company_id = c.id AND b.status = 'ok') AS ultimo_ok
      FROM public.companies c
     WHERE c.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM public.backup_runs b
          WHERE b.company_id = c.id
            AND b.status = 'ok'
            AND b.finished_at > now() - interval '30 hours'
       )
  ),
  global_falta AS (
    SELECT NULL::uuid AS company_id, 'global'::text AS slug,
           (SELECT max(b.finished_at) FROM public.backup_runs b
             WHERE b.scope = 'global' AND b.status = 'ok') AS ultimo_ok
     WHERE NOT EXISTS (
       SELECT 1 FROM public.backup_runs b
        WHERE b.scope = 'global'
          AND b.status = 'ok'
          AND b.finished_at > now() - interval '30 hours'
     )
  ),
  bad AS (
    SELECT * FROM em_falta
    UNION ALL
    SELECT * FROM global_falta
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cB, sB FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cB, i.reference_count, (cB = i.reference_count) AS conforme,
         i.notes, sB
    FROM public.system_invariants i
   WHERE i.name = 'backup_empresa_em_falta';

  SELECT count(*),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('tabela', e.schema_name || '.' || e.table_name, 'motivo', e.reason))
                     FROM public.backup_excluded_tables e), '[]'::jsonb)
    INTO cX, sX FROM public.backup_excluded_tables;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cX, i.reference_count, (cX = i.reference_count) AS conforme,
         i.notes, sX
    FROM public.system_invariants i
   WHERE i.name = 'backup_tabelas_excluidas';

  WITH falhados AS (
    SELECT l.template_name, l.recipient_email, l.status, l.error_message, l.created_at
      FROM public.email_send_log l
     WHERE l.status IN ('failed','dlq')
       AND l.created_at > now() - interval '24 hours'
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT template_name, recipient_email, status, error_message, created_at
                       FROM falhados ORDER BY created_at DESC LIMIT 6) x), '[]'::jsonb)
    INTO cF, sF FROM falhados;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cF, i.reference_count, (cF = i.reference_count) AS conforme,
         i.notes, sF
    FROM public.system_invariants i
   WHERE i.name = 'emails_falhados_24h';

  WITH presos AS (
    SELECT l.template_name, l.recipient_email, l.created_at
      FROM public.email_send_log l
     WHERE l.status = 'pending' AND NOT EXISTS (SELECT 1 FROM public.email_send_log s WHERE s.message_id = l.message_id AND s.status = 'sent')
       AND l.created_at < now() - interval '24 hours'
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT template_name, count(*) AS total,
                            min(created_at) AS mais_antigo, max(created_at) AS mais_recente
                       FROM presos GROUP BY template_name ORDER BY count(*) DESC LIMIT 6) x), '[]'::jsonb)
    INTO cP, sP FROM presos;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cP, i.reference_count, (cP = i.reference_count) AS conforme,
         i.notes, sP
    FROM public.system_invariants i
   WHERE i.name = 'emails_presos_pending';

  WITH grandes AS (
    SELECT n.nspname AS esquema, c.relname AS tabela, c.reltuples::bigint AS linhas
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND n.nspname IN ('public','crm')
       AND c.reltuples > 1000
       AND c.relname <> ALL (ARRAY['transactions','ticket_sales','event_forecasts','transaction_documents','event_zone_capacities','bilheteira_zone_snapshots','leads','contacts','undo_actions','meta_audience_upload_members','meta_custom_audiences','user_activity_log','system_audit_log','transaction_audit_log','ticketline_sync_runs','bol_sync_runs','coala_sync_runs','fever_sync_runs','transaction_payments','bank_statement_lines','artist_content_metrics_daily','song_link_events','redirect_log','consent_log','google_click','meta_ad_insights_daily','artist_metrics_daily','song_link_diag','meta_ad_snapshot','tickets_v2_sync_log','ads_insights_breakdown_daily','meta_adset_insights_daily','meta_creatives','artist_audience_demographics','meta_creatives_retention_log','lead_capture','email_send_log','artist_content','artist_song_metrics_daily','meta_adset_snapshot','email_unsubscribe_tokens','portal_error_log','meta_campaign_insights_daily','artist_song_playlist_streams','event_forecast_formalidade_log','artist_release_metrics_daily','ip_geo_cache']::text[])
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT esquema, tabela, linhas FROM grandes
                      ORDER BY linhas DESC LIMIT 50) x), '[]'::jsonb)
    INTO cT, sT FROM grandes;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cT, i.reference_count, (cT = i.reference_count) AS conforme,
         i.notes, sT
    FROM public.system_invariants i
   WHERE i.name = 'tabelas_acima_de_1000';

  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.date, t.description,
           t.status, t.paid_amount,
           ROUND(s.soma, 2) AS soma_linhas,
           ROUND(COALESCE(t.paid_amount, 0) - s.soma, 2) AS diferenca
      FROM public.transactions t
      JOIN LATERAL (
        SELECT SUM(p.amount) AS soma
          FROM public.transaction_payments p
         WHERE p.transaction_id = t.id
           AND p.status = 'paid'
      ) s ON s.soma IS NOT NULL
     WHERE NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
       AND COALESCE(t.is_reimbursement, false) = false
       AND NOT EXISTS (
         SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id
       )
       AND abs(COALESCE(t.paid_amount, 0) - s.soma) > 0.05
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY abs(diferenca) DESC LIMIT 5) x), '[]'::jsonb)
    INTO cL, sL FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cL, i.reference_count, (cL = i.reference_count) AS conforme,
         i.notes, sL
    FROM public.system_invariants i
   WHERE i.name = 'paid_amount_sem_linhas';

  WITH bad AS (
    SELECT l.id AS line_id, l.financial_account_id, l.statement_id,
           l.booking_date, l.description, l.amount, l.matched_by, l.matched_at
      FROM public.bank_statement_lines l
     WHERE l.status = 'matched'
       AND l.matched_transaction_id IS NULL
       AND l.created_transaction_id IS NULL
       AND l.matched_sepa_export_id IS NULL
       AND l.matched_payment_list_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.bank_line_transactions b WHERE b.line_id = l.id
       )
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY booking_date DESC LIMIT 6) x), '[]'::jsonb)
    INTO cC, sC FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cC, i.reference_count, (cC = i.reference_count) AS conforme,
         i.notes, sC
    FROM public.system_invariants i
   WHERE i.name = 'linha_conciliada_sem_transacao';

  WITH bad AS (
    SELECT p.id AS payment_id, p.transaction_id, p.currency, p.amount,
           p.original_amount, p.fx_rate, p.payment_date
      FROM public.transaction_payments p
     WHERE COALESCE(p.currency, 'EUR') <> 'EUR'
       AND (p.original_amount IS NULL OR p.fx_rate IS NULL)
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY payment_date DESC LIMIT 6) x), '[]'::jsonb)
    INTO cM, sM FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cM, i.reference_count, (cM = i.reference_count) AS conforme,
         i.notes, sM
    FROM public.system_invariants i
   WHERE i.name = 'pagamento_moeda_sem_cambio';

  WITH bad AS (
    SELECT o.id AS offset_id, o.company_id, o.receivable_transaction_id, o.payable_transaction_id, o.amount
      FROM public.transaction_offsets o
     WHERE (
             EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.receivable_transaction_id
                        AND x.payment_method <> 'compensation' AND x.status = 'paid' AND x.reversed_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.payable_transaction_id AND x.offset_id = o.id
                        AND x.status = 'paid' AND x.reversed_at IS NULL)
           ) OR (
             EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.payable_transaction_id
                        AND x.payment_method <> 'compensation' AND x.status = 'paid' AND x.reversed_at IS NULL)
             AND NOT EXISTS (SELECT 1 FROM public.transaction_payments x
                      WHERE x.transaction_id = o.receivable_transaction_id AND x.offset_id = o.id
                        AND x.status = 'paid' AND x.reversed_at IS NULL)
           )
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cO, sO FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cO, i.reference_count, (cO = i.reference_count) AS conforme,
         i.notes, sO
    FROM public.system_invariants i
   WHERE i.name = 'compensacao_pendente';
  -- D-ERP156: conta-corrente de sessão de camarim integrada tem de ficar a 0.
  WITH bad AS (
    SELECT s.id AS session_id, s.company_id, s.title, s.advance_account_id,
           round(public._account_true_balance_raw(s.advance_account_id), 2) AS saldo
      FROM public.camarim_sessions s
     WHERE s.status = 'integrated'
       AND s.advance_account_id IS NOT NULL
       AND abs(COALESCE(public._account_true_balance_raw(s.advance_account_id), 0)) >= 0.01
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM bad LIMIT 6) x), '[]'::jsonb)
    INTO cS, sS FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cS, i.reference_count, (cS = i.reference_count) AS conforme,
         i.notes, sS
    FROM public.system_invariants i
   WHERE i.name = 'camarim_sessao_integrada_com_saldo';
END;
$function$
;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE cZ bigint; sZ jsonb;
BEGIN
  WITH bad AS (
    SELECT t.id AS transaction_id, t.company_id, t.date, t.description,
           t.status, t.paid_amount, t.account_id
      FROM public.transactions t
     WHERE COALESCE(t.paid_amount, 0) > 0.01
       AND COALESCE(t.is_reimbursement, false) = false
       AND NOT (t.parent_transaction_id IS NOT NULL AND t.split_percentage IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.partner_paid_expenses pp WHERE pp.transaction_id = t.id)
       AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p
                        WHERE p.transaction_id = t.id AND p.status = 'paid')
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT * FROM bad ORDER BY paid_amount DESC LIMIT 6) x), '[]'::jsonb)
    INTO cZ, sZ FROM bad;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cZ, i.reference_count, (cZ = i.reference_count) AS conforme,
         i.notes, sZ
    FROM public.system_invariants i
   WHERE i.name = 'paid_sem_pagamento';
END;
$function$
;
CREATE OR REPLACE FUNCTION public._run_invariant_checks_rateio()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH m AS (
    SELECT p.id AS m_id, p.description AS m_desc, p.amount AS m_amount, sum(ch.amount) AS m_soma, count(*) AS m_n
      FROM public.transactions p
      JOIN public.transactions ch ON ch.parent_transaction_id = p.id AND ch.split_percentage IS NOT NULL
     GROUP BY p.id, p.description, p.amount
    HAVING abs(p.amount - sum(ch.amount)) > 0.01
  )
  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('id', m.m_id, 'descricao', m.m_desc, 'mae', m.m_amount, 'filhas', m.m_soma, 'n', m.m_n, 'diff', m.m_amount - m.m_soma) ORDER BY abs(m.m_amount - m.m_soma) DESC), '[]'::jsonb)
    INTO c, s FROM m;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count, c <= i.reference_count, i.notes, s
    FROM public.system_invariants i WHERE i.name = 'maes_rateio_divergentes';
END $function$
;
