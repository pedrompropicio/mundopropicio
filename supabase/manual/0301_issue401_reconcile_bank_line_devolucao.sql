-- 0301 — Issue #401 (Lote B, #435): conciliação de devolução de pagamento.
-- Data: 2026-11-01. Classe R2. PREPARAÇÃO: só ficheiro, sem executar em Live.
-- Aplicação: 0 · Cowork pelo PROC-promocao (mp-homolog-3 → Live com "Sim" do Pedro).
-- Definição anterior integral obtida por SELECT pg_get_functiondef em Live.
-- Assinatura: public.reconcile_bank_line(p_line_id uuid, p_items jsonb) RETURNS void.
-- Owner: postgres. LANGUAGE plpgsql. SECURITY INVOKER (prosecdef=false).
-- proconfig: search_path=public. MD5 da definição anterior: 9e6b49752f44e6f666bdd96c5e0c06b5.
-- ACL conferida por SELECT: postgres=X/postgres, authenticated=X/postgres,
-- service_role=X/postgres, sandbox_exec_sfohvvlqccmmebvjgibx=X/postgres,
-- issue335_executor=X/postgres. PUBLIC e anon sem EXECUTE explícito.
-- CREATE OR REPLACE mantém assinatura, owner, SECURITY, search_path e ACL existentes.
-- Preserva integralmente os ramos link/settle, offset/#335 e decisões de data/#233.
-- Exceção explícita ao sinal D-ERP127: devolucao exige crédito positivo e expense.
-- Só status='paid', reversed_at/reversal_kind NULL, na conta e empresa do extrato.
-- Perna identificada por valor integral ao cêntimo: empate ou seleção incerta recusa;
-- sem payment_id no contrato atual, não escolhe arbitrariamente a perna mais recente.
-- Havendo uma só perna, recusa valor superior ou devolução parcial com mensagem própria.
-- offset_group_id não nulo recusa; issue335_guard e contexto privado ficam intactos.
-- Estorna apenas os campos da perna usados pelo estorno manual cash_refund.
-- NUNCA escreve paid_amount ou status da transação: derivação pelo trigger (D-ERP86).
-- reverse_payment não é chamado: tem gate admin/SECURITY DEFINER e ainda escrita direta
-- dos derivados no seu ramo legado; aqui mantém-se o contexto invoker da conciliação.
-- RETURNS void é preservado: segunda devolução assinalada por NOTICE no fim do sucesso.
-- Descrição vazia recusa; date_action em devolucao recusa para não mudar a data original.
-- Ligação à linha/ponte usa o caminho existente; lote SEPA original não é alterado.
-- O botão no modal «Conciliar manualmente», com despesas pagas nesta conta, é tarefa R1
-- separada, só depois de a RPC estar em Live (PROC-promocao, passo 7).

-- ROLLBACK COMENTADO — definição anterior completa; não executar nesta preparação.
-- CREATE OR REPLACE FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb)
--  RETURNS void
--  LANGUAGE plpgsql
--  SET search_path TO 'public'
-- AS $function$
-- declare
--   v_line public.bank_statement_lines;
--   v_current uuid;
--   v_email text;
--   v_sign_type text;
--   v_target numeric;
--   v_sum numeric := 0;
--   v_n int;
--   v_item jsonb;
--   v_tx public.transactions;
--   v_tx_id uuid;
--   v_mode text;
--   v_amount numeric;
--   v_gross numeric;
--   v_open numeric;
--   v_ids uuid[] := '{}';
--   v_pay_date date;
--   v_rows int;
--   v_action text;
--   v_sys_date date;
--   v_pending jsonb := '[]'::jsonb;
--   v_kept jsonb := '[]'::jsonb;
--   v_group jsonb;
--   v_gid uuid;
--   v_request uuid;
--   v_supplier uuid;
-- begin
--   if NOT public.issue335_context_valid() and exists(select 1 from jsonb_array_elements(p_items) i where i->>'mode'='offset') then
--     insert into public.issue335_commands(command) values(jsonb_build_object('op','bank','line_id',p_line_id,'items',p_items));
--     return;
--   end if;
--   if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
--     raise exception 'Nada a conciliar: p_items tem de ser um array com pelo menos um item.';
--   end if;
-- 
--   select * into v_line from public.bank_statement_lines where id = p_line_id FOR UPDATE;
--   if v_line.id is null then
--     raise exception 'Linha do banco inexistente ou sem acesso: %', p_line_id;
--   end if;
-- 
--   v_current := public.current_company_id();
--   if v_current is null or v_current <> v_line.company_id then
--     raise exception 'A linha do banco pertence a outra empresa (%) — empresa activa %.', v_line.company_id, v_current;
--   end if;
-- 
--   if public.issue335_context_valid() and not exists(select 1 from jsonb_array_elements(p_items) i where i->>'mode'='offset') then
--     raise exception 'invalid_operation: executor não pode entrar no ramo legado';
--   end if;
--   if exists(select 1 from jsonb_array_elements(p_items) i where i->>'mode'='offset') then
--     if not (public.is_platform_admin(public.issue335_uid()) or public.has_role(public.issue335_uid(),'admin') or public.has_role(public.issue335_uid(),'manager') or public.has_permission(public.issue335_uid(),'manage_bank_reconciliation')) then raise exception 'permission_denied'; end if;
--     v_request := (p_items->0->>'request_id')::uuid;
--     v_supplier := (p_items->0->>'supplier_id')::uuid;
--     if v_line.offset_group_id is not null then
--       perform 1 from public.transaction_offset_groups where id=v_line.offset_group_id and request_id=v_request;
--       if not found then raise exception 'line_already_matched'; end if;
--     elsif v_line.status<>'unmatched' or v_line.matched_transaction_id is not null or v_line.created_transaction_id is not null or exists(select 1 from public.bank_line_transactions where line_id=p_line_id) then
--       raise exception 'line_already_matched';
--     end if;
--     v_group := public._issue335_execute(v_request,v_supplier,p_items,
--       jsonb_build_object('account_id',v_line.financial_account_id,'date',coalesce(v_line.value_date,v_line.booking_date),'amount',v_line.amount),
--       coalesce(v_line.value_date,v_line.booking_date),null);
--     v_gid := (v_group->>'group_id')::uuid;
--     if v_group->>'status'<>'applied' then raise exception 'group_not_applied'; end if;
--     if v_line.offset_group_id is not null then return; end if;
--     insert into public.system_audit_log(entity_type,entity_id,action,changed_by,old_data,new_data,company_id)
--       values('bank_statement_line',p_line_id::text,'issue335_attach',public.issue335_uid()::text,to_jsonb(v_line),jsonb_build_object('group_id',v_gid,'transactions',(select jsonb_agg(transaction_id order by transaction_id) from public.transaction_offset_items where group_id=v_gid and cash_amount>0)),v_current);
--     update public.transaction_offset_groups set bank_line_id=p_line_id where id=v_gid;
--     update public.bank_statement_lines set status='matched',offset_group_id=v_gid,matched_by='offset:'||public.issue335_uid()::text,matched_at=now() where id=p_line_id;
--     insert into public.bank_line_transactions(line_id,transaction_id)
--       select p_line_id,transaction_id from public.transaction_offset_items where group_id=v_gid and cash_amount>0;
--     return;
--   end if;
-- 
--   if v_line.status <> 'unmatched'
--      or v_line.matched_transaction_id is not null
--      or v_line.created_transaction_id is not null
--      or exists (select 1 from public.bank_line_transactions b where b.line_id = v_line.id) then
--     raise exception 'Linha do banco já está conciliada: %', v_line.id;
--   end if;
-- 
--   v_sign_type := case when v_line.amount >= 0 then 'income' else 'expense' end;
--   v_target := round(abs(coalesce(v_line.amount, 0))::numeric, 2);
--   v_pay_date := coalesce(v_line.value_date, v_line.booking_date);
-- 
--   v_email := coalesce(
--     nullif(auth.jwt() ->> 'email', ''),
--     (select p.email from public.profiles p where p.id = auth.uid()),
--     'sistema'
--   );
-- 
--   for v_item in select * from jsonb_array_elements(p_items) loop
--     v_tx_id := nullif(v_item ->> 'transaction_id', '')::uuid;
--     v_mode := coalesce(v_item ->> 'mode', 'link');
--     v_amount := round(coalesce((v_item ->> 'amount')::numeric, 0), 2);
--     v_action := nullif(v_item ->> 'date_action', '');
-- 
--     if v_tx_id is null then
--       raise exception 'Item sem transaction_id.';
--     end if;
--     if v_mode not in ('link', 'settle') then
--       raise exception 'Modo inválido (%) — só "link" ou "settle".', v_mode;
--     end if;
--     if v_action is not null and v_action not in ('align', 'keep') then
--       raise exception 'date_action inválida (%) — só "align" ou "keep".', v_action;
--     end if;
--     if v_amount <= 0 then
--       raise exception 'Valor inválido para a transação %: %.', v_tx_id, v_amount;
--     end if;
--     if v_tx_id = any(v_ids) then
--       raise exception 'Transação repetida no mesmo pedido: %', v_tx_id;
--     end if;
-- 
--     select * into v_tx from public.transactions where id = v_tx_id;
--     if v_tx.id is null then
--       raise exception 'Transação inexistente ou sem acesso: %', v_tx_id;
--     end if;
--     if v_tx.company_id <> v_current then
--       raise exception 'A transação % pertence a outra empresa.', v_tx_id;
--     end if;
--     if v_tx.reversed_at is not null then
--       raise exception 'A transação % está revertida.', v_tx_id;
--     end if;
--     if v_tx.type <> v_sign_type then
--       raise exception 'Sinal incompatível: a linha do banco é % e a transação % é "%".',
--         case when v_sign_type = 'income' then 'a crédito (receita)' else 'a débito (despesa)' end,
--         v_tx_id, v_tx.type;
--     end if;
-- 
--     if v_mode = 'link' then
--       -- #233: a data no sistema tem de bater com a do banco, ou a pessoa decide.
--       v_sys_date := coalesce(v_tx.payment_date,
--         (select max(tp.payment_date) from public.transaction_payments tp
--           where tp.transaction_id = v_tx_id and tp.status = 'paid'));
--       if v_pay_date is not null and v_sys_date is distinct from v_pay_date then
--         if v_action is null then
--           v_pending := v_pending || jsonb_build_object('transaction_id', v_tx_id, 'system_date', v_sys_date,
--                                                       'bank_date', v_pay_date, 'amount', v_amount);
--         elsif v_action = 'align' then
--           if exists(select 1 from public.transaction_payments where transaction_id=v_tx_id and offset_group_id is not null and status='paid' and reversed_at is null) then raise exception 'managed_group_date_alignment_forbidden: estorne o encontro inteiro antes de alinhar'; end if;
--           update public.transaction_payments
--              set payment_date = v_pay_date, updated_at = now()
--            where transaction_id = v_tx_id and status = 'paid' and payment_date is not distinct from v_sys_date;
--           get diagnostics v_rows = row_count;
--           if v_rows = 0 then
--             update public.transactions set payment_date = v_pay_date where id = v_tx_id;
--           end if;
--           insert into public.transaction_audit_log (transaction_id, changed_by, changed_at, field_name, old_value, new_value, company_id)
--           values (v_tx_id, v_email, now(), 'payment_date', v_sys_date::text,
--                   v_pay_date::text || ' (alinhada pela data do banco, #233)', v_current);
--         else
--           v_kept := v_kept || jsonb_build_object('transaction_id', v_tx_id, 'system_date', v_sys_date,
--                      'bank_date', v_pay_date, 'amount', v_amount, 'accepted_by', v_email, 'accepted_at', now());
--         end if;
--       end if;
--     end if;
-- 
--     if v_mode = 'settle' then
--       v_gross := round(coalesce(v_tx.amount, 0) * (1 + coalesce(v_tx.iva_rate, 0) / 100.0), 2);
--       v_open := round(v_gross - coalesce(v_tx.paid_amount, 0), 2);
--       if v_open <= 0 then
--         raise exception 'A transação % não tem valor em aberto.', v_tx_id;
--       end if;
--       if v_amount > v_open + 0.01 then
--         raise exception 'Valor a liquidar (%) acima do que está em aberto (%) na transação %.', v_amount, v_open, v_tx_id;
--       end if;
-- 
--       insert into public.transaction_payments
--         (transaction_id, amount, payment_date, account_id, payment_method,
--          payment_reference, notes, created_by)
--       values
--         (v_tx_id, v_amount, v_pay_date, v_line.financial_account_id, 'transfer',
--          left(coalesce(v_line.description, ''), 500), 'Liquidação pela conciliação bancária', v_email);
-- 
--       if v_tx.account_id is null then
--         update public.transactions set account_id = v_line.financial_account_id where id = v_tx_id;
--       end if;
--     end if;
-- 
--     v_ids := v_ids || v_tx_id;
--     v_sum := v_sum + v_amount;
--   end loop;
-- 
--   if jsonb_array_length(v_pending) > 0 then
--     raise exception 'Data de pagamento diferente da do banco — escolher alinhar ou manter.'
--       using errcode = 'P0410', detail = v_pending::text;
--   end if;
-- 
--   v_sum := round(v_sum, 2);
--   if abs(v_sum - v_target) > 0.01 then
--     raise exception 'A soma dos valores (%) não bate com a linha do banco (%).', v_sum, v_target;
--   end if;
-- 
--   v_n := array_length(v_ids, 1);
-- 
--   update public.bank_statement_lines
--      set status = 'matched',
--          matched_transaction_id = case when v_n = 1 then v_ids[1] else null end,
--          matched_payment_list_id = null,
--          matched_sepa_export_id = null,
--          matched_by = case when v_n = 1 then 'manual:' else 'manual-multi:' end || v_email,
--          matched_at = now(),
--          date_divergence = case when jsonb_array_length(v_kept) > 0 then v_kept else null end
--    where id = v_line.id;
-- 
--   get diagnostics v_rows = row_count;
--   if v_rows <> 1 then
--     raise exception 'A linha do banco não ficou conciliada.';
--   end if;
-- 
--   delete from public.bank_line_transactions where line_id = v_line.id;
--   if v_n > 1 then
--     insert into public.bank_line_transactions (line_id, transaction_id)
--     select v_line.id, x from unnest(v_ids) x;
--   end if;
-- end;
-- $function$;

-- ALTERAÇÃO PREPARADA — não aplicada.
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
  v_group jsonb;
  v_gid uuid;
  v_request uuid;
  v_supplier uuid;
  v_refund_payment public.transaction_payments;
  v_candidate public.transaction_payments;
  v_candidate_count int;
  v_exact_count int;
  v_second_refunds uuid[] := '{}';
begin
  if NOT public.issue335_context_valid() and exists(select 1 from jsonb_array_elements(p_items) i where i->>'mode'='offset') then
    insert into public.issue335_commands(command) values(jsonb_build_object('op','bank','line_id',p_line_id,'items',p_items));
    return;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nada a conciliar: p_items tem de ser um array com pelo menos um item.';
  end if;

  select * into v_line from public.bank_statement_lines where id = p_line_id FOR UPDATE;
  if v_line.id is null then
    raise exception 'Linha do banco inexistente ou sem acesso: %', p_line_id;
  end if;

  v_current := public.current_company_id();
  if v_current is null or v_current <> v_line.company_id then
    raise exception 'A linha do banco pertence a outra empresa (%) — empresa activa %.', v_line.company_id, v_current;
  end if;

  if public.issue335_context_valid() and not exists(select 1 from jsonb_array_elements(p_items) i where i->>'mode'='offset') then
    raise exception 'invalid_operation: executor não pode entrar no ramo legado';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) i where i->>'mode'='offset') then
    if not (public.is_platform_admin(public.issue335_uid()) or public.has_role(public.issue335_uid(),'admin') or public.has_role(public.issue335_uid(),'manager') or public.has_permission(public.issue335_uid(),'manage_bank_reconciliation')) then raise exception 'permission_denied'; end if;
    v_request := (p_items->0->>'request_id')::uuid;
    v_supplier := (p_items->0->>'supplier_id')::uuid;
    if v_line.offset_group_id is not null then
      perform 1 from public.transaction_offset_groups where id=v_line.offset_group_id and request_id=v_request;
      if not found then raise exception 'line_already_matched'; end if;
    elsif v_line.status<>'unmatched' or v_line.matched_transaction_id is not null or v_line.created_transaction_id is not null or exists(select 1 from public.bank_line_transactions where line_id=p_line_id) then
      raise exception 'line_already_matched';
    end if;
    v_group := public._issue335_execute(v_request,v_supplier,p_items,
      jsonb_build_object('account_id',v_line.financial_account_id,'date',coalesce(v_line.value_date,v_line.booking_date),'amount',v_line.amount),
      coalesce(v_line.value_date,v_line.booking_date),null);
    v_gid := (v_group->>'group_id')::uuid;
    if v_group->>'status'<>'applied' then raise exception 'group_not_applied'; end if;
    if v_line.offset_group_id is not null then return; end if;
    insert into public.system_audit_log(entity_type,entity_id,action,changed_by,old_data,new_data,company_id)
      values('bank_statement_line',p_line_id::text,'issue335_attach',public.issue335_uid()::text,to_jsonb(v_line),jsonb_build_object('group_id',v_gid,'transactions',(select jsonb_agg(transaction_id order by transaction_id) from public.transaction_offset_items where group_id=v_gid and cash_amount>0)),v_current);
    update public.transaction_offset_groups set bank_line_id=p_line_id where id=v_gid;
    update public.bank_statement_lines set status='matched',offset_group_id=v_gid,matched_by='offset:'||public.issue335_uid()::text,matched_at=now() where id=p_line_id;
    insert into public.bank_line_transactions(line_id,transaction_id)
      select p_line_id,transaction_id from public.transaction_offset_items where group_id=v_gid and cash_amount>0;
    return;
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
    if v_mode not in ('link', 'settle', 'devolucao') then
      raise exception 'Modo inválido (%) — só "link", "settle" ou "devolucao".', v_mode;
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
    if v_mode = 'devolucao' then
      if v_line.amount <= 0 or v_tx.type <> 'expense' then
        raise exception 'Devolução de pagamento: é necessária uma linha a crédito e uma transação de despesa.';
      end if;
      if v_action is not null then
        raise exception 'Devolução de pagamento: não se pode alinhar ou alterar a data do pagamento original.';
      end if;
      if coalesce(trim(v_line.description), '') = '' then
        raise exception 'Devolução de pagamento: a descrição da linha do banco é obrigatória como motivo do estorno.';
      end if;
    elsif v_tx.type <> v_sign_type then
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
          if exists(select 1 from public.transaction_payments where transaction_id=v_tx_id and offset_group_id is not null and status='paid' and reversed_at is null) then raise exception 'managed_group_date_alignment_forbidden: estorne o encontro inteiro antes de alinhar'; end if;
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

    if v_mode = 'devolucao' then
      -- Só pagamentos efetivamente pagos, ainda não estornados, nesta conta e empresa.
      -- Bloqueia as candidatas antes de decidir; nunca escolhe arbitrariamente uma perna.
      v_candidate_count := 0;
      v_exact_count := 0;
      v_refund_payment := null;
      for v_candidate in
        select tp.* from public.transaction_payments tp
         where tp.transaction_id = v_tx_id
           and tp.company_id = v_current
           and tp.account_id = v_line.financial_account_id
           and tp.status = 'paid'
           and tp.reversed_at is null
           and tp.reversal_kind is null
         order by tp.id
         for update
      loop
        v_candidate_count := v_candidate_count + 1;
        if v_candidate_count = 1 and v_exact_count = 0 then
          v_refund_payment := v_candidate;
        end if;
        if round(v_candidate.amount, 2) = v_amount then
          v_exact_count := v_exact_count + 1;
          v_refund_payment := v_candidate;
        end if;
      end loop;

      if v_candidate_count = 0 then
        raise exception 'A transação % não tem uma perna de pagamento paga e não estornada na conta do extrato.', v_tx_id;
      end if;
      if v_exact_count > 1 or (v_exact_count = 0 and v_candidate_count > 1) then
        raise exception 'Devolução ambígua na transação %: não existe uma única perna de pagamento com o valor integral da devolução. Devoluções parciais não são suportadas nesta versão.', v_tx_id;
      end if;
      if v_refund_payment.offset_group_id is not null then
        raise exception 'A perna de pagamento % pertence a um encontro de compensação (#335). Estorne o encontro inteiro; não é permitida a devolução isolada.', v_refund_payment.id;
      end if;
      if v_amount > round(v_refund_payment.amount, 2) then
        raise exception 'Valor da devolução (%) acima do valor pago nessa perna (%) na transação %.', v_amount, v_refund_payment.amount, v_tx_id;
      end if;
      if v_amount < round(v_refund_payment.amount, 2) then
        raise exception 'Devolução parcial não suportada nesta versão: valor da devolução (%) inferior ao valor pago nessa perna (%) na transação %.', v_amount, v_refund_payment.amount, v_tx_id;
      end if;

      if exists (select 1 from public.transaction_payments tp
                  where tp.transaction_id = v_tx_id and tp.id <> v_refund_payment.id
                    and tp.company_id = v_current and tp.status = 'reversed'
                    and tp.reversal_kind = 'cash_refund') then
        v_second_refunds := v_second_refunds || v_tx_id;
      end if;

      -- Mesmos campos da perna no estorno manual; o trigger deriva a transação.
      update public.transaction_payments
         set status = 'reversed',
             reversal_kind = 'cash_refund',
             reversal_reason = v_line.description,
             reversed_at = now(),
             reversed_by = auth.uid(),
             updated_at = now()
       where id = v_refund_payment.id
         and transaction_id = v_tx_id and company_id = v_current
         and account_id = v_line.financial_account_id
         and status = 'paid' and reversed_at is null and reversal_kind is null
         and offset_group_id is null;
      get diagnostics v_rows = row_count;
      if v_rows <> 1 then
        raise exception 'A perna de pagamento não ficou estornada: inexistente, sem permissão ou alterada entretanto.';
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
  foreach v_tx_id in array v_second_refunds loop
    raise notice 'segunda devolução: a transação % já tem outra perna de pagamento estornada por reembolso em caixa.', v_tx_id;
  end loop;
end;
$function$
;
