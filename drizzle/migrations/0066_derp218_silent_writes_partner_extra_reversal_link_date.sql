-- #196: conversão em Extra do Sócio atómica.
CREATE OR REPLACE FUNCTION public._partner_extra_assert_can_write(p_event_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'P0403'; END IF;
  IF public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'platform_admin'::app_role) THEN RETURN; END IF;
  IF NOT (public.has_role(v_uid, 'manager'::app_role) OR public.has_role(v_uid, 'editor'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para gerir Extras do Sócio (só admin, manager ou editor).' USING ERRCODE = 'P0403';
  END IF;
  SELECT status INTO v_status FROM public.events WHERE id = p_event_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Evento inexistente ou sem acesso.' USING ERRCODE = 'P0403'; END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'O evento está concluído: só um admin pode criar ou reverter Extras do Sócio.' USING ERRCODE = 'P0403';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._partner_extra_assert_can_write(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.convert_transaction_to_partner_extra(
  p_tx_id uuid, p_partner_id uuid, p_event_id uuid, p_notes text DEFAULT NULL, p_clear_forecast boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_tx public.transactions; v_id uuid; v_rows int;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF v_tx.id IS NULL OR NOT public.row_belongs_to_current_company(v_tx.company_id) THEN
    RAISE EXCEPTION 'Transação inexistente ou de outra empresa.' USING ERRCODE = 'P0403';
  END IF;
  IF p_partner_id IS NULL OR p_event_id IS NULL THEN RAISE EXCEPTION 'Sócio e evento são obrigatórios.'; END IF;
  PERFORM public._partner_extra_assert_can_write(p_event_id);
  IF v_tx.event_id IS DISTINCT FROM p_event_id THEN
    PERFORM public._partner_extra_assert_can_write(v_tx.event_id);
  END IF;

  SELECT id INTO v_id FROM public.partner_advance_expenses WHERE transaction_id = p_tx_id;
  IF v_id IS NULL THEN
    INSERT INTO public.partner_advance_expenses (event_id, partner_id, transaction_id, notes, company_id)
    VALUES (p_event_id, p_partner_id, p_tx_id, p_notes, v_tx.company_id)
    RETURNING id INTO v_id;
  END IF;

  UPDATE public.transactions
     SET is_transitory = true, transitory_reason = 'partner_advance', exclude_from_result = false,
         forecast_id = CASE WHEN p_clear_forecast THEN NULL ELSE forecast_id END
   WHERE id = p_tx_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'A transação não foi actualizada.'; END IF;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.convert_transaction_to_partner_extra(uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_transaction_to_partner_extra(uuid, uuid, uuid, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.revert_partner_extra(p_tx_id uuid, p_clear_transitory boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_tx public.transactions; v_ev uuid; v_n int; v_rows int;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE;
  IF v_tx.id IS NULL OR NOT public.row_belongs_to_current_company(v_tx.company_id) THEN
    RAISE EXCEPTION 'Transação inexistente ou de outra empresa.' USING ERRCODE = 'P0403';
  END IF;
  FOR v_ev IN SELECT DISTINCT event_id FROM public.partner_advance_expenses WHERE transaction_id = p_tx_id LOOP
    PERFORM public._partner_extra_assert_can_write(v_ev);
  END LOOP;
  PERFORM public._partner_extra_assert_can_write(v_tx.event_id);
  DELETE FROM public.partner_advance_expenses WHERE transaction_id = p_tx_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF p_clear_transitory THEN
    UPDATE public.transactions SET is_transitory = false, transitory_reason = NULL WHERE id = p_tx_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION 'A transação não foi actualizada.'; END IF;
  END IF;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.revert_partner_extra(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revert_partner_extra(uuid, boolean) TO authenticated;

-- #101: repagar limpa o carimbo do estorno.
CREATE OR REPLACE FUNCTION public.clear_reversal_on_repay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
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
$function$;
REVOKE ALL ON FUNCTION public.clear_reversal_on_repay() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_clear_reversal_on_repay ON public.transaction_payments;
CREATE TRIGGER trg_clear_reversal_on_repay AFTER INSERT ON public.transaction_payments
  FOR EACH ROW EXECUTE FUNCTION public.clear_reversal_on_repay();

-- #101: auditoria de transactions em system_audit_log (campos relevantes).
CREATE OR REPLACE FUNCTION public.audit_transactions_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
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
$function$;
REVOKE ALL ON FUNCTION public.audit_transactions_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS zz_audit_transactions_change ON public.transactions;
CREATE TRIGGER zz_audit_transactions_change AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.audit_transactions_change();

-- #233: divergência de data no modo link.
ALTER TABLE public.bank_statement_lines ADD COLUMN IF NOT EXISTS date_divergence jsonb;
COMMENT ON COLUMN public.bank_statement_lines.date_divergence IS
  '#233 — divergências de data aceites (modo link): [{transaction_id, system_date, bank_date, amount, accepted_by, accepted_at}]';

CREATE OR REPLACE FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb)
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
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
$function$;