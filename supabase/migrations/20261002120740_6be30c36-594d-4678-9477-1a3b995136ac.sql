-- D-ERP157 (02/10/2026): paid_amount nunca sem linha de pagamento.

CREATE OR REPLACE FUNCTION public._paid_guard_is_exempt(p public.transactions)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(p.is_reimbursement, false)
      OR (p.parent_transaction_id IS NOT NULL AND p.split_percentage IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.partner_paid_expenses e WHERE e.transaction_id = p.id);
$$;
REVOKE ALL ON FUNCTION public._paid_guard_is_exempt(public.transactions) FROM PUBLIC, anon, authenticated;

-- BEFORE UPDATE: recusa baixar paid_amount abaixo da soma dos pagamentos vivos por escrita directa.
CREATE OR REPLACE FUNCTION public.guard_paid_amount_vs_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

-- AFTER INSERT/UPDATE: cria a linha em falta (ou reajusta as criadas pela base) e deriva (D-ERP86).
CREATE OR REPLACE FUNCTION public.materialize_paid_amount_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;

DROP TRIGGER IF EXISTS zz_guard_paid_amount_vs_payments ON public.transactions;
CREATE TRIGGER zz_guard_paid_amount_vs_payments
  BEFORE UPDATE OF paid_amount ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_paid_amount_vs_payments();

DROP TRIGGER IF EXISTS zz_materialize_paid_amount_payment ON public.transactions;
CREATE TRIGGER zz_materialize_paid_amount_payment
  AFTER INSERT OR UPDATE OF paid_amount ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.materialize_paid_amount_payment();

CREATE OR REPLACE FUNCTION public.launch_from_bank_lines(p_items jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_item jsonb;
  v_tx jsonb;
  v_line_ids uuid[];
  v_all_ids uuid[] := '{}';
  v_company uuid;
  v_current uuid;
  v_n_lines int;
  v_n_found int;
  v_bad uuid;
  v_cols text[];
  v_key text;
  v_sql text;
  v_tx_id uuid;
  v_out uuid[] := '{}';
  v_matched_by text;
  v_note text;
  v_rows int;
  v_was_paid boolean;
  v_pay_amount numeric;
  v_gross numeric;
  v_pay_date date;
  v_pay_acc uuid;
  v_pay_method text;
  v_currency text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nada a lançar: p_items tem de ser um array com pelo menos um item.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item -> 'transaction') <> 'object' then
      raise exception 'Item sem objecto "transaction".';
    end if;
    if v_item ? 'line_ids' and jsonb_typeof(v_item -> 'line_ids') = 'array' then
      select v_all_ids || coalesce(array_agg((x)::uuid), '{}')
        into v_all_ids
        from jsonb_array_elements_text(v_item -> 'line_ids') x;
    end if;
  end loop;

  if array_length(v_all_ids, 1) is null then
    raise exception 'Nenhuma linha do banco indicada — o lançamento tem de ficar ligado ao extrato.';
  end if;

  v_n_lines := array_length(v_all_ids, 1);

  select count(*), count(distinct l.company_id), (array_agg(distinct l.company_id))[1]
    into v_n_found, v_rows, v_company
    from public.bank_statement_lines l
   where l.id = any(v_all_ids);

  if v_n_found <> v_n_lines then
    raise exception 'Linha(s) do banco inexistente(s) ou sem acesso: pedidas %, encontradas %.', v_n_lines, v_n_found;
  end if;
  if v_rows <> 1 or v_company is null then
    raise exception 'As linhas do banco não pertencem todas à mesma empresa.';
  end if;

  v_current := public.current_company_id();
  if v_current is null or v_current <> v_company then
    raise exception 'As linhas do banco pertencem a outra empresa (%) — empresa activa %.', v_company, v_current;
  end if;

  select l.id into v_bad
    from public.bank_statement_lines l
   where l.id = any(v_all_ids)
     and (l.status <> 'unmatched'
          or l.matched_transaction_id is not null
          or l.created_transaction_id is not null)
   limit 1;

  if v_bad is not null then
    raise exception 'Linha do banco já está conciliada: %', v_bad;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tx := v_item -> 'transaction';

    -- D-ERP157: nasce 'approved' sem valor pago; o pagamento nasce em transaction_payments.
    v_was_paid := (v_tx ->> 'status') = 'paid'
                  or coalesce(nullif(v_tx ->> 'paid_amount', '')::numeric, 0) > 0.01;
    v_pay_amount := nullif(coalesce(nullif(v_tx ->> 'paid_amount', '')::numeric, 0), 0);
    v_pay_method := nullif(v_tx ->> 'payment_method', '');
    v_tx := v_tx - 'paid_amount' - 'payment_date';
    if (v_tx ->> 'status') = 'paid' then
      v_tx := jsonb_set(v_tx, '{status}', '"approved"');
    end if;

    v_cols := '{}';
    for v_key in select k from jsonb_object_keys(v_tx) k loop
      if v_key in ('id', 'company_id', 'created_at', 'updated_at') then
        continue;
      end if;
      if not exists (
        select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = 'transactions'
           and c.column_name = v_key
      ) then
        raise exception 'Coluna inexistente em transactions: %', v_key;
      end if;
      v_cols := v_cols || v_key;
    end loop;

    if array_length(v_cols, 1) is null then
      raise exception 'Item sem colunas válidas para transactions.';
    end if;

    v_sql := format(
      'insert into public.transactions (company_id, %s) select $2, %s from jsonb_populate_record(null::public.transactions, $1) r returning id',
      (select string_agg(quote_ident(c), ', ') from unnest(v_cols) c),
      (select string_agg('r.' || quote_ident(c), ', ') from unnest(v_cols) c)
    );
    execute v_sql into v_tx_id using v_tx, v_company;

    if v_tx_id is null then
      raise exception 'A transação não foi criada.';
    end if;
    v_out := v_out || v_tx_id;

    v_line_ids := '{}';
    if v_item ? 'line_ids' and jsonb_typeof(v_item -> 'line_ids') = 'array' then
      select coalesce(array_agg((x)::uuid), '{}') into v_line_ids
        from jsonb_array_elements_text(v_item -> 'line_ids') x;
    end if;

    if array_length(v_line_ids, 1) is not null then
      v_matched_by := coalesce(v_item ->> 'matched_by', 'created:sistema');
      v_note := nullif(v_item ->> 'note', '');

      update public.bank_statement_lines
         set status = 'matched',
             created_transaction_id = v_tx_id,
             matched_transaction_id = v_tx_id,
             matched_by = v_matched_by,
             matched_at = now(),
             note = v_note
       where id = any(v_line_ids);

      get diagnostics v_rows = row_count;
      if v_rows <> array_length(v_line_ids, 1) then
        raise exception 'Só % de % linhas do banco ficaram ligadas — nada fica gravado.', v_rows, array_length(v_line_ids, 1);
      end if;
    end if;

    if v_was_paid then
      select round((t.amount * (1 + coalesce(t.iva_rate, 0) / 100.0))::numeric, 2),
             coalesce(t.currency, 'EUR'), t.account_id, t.date
        into v_gross, v_currency, v_pay_acc, v_pay_date
        from public.transactions t where t.id = v_tx_id;

      if array_length(v_line_ids, 1) is not null then
        select max(coalesce(l.value_date, l.booking_date)),
               (array_agg(l.financial_account_id))[1]
          into v_pay_date, v_pay_acc
          from public.bank_statement_lines l
         where l.id = any(v_line_ids);
      end if;

      insert into public.transaction_payments
        (transaction_id, amount, payment_date, account_id, payment_method,
         status, closes_transaction, company_id, created_by, notes)
      values
        (v_tx_id, coalesce(v_pay_amount, v_gross), coalesce(v_pay_date, current_date),
         v_pay_acc,
         case when v_pay_acc is null then 'compensation'
              when v_pay_method in ('transfer','service_payment','direct_debit','state_payment') then v_pay_method
              else 'transfer' end,
         'paid', v_currency <> 'EUR', v_company,
         coalesce(auth.jwt() ->> 'email', 'sistema'),
         'Lançado a partir da linha do banco');
    end if;
  end loop;

  return v_out;
end;
$function$;

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES ('paid_sem_pagamento',
  'Transações não isentas (fora reembolso, filha de rateio, pago pelo sócio) com valor pago > 0 e nenhuma linha paga em transaction_payments.',
  'error', 'empresa', 0,
  'D-ERP157. A base materializa a linha em falta; tem de ficar a 0.')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, scope = EXCLUDED.scope;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_paid()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
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
$function$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_paid() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_paid() TO service_role;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid()
  UNION ALL SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL SELECT * FROM public._run_invariant_checks_secdef()
  UNION ALL SELECT * FROM public._run_invariant_checks_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_extrato()
$function$;