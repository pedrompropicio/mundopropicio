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
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nada a lançar: p_items tem de ser um array com pelo menos um item.';
  end if;

  -- (a) linhas referidas e empresa ------------------------------------------
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

  -- (b) nenhuma linha já conciliada ----------------------------------------
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

  -- (c)+(d) inserir e ligar, item a item ------------------------------------
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_tx := v_item -> 'transaction';

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

    -- linhas deste item
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
  end loop;

  return v_out;
end;
$function$;

REVOKE ALL ON FUNCTION public.launch_from_bank_lines(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.launch_from_bank_lines(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.launch_from_bank_lines(jsonb) TO authenticated, service_role;