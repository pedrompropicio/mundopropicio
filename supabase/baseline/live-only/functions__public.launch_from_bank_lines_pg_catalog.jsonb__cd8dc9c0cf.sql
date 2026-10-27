-- #352 G3: local disposable replay only. Never apply to Live.
-- object: functions:public.launch_from_bank_lines(pg_catalog.jsonb)
-- stage: tail
-- provenance: {"attnum": 0, "live_catalog_window": "frozen G2 catalogue, confirmed 6450286547; 2026-10-27T14:54:58.142159+00:00", "live_definition_sha256": "f2d27367e1163e938df060c62b54031dc94592a0f551733c5cad4fe33840c05b", "live_properties_sha256": "5ff9451a94dbc034035e110a6b03e9902a95a88c333db4bd336f8a25d9e6682c", "oid": 231974, "review": [6431939022, 6433564033, 6441951637], "rule": "live_definition_prevails", "source_sql_sha256": "3f0ad4ee99eb7d9c53f1ca543daef3cf790f2ff765c242e2d1fe3fd164a50cd4", "window": "final tail after the frozen migration pair; no invented historical timestamp"}
-- BEGIN OPERATION 022dc1fceba9f7e2f6cd9d0f1cd3261adf3580a843dcdbfe363c8e6323ac7424
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
$function$
;

ALTER FUNCTION public.launch_from_bank_lines(pg_catalog.jsonb) OWNER TO "postgres";
-- END OPERATION 022dc1fceba9f7e2f6cd9d0f1cd3261adf3580a843dcdbfe363c8e6323ac7424
