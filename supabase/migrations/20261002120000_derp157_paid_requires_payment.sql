-- D-ERP157 (02/10/2026): paid_amount nunca sem linha de pagamento.
-- 1) Trava + materialização na base para todos os caminhos.
-- 2) launch_from_bank_lines cria a transação 'approved' + pagamento.
-- 3) Invariante paid_sem_pagamento.

CREATE OR REPLACE FUNCTION public._paid_guard_is_exempt(p public.transactions)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(p.is_reimbursement, false)
      OR (p.parent_transaction_id IS NOT NULL AND p.split_percentage IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.partner_paid_expenses e WHERE e.transaction_id = p.id);
$$;
REVOKE ALL ON FUNCTION public._paid_guard_is_exempt(public.transactions) FROM PUBLIC, anon, authenticated;

-- BEFORE UPDATE: recusa baixar paid_amount abaixo da soma dos pagamentos vivos
-- por escrita directa. Subir (ou INSERT) é aceite e materializado no AFTER.
CREATE OR REPLACE FUNCTION public.guard_paid_amount_vs_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sum numeric;
BEGIN
  IF TG_OP <> 'UPDATE' OR NEW.paid_amount IS NOT DISTINCT FROM OLD.paid_amount THEN
    RETURN NEW;
  END IF;
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

-- AFTER INSERT/UPDATE: se paid_amount ficou acima da soma, cria a linha em falta;
-- se ficou abaixo (só escritas internas de triggers, ex. espelhos), estorna as
-- linhas criadas pela base e recria pelo valor certo. Depois deriva (D-ERP86).
CREATE OR REPLACE FUNCTION public.materialize_paid_amount_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sum numeric; v_diff numeric; v_method text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.paid_amount IS NOT DISTINCT FROM OLD.paid_amount THEN
    RETURN NULL;
  END IF;
  IF COALESCE(NEW.paid_amount, 0) <= 0.01 AND TG_OP = 'INSERT' THEN RETURN NULL; END IF;
  IF public._paid_guard_is_exempt(NEW) THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM public.transaction_payments
   WHERE transaction_id = NEW.id AND status = 'paid';
  v_diff := round(COALESCE(NEW.paid_amount, 0) - v_sum, 2);
  IF abs(v_diff) <= 0.01 THEN RETURN NULL; END IF;

  IF v_diff < 0 THEN
    UPDATE public.transaction_payments
       SET status = 'reversed', reversed_at = now(),
           reversal_reason = 'reajuste automático do valor pago (D-ERP157)'
     WHERE transaction_id = NEW.id AND status = 'paid'
       AND created_by = 'base D-ERP157';
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
       'Criado pela base: a transação foi gravada com valor pago sem linha de pagamento ('
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

    -- D-ERP157: a transação nasce 'approved' sem valor pago; o pagamento nasce
    -- em transaction_payments e paid_amount/estado ficam a cargo do sync (D-ERP86).
    v_was_paid := (v_tx ->> 'status') = 'paid'
                  OR COALESCE(NULLIF(v_tx ->> 'paid_amount', '')::numeric, 0) > 0.01;
    v_pay_amount := NULLIF(COALESCE(NULLIF(v_tx ->> 'paid_amount', '')::numeric, 0), 0);
    v_pay_method := NULLIF(v_tx ->> 'payment_method', '');
    v_tx := v_tx - 'paid_amount' - 'payment_date';
    IF (v_tx ->> 'status') = 'paid' THEN
      v_tx := jsonb_set(v_tx, '{status}', '"approved"');
    END IF;

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
  'D-ERP157. Origem: Lançar do banco e escritas directas de paid_amount. A base materializa a linha; isto tem de ficar a 0.')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, scope = EXCLUDED.scope;

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
  cZ bigint; sZ jsonb;
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
     WHERE l.status = 'pending'
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
  )
  SELECT count(*),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
                     SELECT esquema, tabela, linhas FROM grandes
                      ORDER BY linhas DESC LIMIT 6) x), '[]'::jsonb)
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
  -- D-ERP157: transação não isenta com valor pago e SEM nenhuma linha de pagamento viva.
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
