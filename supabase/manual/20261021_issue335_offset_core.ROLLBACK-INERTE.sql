-- INERTE: zero-history restoration only. Never apply to Live without separate authorization.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.transaction_offset_groups) THEN RAISE EXCEPTION 'groups_exist_keep_guards'; END IF; IF to_regprocedure('public.issue335_invariant_counts()') IS NOT NULL THEN RAISE EXCEPTION 'rollback_order: invariants_before_core'; END IF; END $$;
DROP TRIGGER IF EXISTS issue335_guard ON public.transaction_offset_groups;
DROP TRIGGER IF EXISTS issue335_guard ON public.transaction_offset_items;
DROP TRIGGER IF EXISTS issue335_guard ON public.transaction_payments;
DROP TRIGGER IF EXISTS issue335_guard ON public.transaction_offsets;
DROP TRIGGER IF EXISTS issue335_guard ON public.transactions;
DROP TRIGGER IF EXISTS issue335_guard ON public.bank_statement_lines;
DROP TRIGGER IF EXISTS issue335_guard ON public.bank_line_transactions;
DROP VIEW IF EXISTS public.issue335_commands;
DROP FUNCTION IF EXISTS public.transaction_offset_execute(uuid,uuid,jsonb,jsonb,date,text);
DROP FUNCTION IF EXISTS public.transaction_offset_reverse(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.issue335_dispatch();
DROP FUNCTION IF EXISTS public._issue335_execute(uuid,uuid,jsonb,jsonb,date,text);
DROP FUNCTION IF EXISTS public._issue335_reverse(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.issue335_guard();
DROP POLICY IF EXISTS issue335_company_membership ON public.user_roles;
DROP POLICY IF EXISTS issue335_control_read ON public.transaction_offset_control;
DROP FUNCTION IF EXISTS public.issue335_uid();
DROP FUNCTION IF EXISTS public.issue335_matching_transactions(uuid);
DROP FUNCTION IF EXISTS public.issue335_score(text,text);
DROP FUNCTION IF EXISTS public.issue335_normalize(text);
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
$function$;
ALTER FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._apply_transaction_offset(p_offset_id uuid, p_origin_payment_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
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
$function$;
ALTER FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._reverse_transaction_offsets_for(p_tx_id uuid) TO sandbox_exec_sfohvvlqccmmebvjgibx;
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
$function$;
ALTER FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(p_line_id uuid, p_items jsonb) TO sandbox_exec_sfohvvlqccmmebvjgibx;
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
$function$;
ALTER FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) TO postgres;
GRANT EXECUTE ON FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_payment(p_payment_id uuid, p_kind text, p_reason text, p_valid_until date, p_amount numeric) TO sandbox_exec_sfohvvlqccmmebvjgibx;
CREATE OR REPLACE FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.reverse_transaction(p_tx_id, p_kind, p_reason, p_valid_until, false);
$function$;
ALTER FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) TO postgres;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date) TO sandbox_exec_sfohvvlqccmmebvjgibx;
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
$function$;
ALTER FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_transaction(p_tx_id uuid, p_kind text, p_reason text, p_valid_until date, p_release_for_repayment boolean) TO sandbox_exec_sfohvvlqccmmebvjgibx;
DROP POLICY IF EXISTS issue335_company_membership ON public.user_roles;
REVOKE SELECT ON public.user_roles FROM issue335_executor;
DROP POLICY IF EXISTS issue335_internal ON public.companies;
DROP POLICY IF EXISTS issue335_internal ON public.suppliers;
DROP POLICY IF EXISTS issue335_internal ON public.events;
DROP POLICY IF EXISTS issue335_internal ON public.financial_accounts;
DROP POLICY IF EXISTS issue335_internal ON public.event_forecasts;
DROP POLICY IF EXISTS issue335_internal ON public.transactions;
DROP POLICY IF EXISTS issue335_internal ON public.transaction_payments;
DROP POLICY IF EXISTS issue335_internal ON public.transaction_offsets;
DROP POLICY IF EXISTS issue335_internal ON public.bank_statement_lines;
DROP POLICY IF EXISTS issue335_internal ON public.bank_line_transactions;
DROP POLICY IF EXISTS issue335_internal ON public.transaction_offset_groups;
DROP POLICY IF EXISTS issue335_internal ON public.transaction_offset_items;
DROP POLICY IF EXISTS issue335_internal ON public.forecast_audit_log;
DROP POLICY IF EXISTS issue335_internal ON public.transaction_audit_log;
DROP POLICY IF EXISTS issue335_internal ON public.system_audit_log;
DROP POLICY IF EXISTS issue335_internal ON public.event_settlements;
REVOKE ALL ON public.transaction_offset_control FROM issue335_executor;
REVOKE ALL ON public.companies,public.suppliers,public.events,public.financial_accounts,public.partner_paid_expenses,public.event_settlements,public.payment_list_items,public.payment_lists,public.payment_list_sepa_exports,public.event_forecasts,public.transactions,public.transaction_payments,public.transaction_offsets,public.bank_statement_lines,public.bank_line_transactions,public.transaction_offset_groups,public.transaction_offset_items,public.forecast_audit_log,public.transaction_audit_log,public.system_audit_log FROM issue335_executor;
REVOKE ALL ON FUNCTION public.can_see_confidential(uuid),public.has_permission(uuid,text),public.is_platform_admin(uuid) FROM issue335_executor;
REVOKE ALL ON FUNCTION public.current_company_id(),public.has_role(uuid,public.app_role),public.bp_tx_link_allowed(uuid,uuid,uuid,uuid),public._derive_paid_amount(uuid) FROM issue335_executor;
REVOKE ALL ON FUNCTION public.reconcile_bank_line(uuid,jsonb) FROM issue335_executor;
REVOKE ALL ON SCHEMA public FROM issue335_executor;
DROP ROLE issue335_executor;
-- Restore the exact Live ACL of shared helpers that the core granted to the executor (catalog snapshot).
REVOKE ALL ON FUNCTION public._derive_paid_amount(uuid),public.bp_tx_link_allowed(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._derive_paid_amount(uuid),public.bp_tx_link_allowed(uuid,uuid,uuid,uuid) TO service_role,sandbox_exec_sfohvvlqccmmebvjgibx;
COMMIT;
