-- #333 fase12f — base canónica para prova PG descartável. Gerada por SELECT só-leitura (pg_get_functiondef/pg_get_triggerdef/
-- information_schema) às funções, tabelas, constraints, índices e triggers reais do projeto (20/10/2026). Sem dados.
-- md5(prosrc) por função listado em canon12f-functions.md5.txt. FKs omitidas (apenas p/u/c); RLS não reproduzida (executor é SECURITY DEFINER do dono).
DO $$ BEGIN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE sandbox_exec; CREATE ROLE sandbox_exec_x; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO sandbox_exec, sandbox_exec_x;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role, sandbox_exec_x;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, sandbox_exec, sandbox_exec_x;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SET check_function_bodies = off;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, deleted_at timestamptz, banned_until timestamptz);
CREATE TYPE public.app_role AS ENUM ('admin','user','viewer','partner','marketing_manager','editor','manager','platform_admin','field_producer','producer','content_manager','accountant');
CREATE TYPE public.bp_formalidade AS ENUM ('estimado','negociacao','fechado','pago_parcial','pago_total');
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
-- 1.ª passagem de funções (defaults das tabelas usam current_company_id/auth.uid); 2.ª após as tabelas.
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
$function$;
-- _paid_guard_is_exempt(transactions) só na 2.ª passagem (depende do tipo de linha)
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
CREATE OR REPLACE FUNCTION public.account_has_balance_for(_account_id uuid, _amount numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_skip boolean;
  v_company uuid;
  v_balance numeric;
BEGIN
  SELECT skip_balance_check, company_id INTO v_skip, v_company
  FROM public.financial_accounts WHERE id = _account_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Isenção deliberada: auth.uid() IS NULL = service_role/crons/edge functions.
  IF v_uid IS NOT NULL
     AND NOT public.is_platform_admin(v_uid)
     AND v_company IS DISTINCT FROM public.current_company_id() THEN
    RETURN false;
  END IF;

  IF COALESCE(v_skip, false) THEN
    RETURN true;
  END IF;

  v_balance := public._account_true_balance_raw(_account_id);
  RETURN COALESCE(_amount, 0) <= COALESCE(v_balance, 0);
END;
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.confirm_ticket_office_statement(p_statement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record; v_sum numeric; v_pending int;
BEGIN
  SELECT * INTO s FROM public.ticket_office_statements WHERE id = p_statement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apuramento não encontrado.'; END IF;
  IF NOT public.row_belongs_to_current_company(s.company_id) THEN RAISE EXCEPTION 'Sem acesso a este apuramento.'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Só admin ou manager confirmam apuramentos.';
  END IF;
  IF s.status = 'confirmed' THEN RAISE EXCEPTION 'Apuramento já confirmado.'; END IF;
  IF s.document_total IS NULL THEN RAISE EXCEPTION 'Falta o total do documento.'; END IF;
  SELECT count(*) FILTER (WHERE pending_document), COALESCE(sum(amount),0)
    INTO v_pending, v_sum FROM public.ticket_office_statement_lines WHERE statement_id = p_statement_id;
  IF v_pending > 0 THEN RAISE EXCEPTION 'Há % linha(s) pendente(s) de documento.', v_pending; END IF;
  IF abs(round(v_sum,2) - s.document_total) > 0.004 THEN
    RAISE EXCEPTION 'Σ linhas (%) ≠ total do documento (%).', round(v_sum,2), s.document_total;
  END IF;
  UPDATE public.ticket_office_statements SET status='confirmed', confirmed_at=now(), confirmed_by=auth.uid(), updated_at=now()
   WHERE id = p_statement_id;
END $function$;
CREATE OR REPLACE FUNCTION public.create_settlement_transfer(p_settlement_id uuid, p_from_account_id uuid, p_to_account_id uuid, p_amount numeric, p_date date, p_credited boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_settlement record;
  v_from_name text;
  v_to_name text;
  v_key text;
  v_desc text;
  v_out uuid;
  v_status text;
  v_paid numeric;
  v_pay_date date;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT (
      public.has_role(auth.uid(), 'admin')
      OR public.is_platform_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'manage_accounts')
    ) THEN
      RAISE EXCEPTION 'Sem permissão para lançar a transferência do fecho' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa activa não resolvida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settlement FROM public.ticket_office_settlements WHERE id = p_settlement_id;

  IF v_settlement.id IS NULL THEN
    RAISE EXCEPTION 'Fecho não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_settlement.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Fecho de outra empresa' USING ERRCODE = '42501';
  END IF;
  IF v_settlement.transfer_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este fecho já tem transferência lançada' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Valor da transferência tem de ser positivo' USING ERRCODE = '22023';
  END IF;
  IF p_from_account_id IS NULL OR p_to_account_id IS NULL THEN
    RAISE EXCEPTION 'Contas de origem e destino são obrigatórias' USING ERRCODE = '22023';
  END IF;
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Conta de origem e destino não podem ser a mesma' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_from_name FROM public.financial_accounts WHERE id = p_from_account_id;
  SELECT name INTO v_to_name FROM public.financial_accounts WHERE id = p_to_account_id;

  v_key := 'TRF-FECHO-' || upper(substring(replace(p_settlement_id::text, '-', '') FROM 1 FOR 8));
  v_desc := 'Transferência fecho bilheteira ' || coalesce(v_from_name, '?')
            || ' -> ' || coalesce(v_to_name, '?')
            || CASE WHEN p_credited THEN '' ELSE ' (a receber)' END;

  IF p_credited THEN
    v_status := 'paid'; v_paid := p_amount; v_pay_date := p_date;
  ELSE
    v_status := 'pending'; v_paid := 0; v_pay_date := NULL;
  END IF;

  INSERT INTO public.transactions (
    company_id, event_id, type, category_id, description, amount, iva_rate, date,
    status, paid_amount, payment_date, account_id, payment_method,
    exclude_from_result, currency, settlement_id, operation_key
  ) VALUES (
    v_company, v_settlement.event_id, 'expense', 'b32df086-c995-4747-a3f9-bfefa0063d0a',
    v_desc, p_amount, 0, p_date,
    v_status, v_paid, v_pay_date, p_from_account_id, 'transfer',
    true, 'EUR', p_settlement_id, v_key
  ) RETURNING id INTO v_out;

  INSERT INTO public.transactions (
    company_id, event_id, type, category_id, description, amount, iva_rate, date,
    status, paid_amount, payment_date, account_id, payment_method,
    exclude_from_result, currency, settlement_id, operation_key
  ) VALUES (
    v_company, v_settlement.event_id, 'income', 'b32df086-c995-4747-a3f9-bfefa0063d0a',
    v_desc, p_amount, 0, p_date,
    v_status, v_paid, v_pay_date, p_to_account_id, 'transfer',
    true, 'EUR', NULL, v_key
  );

  UPDATE public.ticket_office_settlements
  SET transfer_transaction_id = v_out,
      net_transferred = p_amount,
      transfer_account_id = p_to_account_id
  WHERE id = p_settlement_id;

  RETURN v_out;
END;
$function$;
CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_active uuid;
  v_company uuid;
  v_is_pa boolean;
  v_has_active_membership boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT active_company_id, company_id INTO v_active, v_company
    FROM public.profiles WHERE id = v_uid;

  SELECT EXISTS(SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role = 'platform_admin'::app_role) INTO v_is_pa;

  -- 1) active_company_id válido (platform_admin OU user tem membership lá)
  IF v_active IS NOT NULL THEN
    IF v_is_pa THEN
      RETURN v_active;
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.user_roles
      WHERE user_id = v_uid AND company_id = v_active) INTO v_has_active_membership;
    IF v_has_active_membership THEN RETURN v_active; END IF;
  END IF;

  -- 2) fallback: profiles.company_id se ainda tem membership lá
  IF v_company IS NOT NULL THEN
    IF v_is_pa OR EXISTS(SELECT 1 FROM public.user_roles
        WHERE user_id = v_uid AND company_id = v_company) THEN
      RETURN v_company;
    END IF;
  END IF;

  -- 3) fallback: primeira empresa onde tem membership
  RETURN (SELECT ur.company_id FROM public.user_roles ur
    JOIN public.companies c ON c.id = ur.company_id
    WHERE ur.user_id = v_uid AND c.status='active'
    ORDER BY ur.id LIMIT 1);
END;
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
END $function$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
        AND (
          _role = 'platform_admin'::app_role
          OR company_id = public.current_company_id()
        )
    )
$function$;
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
END $function$;
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
end $function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.row_belongs_to_current_company(_row_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_platform_admin()
    OR _row_company_id IS NULL
    OR _row_company_id = public.current_company_id()
$function$;
CREATE OR REPLACE FUNCTION public.save_ticket_office_settlement(p_settlement_id uuid, p_payload jsonb, p_confirm boolean, p_selected jsonb, p_transfer jsonb, p_retained_payment_notes text, p_remainder_payment_notes text, p_audit_user text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_id uuid;
  v_prev public.ticket_office_settlements%ROWTYPE;
  v_has_prev boolean := false;
  v_office uuid := (p_payload->>'financial_account_id')::uuid;
  v_event uuid := nullif(p_payload->>'event_id','')::uuid;
  v_date date := (p_payload->>'settlement_date')::date;
  v_ids uuid[];
  v_ret_amt numeric := coalesce((p_payload->>'venue_retained_amount')::numeric, 0);
  v_inv uuid := nullif(p_payload->>'venue_retained_invoice_id','')::uuid;
  v_rem_applied boolean := coalesce((p_payload->>'venue_invoice_remainder_paid')::boolean, false);
  v_rem_amt numeric := coalesce((p_payload->>'venue_invoice_remainder_amount')::numeric, 0);
  v_need_rev boolean;
  v_need_rev_rem boolean;
  v_tx record;
  v_pay uuid;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.is_platform_admin(v_uid)
          OR public.has_permission(v_uid, 'manage_accounts')) THEN
    RAISE EXCEPTION 'Sem permissão para gravar o fecho de bilheteira' USING ERRCODE = '42501';
  END IF;
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa activa não resolvida' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = v_office AND company_id = v_company) THEN
    RAISE EXCEPTION 'Bilheteira de outra empresa' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg((x->>'id')::uuid), '{}') INTO v_ids FROM jsonb_array_elements(coalesce(p_selected,'[]'::jsonb)) x;
  IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = ANY(v_ids) AND t.company_id IS DISTINCT FROM v_company) THEN
    RAISE EXCEPTION 'Dedução de outra empresa' USING ERRCODE = '42501';
  END IF;
  IF v_inv IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = v_inv AND company_id = v_company) THEN
    RAISE EXCEPTION 'Fatura de outra empresa' USING ERRCODE = '42501';
  END IF;

  IF p_settlement_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.ticket_office_settlements WHERE id = p_settlement_id FOR UPDATE;
    IF v_prev.id IS NULL OR v_prev.company_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION 'Fecho não encontrado nesta empresa' USING ERRCODE = '42501';
    END IF;
    v_has_prev := true;
    v_id := p_settlement_id;
    UPDATE public.ticket_office_settlements SET
      financial_account_id = v_office, event_id = v_event, settlement_date = v_date,
      gross_revenue = (p_payload->>'gross_revenue')::numeric,
      total_deductions = (p_payload->>'total_deductions')::numeric,
      net_calculated = (p_payload->>'net_calculated')::numeric,
      net_adjusted = nullif(p_payload->>'net_adjusted','')::numeric,
      adjustment_notes = p_payload->>'adjustment_notes',
      gross_adjustment_notes = p_payload->>'gross_adjustment_notes',
      forma_liquidacao_manual = p_payload->>'forma_liquidacao_manual',
      forma_liquidacao_manual_notes = p_payload->>'forma_liquidacao_manual_notes',
      net_transferred = coalesce((p_payload->>'net_transferred')::numeric, 0),
      transfer_account_id = nullif(p_payload->>'transfer_account_id','')::uuid,
      document_url = p_payload->>'document_url',
      document_name = p_payload->>'document_name',
      notes = p_payload->>'notes',
      venue_retained_amount = v_ret_amt,
      venue_retained_invoice_id = v_inv,
      venue_retained_notes = p_payload->>'venue_retained_notes',
      venue_invoice_remainder_paid = v_rem_applied,
      venue_invoice_remainder_amount = v_rem_amt,
      status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'draft' END,
      closed_at = CASE WHEN p_confirm THEN now() ELSE closed_at END,
      closed_by = CASE WHEN p_confirm THEN v_uid ELSE closed_by END
    WHERE id = v_id;
  ELSE
    INSERT INTO public.ticket_office_settlements (
      company_id, financial_account_id, event_id, settlement_date, gross_revenue, total_deductions,
      net_calculated, net_adjusted, adjustment_notes, gross_adjustment_notes,
      forma_liquidacao_manual, forma_liquidacao_manual_notes, net_transferred, transfer_account_id,
      document_url, document_name, notes, venue_retained_amount, venue_retained_invoice_id,
      venue_retained_notes, venue_invoice_remainder_paid, venue_invoice_remainder_amount,
      status, closed_at, closed_by, created_by
    ) VALUES (
      v_company, v_office, v_event, v_date, (p_payload->>'gross_revenue')::numeric,
      (p_payload->>'total_deductions')::numeric, (p_payload->>'net_calculated')::numeric,
      nullif(p_payload->>'net_adjusted','')::numeric, p_payload->>'adjustment_notes',
      p_payload->>'gross_adjustment_notes', p_payload->>'forma_liquidacao_manual',
      p_payload->>'forma_liquidacao_manual_notes', coalesce((p_payload->>'net_transferred')::numeric, 0),
      nullif(p_payload->>'transfer_account_id','')::uuid, p_payload->>'document_url',
      p_payload->>'document_name', p_payload->>'notes', v_ret_amt, v_inv,
      p_payload->>'venue_retained_notes', v_rem_applied, v_rem_amt,
      CASE WHEN p_confirm THEN 'confirmed' ELSE 'draft' END,
      CASE WHEN p_confirm THEN now() END, CASE WHEN p_confirm THEN v_uid END, v_uid
    ) RETURNING id INTO v_id;
  END IF;

  IF p_confirm AND p_transfer IS NOT NULL AND coalesce((p_transfer->>'amount')::numeric,0) > 0
     AND NOT (v_has_prev AND v_prev.transfer_transaction_id IS NOT NULL) THEN
    PERFORM public.create_settlement_transfer(v_id, v_office, (p_transfer->>'to_account_id')::uuid,
      (p_transfer->>'amount')::numeric, v_date, coalesce((p_transfer->>'credited')::boolean, false));
  END IF;

  IF v_has_prev THEN
    UPDATE public.transactions t SET settlement_id = NULL
     WHERE t.settlement_id = v_id
       AND NOT (t.id = ANY(v_ids))
       AND t.id IS DISTINCT FROM (SELECT transfer_transaction_id FROM public.ticket_office_settlements WHERE id = v_id)
       AND coalesce(t.operation_key,'') NOT LIKE 'TRF-FECHO-%';
  END IF;

  IF array_length(v_ids,1) > 0 THEN
    IF p_confirm THEN
      FOR r IN SELECT (x->>'id')::uuid AS id, (x->>'paid_amount')::numeric AS paid
                 FROM jsonb_array_elements(p_selected) x LOOP
        IF r.paid IS NULL THEN
          UPDATE public.transactions SET settlement_id = v_id WHERE id = r.id;
          CONTINUE;
        END IF;
        SELECT id, reversed_at INTO v_tx FROM public.transactions WHERE id = r.id FOR UPDATE;
        IF v_tx.id IS NULL THEN RAISE EXCEPTION 'Dedução % não encontrada', r.id; END IF;
        UPDATE public.transactions SET settlement_id = v_id, status = 'paid', payment_date = v_date,
               account_id = v_office, paid_amount = r.paid,
               reversed_at = CASE WHEN v_tx.reversed_at IS NOT NULL THEN NULL ELSE reversed_at END,
               reversal_kind = CASE WHEN v_tx.reversed_at IS NOT NULL THEN NULL ELSE reversal_kind END
         WHERE id = r.id;
        IF v_tx.reversed_at IS NOT NULL THEN
          INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value)
          VALUES (r.id, p_audit_user, 'Estorno', 'Estornada em ' || to_char(v_tx.reversed_at, 'YYYY-MM-DD'),
                  'Carimbo de estorno limpo — transação voltou a ser paga');
        END IF;
      END LOOP;
    ELSE
      UPDATE public.transactions SET settlement_id = v_id WHERE id = ANY(v_ids);
    END IF;
  END IF;

  v_need_rev := v_has_prev AND v_prev.venue_retained_payment_id IS NOT NULL AND (
    NOT p_confirm OR v_inv IS NULL OR v_inv IS DISTINCT FROM v_prev.venue_retained_invoice_id
    OR abs(v_ret_amt - coalesce(v_prev.venue_retained_amount,0)) > 0.005);
  IF v_need_rev THEN
    DELETE FROM public.transaction_payments WHERE id = v_prev.venue_retained_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento de compensação anterior não encontrado'; END IF;
    UPDATE public.ticket_office_settlements SET venue_retained_payment_id = NULL WHERE id = v_id;
  END IF;

  IF p_confirm AND v_ret_amt > 0 AND v_inv IS NOT NULL
     AND (v_need_rev OR NOT v_has_prev OR v_prev.venue_retained_payment_id IS NULL) THEN
    INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, payment_method, account_id, notes, created_by)
    VALUES (v_inv, v_ret_amt, v_date, 'compensation', NULL, p_retained_payment_notes, p_audit_user)
    RETURNING id INTO v_pay;
    UPDATE public.ticket_office_settlements SET venue_retained_payment_id = v_pay WHERE id = v_id;
  END IF;

  v_need_rev_rem := v_has_prev AND v_prev.venue_invoice_remainder_payment_id IS NOT NULL AND (
    NOT p_confirm OR NOT v_rem_applied OR v_inv IS NULL
    OR v_inv IS DISTINCT FROM v_prev.venue_retained_invoice_id
    OR abs(v_rem_amt - coalesce(v_prev.venue_invoice_remainder_amount,0)) > 0.005);
  IF v_need_rev_rem THEN
    DELETE FROM public.transaction_payments WHERE id = v_prev.venue_invoice_remainder_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento do saldo restante anterior não encontrado'; END IF;
    UPDATE public.ticket_office_settlements SET venue_invoice_remainder_payment_id = NULL WHERE id = v_id;
  END IF;

  IF p_confirm AND v_rem_applied AND v_inv IS NOT NULL
     AND (v_need_rev_rem OR NOT v_has_prev OR v_prev.venue_invoice_remainder_payment_id IS NULL) THEN
    INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, payment_method, account_id, notes, created_by)
    VALUES (v_inv, v_rem_amt, v_date, 'transfer', v_office, p_remainder_payment_notes, p_audit_user)
    RETURNING id INTO v_pay;
    UPDATE public.ticket_office_settlements SET venue_invoice_remainder_payment_id = v_pay WHERE id = v_id;
  END IF;

  IF p_confirm AND v_event IS NOT NULL THEN
    UPDATE public.event_ticket_office_assignments
       SET is_conciliated = true, conciliated_at = now(), conciliated_by = coalesce(nullif(p_payload->>'conciliated_by',''), 'system')
     WHERE event_id = v_event AND financial_account_id = v_office;
  END IF;

  RETURN jsonb_build_object('settlement_id', v_id);
END;
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.tosl_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_company uuid;
BEGIN
  SELECT status, company_id INTO v_status, v_company FROM public.ticket_office_statements
   WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
  IF v_status = 'confirmed' THEN
    RAISE EXCEPTION 'Apuramento Ticketline confirmado: as linhas não se alteram.';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'A linha tem de ser da mesma empresa do apuramento.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
END $function$;
CREATE OR REPLACE FUNCTION public._assert_row_company(_company_id uuid, _ctx text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
BEGIN
  IF auth.uid() IS NULL THEN
    IF v_role = 'anon' THEN
      RAISE EXCEPTION '%: sessão anónima sem acesso', _ctx USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  IF public.is_platform_admin() THEN RETURN; END IF;
  IF _company_id IS NULL OR _company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION '%: a linha não pertence à empresa activa', _ctx USING ERRCODE = '42501';
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public._effective_permissions_for(_user_id uuid, _company_id uuid, _universe text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pa boolean := public.is_platform_admin(_user_id);
  v_roles text[];
  v_role text;
  v_full boolean;
  v_perms text[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('role', NULL, 'permissions', '[]'::jsonb);
  END IF;

  SELECT array_agg(DISTINCT role::text) INTO v_roles
    FROM public.user_roles
   WHERE user_id = _user_id
     AND (company_id = _company_id OR role = 'platform_admin'::app_role);

  SELECT r INTO v_role FROM unnest(coalesce(v_roles, '{}')) r
   ORDER BY CASE r WHEN 'platform_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2
     WHEN 'accountant' THEN 3 WHEN 'marketing_manager' THEN 4 WHEN 'content_manager' THEN 4
     WHEN 'editor' THEN 4 WHEN 'producer' THEN 4 WHEN 'field_producer' THEN 4
     WHEN 'partner' THEN 5 WHEN 'viewer' THEN 6 WHEN 'user' THEN 7 ELSE 99 END, r
   LIMIT 1;

  v_full := v_pa OR 'admin' = ANY(coalesce(v_roles, '{}'));

  WITH base AS (
    SELECT unnest(coalesce(_universe, '{}')) k WHERE v_full
    UNION SELECT permission FROM public.role_permissions WHERE v_pa
    UNION SELECT rp.permission FROM public.role_permissions rp
      WHERE rp.role::text = ANY(coalesce(v_roles, '{}'))
  ),
  ov AS (
    SELECT permission k, bool_and(granted) g FROM public.user_permissions
     WHERE user_id = _user_id AND company_id = _company_id GROUP BY 1
  ),
  eff AS (
    SELECT b.k FROM base b LEFT JOIN ov ON ov.k = b.k WHERE ov.g IS NULL OR ov.g
    UNION SELECT k FROM ov WHERE g
  )
  SELECT array_agg(k ORDER BY k) INTO v_perms FROM eff;

  RETURN jsonb_build_object(
    'role', coalesce(v_role, 'user'),
    'company_id', _company_id,
    'permissions', to_jsonb(coalesce(v_perms, '{}'))
  );
END;
$function$;
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
$function$;
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
END $function$;
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
END $function$;
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT granted FROM public.user_permissions
       WHERE user_id = _user_id AND permission = _permission
         AND company_id = public.current_company_id()
       LIMIT 1),
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission = _permission
        AND ur.company_id = public.current_company_id()
    )
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'platform_admin'::app_role
  )
$function$;
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
$function$;
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
END $function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.reverse_ticket_office_settlement(p_settlement_id uuid, p_reason text, p_caller_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_s record;
  v_key text;
  v_exp uuid[];
  v_n int;
  v_counts jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão em falta' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Só um admin pode estornar um fecho de bilheteira.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Motivo do estorno obrigatório' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_s FROM ticket_office_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fecho não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.row_belongs_to_current_company(v_s.company_id) THEN RAISE EXCEPTION 'Fecho de outra empresa' USING ERRCODE = '42501'; END IF;
  IF v_s.status = 'reversed' THEN RAISE EXCEPTION 'Fecho já estornado' USING ERRCODE = 'P0001'; END IF;

  IF v_s.transfer_transaction_id IS NOT NULL THEN
    SELECT operation_key INTO v_key FROM transactions WHERE id = v_s.transfer_transaction_id;
    UPDATE ticket_office_settlements SET transfer_transaction_id = NULL WHERE id = p_settlement_id;
    IF v_key IS NOT NULL THEN
      DELETE FROM transactions WHERE operation_key = v_key;
    ELSE
      DELETE FROM transactions WHERE id = v_s.transfer_transaction_id;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('transfer_legs', v_n);
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_exp FROM transactions WHERE settlement_id = p_settlement_id AND type = 'expense';
  DELETE FROM transaction_payments WHERE transaction_id = ANY(v_exp);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('payments', v_n);
  UPDATE transactions SET settlement_id = NULL, status = 'pending', payment_date = NULL, paid_amount = 0, account_id = NULL
   WHERE id = ANY(v_exp);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('expenses', v_n);

  UPDATE event_ticket_office_advances SET settlement_id = NULL WHERE settlement_id = p_settlement_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('advances', v_n);

  UPDATE ticket_office_settlements SET status = 'reversed', reversed_at = now(), reversed_by = v_uid,
         reversal_reason = p_reason, transfer_transaction_id = NULL, net_transferred = 0, transfer_account_id = NULL
   WHERE id = p_settlement_id;

  UPDATE event_ticket_office_assignments SET is_conciliated = false, conciliated_at = NULL, conciliated_by = NULL
   WHERE event_id = v_s.event_id AND financial_account_id = v_s.financial_account_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('assignments', v_n);

  INSERT INTO system_audit_log (entity_type, entity_id, action, changed_by, metadata, company_id)
  VALUES ('ticket_office_settlement', p_settlement_id::text, 'reverse', coalesce(nullif(trim(p_caller_name), ''), v_uid::text),
          jsonb_build_object('reason', p_reason, 'counts', v_counts), v_s.company_id);

  RETURN jsonb_build_object('settlement_id', p_settlement_id, 'counts', v_counts);
END $function$;
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
$function$;
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
END $function$;
CREATE TABLE public.account_categories (id uuid NOT NULL DEFAULT gen_random_uuid(), code text NOT NULL, name text NOT NULL, type text NOT NULL, parent_id uuid, is_active boolean NOT NULL DEFAULT true, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), event_required boolean NOT NULL DEFAULT true, company_id uuid NOT NULL DEFAULT current_company_id(), allocate_to_active_event boolean NOT NULL DEFAULT false, ebitda_class text);
CREATE TABLE public.events (id uuid NOT NULL DEFAULT gen_random_uuid(), name text NOT NULL, date date NOT NULL, location text, status text NOT NULL DEFAULT 'planning'::text, budget numeric NOT NULL DEFAULT 0, tickets_sold integer NOT NULL DEFAULT 0, tickets_total integer NOT NULL DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), event_type text NOT NULL DEFAULT 'simple'::text, parent_event_id uuid, city_id uuid, venue_id uuid, pl_mode text NOT NULL DEFAULT 'passive'::text, partner_calc_basis text NOT NULL DEFAULT 'net_result'::text, last_sales_date date, company_id uuid NOT NULL DEFAULT current_company_id(), absorbs_admin_costs boolean NOT NULL DEFAULT false, admin_window_end date, admin_window_start date, import_template text, ticketing_url text, ticketing_provider text, operacao_mode text DEFAULT 'planning'::text, ticketline_event_id text, description_en text, description_pt text, hero_image_url text, location_en text, location_pt text, meta_pixel_id text, portal_featured boolean NOT NULL DEFAULT false, portal_visible boolean NOT NULL DEFAULT false, poster_image_url text, slug text, title_en text, title_pt text, venue_directions_url text, venue_map_url text, management_type text NOT NULL DEFAULT 'own'::text, partner_name text, vip_coupon_code text, vip_coupon_discount_label text, vip_coupon_valid_until timestamp with time zone, meta_audience_id text, meta_audience_name text, ad_destination_url text, target_roas numeric, format text, title_es text, description_es text, location_es text, budget_mode text, ticketing_baseline_net numeric, ticketing_baseline_at timestamp with time zone, ab_baseline_net numeric, ab_baseline_at timestamp with time zone, sponsorship_closed_at timestamp with time zone, ads_allocation_level text NOT NULL DEFAULT 'tour'::text, ads_match_aliases text[] NOT NULL DEFAULT '{}'::text[], cost_expense_source text NOT NULL DEFAULT 'committed'::text, cost_include_overhead boolean NOT NULL DEFAULT true, event_nature text NOT NULL);
CREATE TABLE public.transactions (id uuid NOT NULL DEFAULT gen_random_uuid(), event_id uuid, type text NOT NULL, category_id uuid, description text NOT NULL, amount numeric NOT NULL, iva_rate integer NOT NULL DEFAULT 23, date date NOT NULL, status text NOT NULL DEFAULT 'pending'::text, supplier_id uuid, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), paid_amount numeric NOT NULL DEFAULT 0, due_date date, specification text, account_id uuid, payment_date date, invoice_ref text, pl_override_note text, parent_transaction_id uuid, split_percentage numeric, is_reimbursement boolean NOT NULL DEFAULT false, reimbursement_to text, is_hidden boolean NOT NULL DEFAULT false, exclude_from_result boolean NOT NULL DEFAULT false, is_transitory boolean NOT NULL DEFAULT false, payment_entity text, payment_method text NOT NULL DEFAULT 'transfer'::text, payment_reference text, split_amount numeric, split_mode text DEFAULT 'percentage'::text, settlement_id uuid, currency text NOT NULL DEFAULT 'EUR'::text, fx_rate numeric, fx_rate_source text, original_amount numeric, invoice_group_id uuid, declared_withholding_amount numeric, declared_withholding_rate numeric, company_id uuid NOT NULL DEFAULT current_company_id(), iban_override text, reversal_kind text, reversal_reason text, reversed_at timestamp with time zone, reversed_by uuid, supplier_credit_id uuid, card_session_id uuid, ordering_partner_id uuid, paying_partner_id uuid, forecast_id uuid, installment_group_id uuid, installment_number integer, installment_total integer, is_confidential boolean NOT NULL DEFAULT false, operation_key text, event_settlement_id uuid, held_by_supplier_id uuid, shared_cost_account_id uuid, shared_cost_counterparty_id uuid, transitory_reason text);
CREATE TABLE public.transaction_audit_log (id uuid NOT NULL DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL, changed_by text NOT NULL DEFAULT 'system'::text, changed_at timestamp with time zone NOT NULL DEFAULT now(), field_name text NOT NULL, old_value text, new_value text, company_id uuid NOT NULL DEFAULT current_company_id());
CREATE TABLE public.profiles (id uuid NOT NULL, full_name text NOT NULL DEFAULT ''::text, email text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), company_id uuid DEFAULT current_company_id(), active_company_id uuid, archived_at timestamp with time zone, phone text, profile_type text NOT NULL DEFAULT 'user'::text, whatsapp_phone text, first_access_consumed_at timestamp with time zone, first_access_token uuid, is_operacao_only boolean NOT NULL DEFAULT false, linked_supplier_id uuid);
CREATE TABLE public.user_roles (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role app_role NOT NULL, company_id uuid NOT NULL DEFAULT current_company_id());
CREATE TABLE public.payment_list_items (id uuid NOT NULL DEFAULT gen_random_uuid(), payment_list_id uuid NOT NULL, transaction_id uuid NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now(), manually_marked_paid boolean NOT NULL DEFAULT false, company_id uuid NOT NULL DEFAULT current_company_id(), removed_at timestamp with time zone, removed_by text, removed_reason text);
CREATE TABLE public.event_forecasts (id uuid NOT NULL DEFAULT gen_random_uuid(), event_id uuid NOT NULL, category_id uuid, type text NOT NULL, description text NOT NULL, amount numeric NOT NULL DEFAULT 0, iva_rate integer NOT NULL DEFAULT 23, notes text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'draft'::text, approved_at timestamp with time zone, approved_by text, transaction_id uuid, specification text, formula_type text NOT NULL DEFAULT 'fixed'::text, formula_value numeric NOT NULL DEFAULT 0, cache_config_id uuid, exclude_from_result boolean NOT NULL DEFAULT false, is_transitory boolean NOT NULL DEFAULT false, master_forecast_id uuid, attachment_refs jsonb NOT NULL DEFAULT '[]'::jsonb, currency text NOT NULL DEFAULT 'EUR'::text, fx_rate numeric, fx_rate_source text, original_amount numeric, invoice_group_id uuid, is_overhead boolean NOT NULL DEFAULT false, formalidade bp_formalidade NOT NULL DEFAULT 'estimado'::bp_formalidade, formalidade_changed_at timestamp with time zone, formalidade_changed_by uuid, historic_overrides jsonb NOT NULL DEFAULT '[]'::jsonb, is_retroactive_override boolean NOT NULL DEFAULT false, version_id uuid, company_id uuid NOT NULL DEFAULT current_company_id(), ordering_partner_id uuid, paying_partner_id uuid, baseline_amount numeric, event_settlement_id uuid, addback_settlement_id uuid, addback_reason text, vat_non_recoverable boolean NOT NULL DEFAULT false, formula_params jsonb);
CREATE TABLE public.financial_accounts (id uuid NOT NULL DEFAULT gen_random_uuid(), name text NOT NULL, type text NOT NULL DEFAULT 'bank'::text, description text, initial_balance numeric NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, balance_visible_to_all boolean NOT NULL DEFAULT false, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), iban text, card_number text, skip_balance_check boolean NOT NULL DEFAULT false, contact_name text, email_contact text, phone text, withholds_revenue boolean NOT NULL DEFAULT false, is_hidden boolean NOT NULL DEFAULT false, company_id uuid NOT NULL DEFAULT current_company_id(), is_accounting boolean NOT NULL DEFAULT true, partner_id uuid, mirror_partner_aporte boolean NOT NULL DEFAULT false, advance_retention_pct numeric, initial_balance_date date, is_restricted boolean NOT NULL DEFAULT false, is_circuit_account boolean NOT NULL DEFAULT false);
CREATE TABLE public.role_permissions (id uuid NOT NULL DEFAULT gen_random_uuid(), role app_role NOT NULL, permission text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.user_permissions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, permission text NOT NULL, granted boolean NOT NULL DEFAULT true, created_at timestamp with time zone NOT NULL DEFAULT now(), company_id uuid NOT NULL DEFAULT current_company_id());
CREATE TABLE public.system_audit_log (id uuid NOT NULL DEFAULT gen_random_uuid(), entity_type text NOT NULL, entity_id text NOT NULL, action text NOT NULL, changed_by text NOT NULL DEFAULT 'system'::text, old_data jsonb, new_data jsonb, metadata jsonb, created_at timestamp with time zone NOT NULL DEFAULT now(), company_id uuid DEFAULT current_company_id());
CREATE TABLE public.event_ticket_office_assignments (id uuid NOT NULL DEFAULT gen_random_uuid(), event_id uuid NOT NULL, event_date_id uuid, commission_notes text, commission_type text NOT NULL DEFAULT 'descriptive'::text, is_conciliated boolean NOT NULL DEFAULT false, conciliated_at timestamp with time zone, conciliated_by text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), financial_account_id uuid NOT NULL, company_id uuid NOT NULL DEFAULT current_company_id());
CREATE TABLE public.partner_paid_expenses (id uuid NOT NULL DEFAULT gen_random_uuid(), event_id uuid NOT NULL, partner_id uuid NOT NULL, transaction_id uuid NOT NULL, notes text, created_at timestamp with time zone NOT NULL DEFAULT now(), paid_date date, company_id uuid NOT NULL DEFAULT current_company_id(), status text NOT NULL DEFAULT 'approved'::text, proposed_by uuid, approved_by uuid, approved_at timestamp with time zone);
CREATE TABLE public.reimbursement_note_items (id uuid NOT NULL DEFAULT gen_random_uuid(), reimbursement_note_id uuid NOT NULL, transaction_id uuid NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT now(), company_id uuid NOT NULL DEFAULT current_company_id());
CREATE TABLE public.reimbursement_notes (id uuid NOT NULL DEFAULT gen_random_uuid(), code text NOT NULL, employee_name text NOT NULL, status text NOT NULL DEFAULT 'draft'::text, total_amount numeric NOT NULL DEFAULT 0, payment_transaction_id uuid, approved_by text, approved_at timestamp with time zone, paid_at timestamp with time zone, notes text, created_by text NOT NULL DEFAULT 'system'::text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), supplier_id uuid, company_id uuid NOT NULL DEFAULT current_company_id(), payment_iban text);
CREATE TABLE public.transaction_payments (id uuid NOT NULL DEFAULT gen_random_uuid(), transaction_id uuid NOT NULL, amount numeric NOT NULL, payment_date date NOT NULL, account_id uuid, payment_method text NOT NULL DEFAULT 'transfer'::text, payment_entity text, payment_reference text, invoice_ref text, withholding_amount numeric NOT NULL DEFAULT 0, credit_amount numeric NOT NULL DEFAULT 0, notes text, created_by text NOT NULL DEFAULT 'sistema'::text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), company_id uuid NOT NULL DEFAULT current_company_id(), scheduled_date date, status text NOT NULL DEFAULT 'paid'::text, reversal_kind text, reversal_reason text, reversed_at timestamp with time zone, reversed_by uuid, supplier_credit_id uuid, closes_transaction boolean NOT NULL DEFAULT false, currency text NOT NULL DEFAULT 'EUR'::text, original_amount numeric, fx_rate numeric, fx_rate_source text, offset_id uuid, payment_list_id uuid, outside_batch boolean NOT NULL DEFAULT false);
CREATE TABLE public.ticket_office_settlements (id uuid NOT NULL DEFAULT gen_random_uuid(), financial_account_id uuid NOT NULL, event_id uuid NOT NULL, gross_revenue numeric NOT NULL DEFAULT 0, total_deductions numeric NOT NULL DEFAULT 0, net_calculated numeric NOT NULL DEFAULT 0, net_adjusted numeric, adjustment_notes text, net_transferred numeric NOT NULL DEFAULT 0, transfer_account_id uuid, transfer_transaction_id uuid, status text NOT NULL DEFAULT 'draft'::text, document_url text, document_name text, notes text, closed_at timestamp with time zone, closed_by uuid, reversed_at timestamp with time zone, reversed_by uuid, reversal_reason text, created_at timestamp with time zone NOT NULL DEFAULT now(), created_by uuid NOT NULL DEFAULT auth.uid(), updated_at timestamp with time zone NOT NULL DEFAULT now(), settlement_date date NOT NULL DEFAULT CURRENT_DATE, venue_invoice_remainder_amount numeric NOT NULL DEFAULT 0, venue_invoice_remainder_paid boolean NOT NULL DEFAULT false, venue_invoice_remainder_payment_id uuid, venue_retained_amount numeric NOT NULL DEFAULT 0, venue_retained_invoice_id uuid, venue_retained_notes text, venue_retained_payment_id uuid, company_id uuid NOT NULL DEFAULT current_company_id(), statement_id uuid, forma_liquidacao_manual text, forma_liquidacao_manual_notes text, gross_adjustment_notes text);
CREATE TABLE public.camarim_sessions (id uuid NOT NULL DEFAULT gen_random_uuid(), title text NOT NULL, mode text NOT NULL DEFAULT 'single_event'::text, status text NOT NULL DEFAULT 'open'::text, master_event_id uuid, responsible_profile_id uuid, budget_amount numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'EUR'::text, notes text, opened_at timestamp with time zone NOT NULL DEFAULT now(), closed_at timestamp with time zone, integrated_at timestamp with time zone, created_by uuid, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), advance_total numeric NOT NULL DEFAULT 0, settlement_balance numeric NOT NULL DEFAULT 0, settlement_transaction_id uuid, settlement_type text, spent_total numeric NOT NULL DEFAULT 0, integration_summary jsonb, integration_transaction_ids uuid[] NOT NULL DEFAULT '{}'::uuid[], company_id uuid NOT NULL DEFAULT current_company_id(), fund_holder_type text NOT NULL DEFAULT 'employee'::text, fund_holder_supplier_id uuid, fund_holder_user_id uuid, advance_account_id uuid, integrated_by uuid);
CREATE TABLE public.companies (id uuid NOT NULL DEFAULT gen_random_uuid(), legal_name text NOT NULL, display_name text NOT NULL, slug text NOT NULL, tax_id text, country text NOT NULL DEFAULT 'PT'::text, currency text NOT NULL DEFAULT 'EUR'::text, timezone text NOT NULL DEFAULT 'Europe/Lisbon'::text, logo_url text, favicon_url text, theme_config jsonb DEFAULT '{}'::jsonb, address jsonb DEFAULT '{}'::jsonb, contact_email text, status text NOT NULL DEFAULT 'active'::text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), feature_tickets_v2 boolean NOT NULL DEFAULT false, tickets_config jsonb NOT NULL DEFAULT '{}'::jsonb, public_portal boolean NOT NULL DEFAULT false, default_budget_mode text NOT NULL DEFAULT 'with_bp'::text);
CREATE TABLE public.coala_supplier_category_map (id uuid NOT NULL DEFAULT gen_random_uuid(), company_id uuid NOT NULL, supplier_id uuid NOT NULL, description_normalized text NOT NULL, category_id uuid NOT NULL, confirmed_count integer NOT NULL DEFAULT 1, matched_via text NOT NULL DEFAULT 'inline_edit'::text, created_by uuid, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), last_used_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.card_sessions (id uuid NOT NULL DEFAULT gen_random_uuid(), company_id uuid NOT NULL DEFAULT current_company_id(), card_account_id uuid NOT NULL, holder_profile_id uuid, holder_name text NOT NULL, primary_event_id uuid, opening_balance numeric, status text NOT NULL DEFAULT 'open'::text, opened_at timestamp with time zone NOT NULL DEFAULT now(), opened_by uuid, closed_at timestamp with time zone, closed_by uuid, closing_balance_confirmed numeric, closing_summary jsonb, notes text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), integration_summary jsonb, integration_transaction_ids uuid[], integrated_at timestamp with time zone, integrated_by uuid);
CREATE TABLE public.card_session_loads (id uuid NOT NULL DEFAULT gen_random_uuid(), company_id uuid NOT NULL DEFAULT current_company_id(), session_id uuid NOT NULL, amount numeric NOT NULL, load_date date NOT NULL DEFAULT CURRENT_DATE, source_account_id uuid, out_transaction_id uuid, in_transaction_id uuid, notes text, created_by uuid, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.payment_list_sepa_exports (id uuid NOT NULL DEFAULT gen_random_uuid(), payment_list_id uuid NOT NULL, company_id uuid NOT NULL DEFAULT current_company_id(), exported_by text NOT NULL DEFAULT 'sistema'::text, exported_at timestamp with time zone NOT NULL DEFAULT now(), file_name text NOT NULL, msg_id text NOT NULL, total_amount numeric NOT NULL DEFAULT 0, n_transactions integer NOT NULL DEFAULT 0, transaction_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]);
CREATE TABLE public.event_settlements (id uuid NOT NULL DEFAULT gen_random_uuid(), event_id uuid NOT NULL, company_id uuid NOT NULL DEFAULT current_company_id(), name text NOT NULL, parent_id uuid, parent_share_pct numeric, parent_share_basis text, "position" integer NOT NULL DEFAULT 0, is_sealed boolean NOT NULL DEFAULT false, sealed_bp_version_id uuid, sealed_at timestamp with time zone, sealed_by uuid, notes text, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), sealed_snapshot jsonb, seal_note text, unsealed_at timestamp with time zone, unsealed_by uuid, unseal_reason text, returns_parent_deductible_vat boolean NOT NULL DEFAULT false);
CREATE TABLE public.transaction_offsets (id uuid NOT NULL DEFAULT gen_random_uuid(), company_id uuid NOT NULL DEFAULT current_company_id(), receivable_transaction_id uuid NOT NULL, payable_transaction_id uuid NOT NULL, amount numeric(14,2) NOT NULL, note text, created_by text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.ticket_office_statements (id uuid NOT NULL DEFAULT gen_random_uuid(), company_id uuid NOT NULL, financial_account_id uuid NOT NULL, number text NOT NULL, statement_date date NOT NULL, document_total numeric(14,2), status text NOT NULL DEFAULT 'draft'::text, document_url text, document_name text, notes text, created_at timestamp with time zone NOT NULL DEFAULT now(), created_by uuid, updated_at timestamp with time zone NOT NULL DEFAULT now(), confirmed_at timestamp with time zone, confirmed_by uuid);
CREATE TABLE public.ticket_office_statement_lines (id uuid NOT NULL DEFAULT gen_random_uuid(), statement_id uuid NOT NULL, company_id uuid NOT NULL, line_type text NOT NULL, "position" integer NOT NULL DEFAULT 0, description text NOT NULL, amount numeric(14,2), pending_document boolean NOT NULL DEFAULT false, event_id uuid, ticket_office_settlement_id uuid, transaction_id uuid, invoice_group_id uuid, previous_statement_id uuid, notes text, created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.event_ticket_zones (id uuid NOT NULL DEFAULT gen_random_uuid(), event_id uuid NOT NULL, name text NOT NULL, total_capacity integer DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), session_id uuid, version_id uuid, company_id uuid NOT NULL DEFAULT current_company_id(), sync_generated boolean NOT NULL DEFAULT false, on_sale boolean);
ALTER TABLE public.event_ticket_zones ADD CONSTRAINT event_ticket_zones_pkey PRIMARY KEY (id);
CREATE TABLE public.ticket_sales (id uuid NOT NULL DEFAULT gen_random_uuid(), lot_id uuid, sale_date date NOT NULL DEFAULT CURRENT_DATE, quantity integer NOT NULL DEFAULT 0, unit_price numeric NOT NULL DEFAULT 0, notes text, created_by text NOT NULL DEFAULT 'system'::text, created_at timestamp with time zone NOT NULL DEFAULT now(), zone_id uuid, source text NOT NULL DEFAULT 'manual'::text, sale_date_to date, financial_account_id uuid, import_batch_id uuid, total_value numeric, company_id uuid NOT NULL DEFAULT current_company_id());
ALTER TABLE public.ticket_sales ADD CONSTRAINT ticket_sales_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_sales ADD CONSTRAINT ticket_sales_lot_or_zone CHECK (((lot_id IS NOT NULL) OR (zone_id IS NOT NULL)));
CREATE TABLE public.event_ticket_office_advances (id uuid NOT NULL DEFAULT gen_random_uuid(), event_id uuid NOT NULL, financial_account_id uuid NOT NULL, target_account_id uuid, transaction_id uuid, amount numeric NOT NULL DEFAULT 0, advance_date date NOT NULL DEFAULT CURRENT_DATE, notes text, settlement_id uuid, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now(), created_by text NOT NULL DEFAULT 'system'::text, company_id uuid NOT NULL DEFAULT current_company_id());
ALTER TABLE public.event_ticket_office_advances ADD CONSTRAINT event_ticket_office_advances_pkey PRIMARY KEY (id);
ALTER TABLE public.event_ticket_office_advances ADD CONSTRAINT etoa_never_open_chk CHECK (((transaction_id IS NOT NULL) OR (settlement_id IS NOT NULL)));
ALTER TABLE public.account_categories ADD CONSTRAINT account_categories_company_code_key UNIQUE (company_id, code);
ALTER TABLE public.account_categories ADD CONSTRAINT account_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.account_categories ADD CONSTRAINT account_categories_ebitda_class_check CHECK (((ebitda_class IS NULL) OR (ebitda_class = ANY (ARRAY['financeiro'::text, 'imposto_rendimento'::text, 'amortizacao'::text]))));
ALTER TABLE public.account_categories ADD CONSTRAINT account_categories_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));
CREATE INDEX idx_account_categories_allocate_flag ON public.account_categories USING btree (id) WHERE (allocate_to_active_event = true);
CREATE INDEX idx_account_categories_allocate_to_active_event ON public.account_categories USING btree (allocate_to_active_event) WHERE (allocate_to_active_event = true);
CREATE INDEX idx_account_categories_allocate_active ON public.account_categories USING btree (allocate_to_active_event) WHERE (allocate_to_active_event = true);
CREATE INDEX idx_ac_parent_id ON public.account_categories USING btree (parent_id) WHERE (parent_id IS NOT NULL);
CREATE INDEX idx_account_categories_company ON public.account_categories USING btree (company_id);
CREATE INDEX idx_ac_type_active ON public.account_categories USING btree (type, is_active);
ALTER TABLE public.events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE public.events ADD CONSTRAINT events_ads_allocation_level_check CHECK ((ads_allocation_level = ANY (ARRAY['tour'::text, 'cidade'::text, 'externo'::text])));
ALTER TABLE public.events ADD CONSTRAINT events_budget_mode_check CHECK (((budget_mode IS NULL) OR (budget_mode = ANY (ARRAY['with_bp'::text, 'without_bp'::text]))));
ALTER TABLE public.events ADD CONSTRAINT events_cost_expense_source_check CHECK ((cost_expense_source = ANY (ARRAY['realized'::text, 'committed'::text])));
ALTER TABLE public.events ADD CONSTRAINT events_event_nature_check CHECK ((event_nature = ANY (ARRAY['producao_propria'::text, 'intermediacao'::text, 'coproducao'::text, 'parceiro_local'::text, 'temporada'::text])));
ALTER TABLE public.events ADD CONSTRAINT events_management_type_check CHECK ((management_type = ANY (ARRAY['own'::text, 'partner_managed'::text])));
ALTER TABLE public.events ADD CONSTRAINT events_operacao_mode_check CHECK ((operacao_mode = ANY (ARRAY['planning'::text, 'montagem'::text, 'evento'::text, 'post'::text])));
ALTER TABLE public.events ADD CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['planning'::text, 'active'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public.events ADD CONSTRAINT events_admin_window_required CHECK (((NOT absorbs_admin_costs) OR ((admin_window_start IS NOT NULL) AND ((admin_window_end IS NULL) OR (admin_window_start <= admin_window_end)))));
ALTER TABLE public.events ADD CONSTRAINT events_ticketing_provider_check CHECK (((ticketing_provider IS NULL) OR (ticketing_provider = ANY (ARRAY['ticketline'::text, 'blueticket'::text, 'bol'::text, 'see_tickets'::text, 'fnac_tickets'::text, 'eventbrite'::text, 'ingresse'::text, 'sympla'::text, 'other'::text]))));
CREATE INDEX idx_events_company_management ON public.events USING btree (company_id, management_type);
CREATE UNIQUE INDEX events_slug_unique_idx ON public.events USING btree (slug) WHERE (slug IS NOT NULL);
CREATE INDEX idx_events_status ON public.events USING btree (status);
CREATE INDEX idx_events_absorbs_admin ON public.events USING btree (admin_window_start, admin_window_end) WHERE (absorbs_admin_costs = true);
CREATE INDEX idx_events_date ON public.events USING btree (date);
CREATE INDEX idx_events_city_id ON public.events USING btree (city_id) WHERE (city_id IS NOT NULL);
CREATE INDEX idx_events_admin_window ON public.events USING btree (admin_window_start, admin_window_end, company_id) WHERE (absorbs_admin_costs = true);
CREATE INDEX idx_events_ticketing_provider ON public.events USING btree (ticketing_provider) WHERE (ticketing_provider IS NOT NULL);
CREATE INDEX events_company_id_event_nature_idx ON public.events USING btree (company_id, event_nature);
CREATE INDEX idx_events_company ON public.events USING btree (company_id);
CREATE INDEX idx_events_import_template ON public.events USING btree (import_template) WHERE (import_template IS NOT NULL);
CREATE INDEX idx_events_absorbs_admin_costs ON public.events USING btree (admin_window_start, admin_window_end) WHERE (absorbs_admin_costs = true);
CREATE INDEX idx_events_parent_id ON public.events USING btree (parent_event_id) WHERE (parent_event_id IS NOT NULL);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_declared_withholding_nonneg CHECK ((((declared_withholding_rate IS NULL) OR (declared_withholding_rate >= (0)::numeric)) AND ((declared_withholding_amount IS NULL) OR (declared_withholding_amount >= (0)::numeric))));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_held_by_only_compensation_income CHECK (((held_by_supplier_id IS NULL) OR ((payment_method = 'compensation'::text) AND (type = 'income'::text))));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_iva_rate_check CHECK ((iva_rate = ANY (ARRAY[23, 13, 6, 0, 21, 10, 4])));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_operation_key_check CHECK (((operation_key IS NULL) OR (operation_key ~ '^[A-Z0-9]+(-[A-Z0-9]+)+$'::text)));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['transfer'::text, 'service_payment'::text, 'direct_debit'::text, 'state_payment'::text, 'compensation'::text]))));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_reversal_kind_check CHECK (((reversal_kind IS NULL) OR (reversal_kind = ANY (ARRAY['cash_refund'::text, 'supplier_credit'::text]))));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_service_payment_requires_mb CHECK (((payment_method <> 'service_payment'::text) OR ((payment_entity ~ '^\d{5}$'::text) AND (payment_reference ~ '^\d{9}$'::text)))) NOT VALID;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'overdue'::text, 'partially_paid'::text, 'reversed'::text])));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transitory_reason_domain CHECK (((transitory_reason IS NULL) OR (transitory_reason = ANY (ARRAY['partner_advance'::text, 'repasse'::text, 'caucao'::text, 'emprestimo_socio'::text, 'carga_cartao'::text, 'aporte_socio'::text, 'entrada_a_repassar'::text, 'devolucao_socio'::text]))));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_transitory_reason_required CHECK (((NOT is_transitory) OR (transitory_reason IS NOT NULL)));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_currency_check CHECK ((currency = ANY (ARRAY['EUR'::text, 'BRL'::text, 'USD'::text])));
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));
CREATE INDEX idx_tx_status_type ON public.transactions USING btree (status, type);
CREATE INDEX idx_transactions_invoice_group ON public.transactions USING btree (invoice_group_id) WHERE (invoice_group_id IS NOT NULL);
CREATE INDEX idx_tx_account_id ON public.transactions USING btree (account_id) WHERE (account_id IS NOT NULL);
CREATE INDEX idx_transactions_ordering_partner ON public.transactions USING btree (ordering_partner_id) WHERE (ordering_partner_id IS NOT NULL);
CREATE INDEX idx_transactions_is_confidential ON public.transactions USING btree (is_confidential) WHERE is_confidential;
CREATE INDEX idx_transactions_settlement ON public.transactions USING btree (settlement_id);
CREATE INDEX idx_tx_event_status ON public.transactions USING btree (event_id, status) WHERE (event_id IS NOT NULL);
CREATE INDEX idx_transactions_installment_group_id ON public.transactions USING btree (installment_group_id) WHERE (installment_group_id IS NOT NULL);
CREATE INDEX idx_transactions_currency_non_eur ON public.transactions USING btree (currency) WHERE (currency <> 'EUR'::text);
CREATE INDEX idx_transactions_paying_partner ON public.transactions USING btree (paying_partner_id);
CREATE INDEX idx_transactions_card_session ON public.transactions USING btree (card_session_id) WHERE (card_session_id IS NOT NULL);
CREATE INDEX idx_tx_event_id ON public.transactions USING btree (event_id) WHERE (event_id IS NOT NULL);
CREATE INDEX idx_transactions_company_operation_key ON public.transactions USING btree (company_id, operation_key) WHERE (operation_key IS NOT NULL);
CREATE INDEX idx_transactions_reimbursement ON public.transactions USING btree (is_reimbursement) WHERE (is_reimbursement = true);
CREATE INDEX idx_transactions_shared_cost_account ON public.transactions USING btree (shared_cost_account_id) WHERE (shared_cost_account_id IS NOT NULL);
CREATE INDEX idx_transactions_parent_id ON public.transactions USING btree (parent_transaction_id) WHERE (parent_transaction_id IS NOT NULL);
CREATE INDEX idx_tx_supplier_id ON public.transactions USING btree (supplier_id) WHERE (supplier_id IS NOT NULL);
CREATE UNIQUE INDEX transactions_active_installment_unique_idx ON public.transactions USING btree (company_id, COALESCE(event_id, '00000000-0000-0000-0000-000000000000'::uuid), type, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid), description, due_date, amount, iva_rate) WHERE ((due_date IS NOT NULL) AND (description ~ '[[:space:]]\([0-9]+/[0-9]+\)[[:space:]]*$'::text) AND (COALESCE(is_hidden, false) = false) AND (status <> 'reversed'::text));
CREATE INDEX idx_transactions_held_by_supplier ON public.transactions USING btree (held_by_supplier_id) WHERE (held_by_supplier_id IS NOT NULL);
CREATE INDEX idx_tx_category_id ON public.transactions USING btree (category_id) WHERE (category_id IS NOT NULL);
CREATE INDEX idx_transactions_event_settlement ON public.transactions USING btree (event_settlement_id) WHERE (event_settlement_id IS NOT NULL);
CREATE INDEX idx_tx_payment_date ON public.transactions USING btree (payment_date) WHERE (payment_date IS NOT NULL);
CREATE INDEX idx_tx_date ON public.transactions USING btree (date);
CREATE INDEX idx_transactions_company ON public.transactions USING btree (company_id);
CREATE INDEX idx_transactions_forecast_id ON public.transactions USING btree (forecast_id) WHERE (forecast_id IS NOT NULL);
ALTER TABLE public.transaction_audit_log ADD CONSTRAINT transaction_audit_log_pkey PRIMARY KEY (id);
CREATE INDEX idx_transaction_audit_log_company ON public.transaction_audit_log USING btree (company_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_first_access_token_key UNIQUE (first_access_token);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_profile_type_check CHECK ((profile_type = ANY (ARRAY['user'::text, 'field_staff'::text])));
CREATE INDEX idx_profiles_active_company ON public.profiles USING btree (active_company_id);
CREATE INDEX idx_profiles_first_access_token ON public.profiles USING btree (first_access_token) WHERE (first_access_token IS NOT NULL);
CREATE INDEX idx_profiles_profile_type ON public.profiles USING btree (profile_type);
CREATE INDEX idx_profiles_company ON public.profiles USING btree (company_id);
CREATE INDEX idx_profiles_archived_at ON public.profiles USING btree (archived_at);
CREATE INDEX idx_profiles_linked_supplier ON public.profiles USING btree (linked_supplier_id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_company_role_key UNIQUE (user_id, company_id, role);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
CREATE INDEX idx_user_roles_company ON public.user_roles USING btree (company_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);
ALTER TABLE public.payment_list_items ADD CONSTRAINT payment_list_items_pkey PRIMARY KEY (id);
CREATE INDEX idx_pli_payment_list_id ON public.payment_list_items USING btree (payment_list_id);
CREATE INDEX idx_payment_list_items_company ON public.payment_list_items USING btree (company_id);
CREATE INDEX idx_pli_transaction_id ON public.payment_list_items USING btree (transaction_id) WHERE (transaction_id IS NOT NULL);
ALTER TABLE public.event_forecasts ADD CONSTRAINT event_forecasts_pkey PRIMARY KEY (id);
ALTER TABLE public.event_forecasts ADD CONSTRAINT event_forecasts_addback_xor_perimeter CHECK (((addback_settlement_id IS NULL) OR (event_settlement_id IS NULL)));
ALTER TABLE public.event_forecasts ADD CONSTRAINT event_forecasts_currency_check CHECK ((currency = ANY (ARRAY['EUR'::text, 'BRL'::text, 'USD'::text])));
ALTER TABLE public.event_forecasts ADD CONSTRAINT event_forecasts_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text])));
CREATE INDEX idx_event_forecasts_formalidade ON public.event_forecasts USING btree (formalidade);
CREATE INDEX idx_ef_category_id ON public.event_forecasts USING btree (category_id) WHERE (category_id IS NOT NULL);
CREATE INDEX idx_ef_event_type_status ON public.event_forecasts USING btree (event_id, type, status);
CREATE INDEX idx_ef_event_id ON public.event_forecasts USING btree (event_id);
CREATE INDEX idx_event_forecasts_event_settlement ON public.event_forecasts USING btree (event_settlement_id) WHERE (event_settlement_id IS NOT NULL);
CREATE INDEX idx_event_forecasts_currency_non_eur ON public.event_forecasts USING btree (currency) WHERE (currency <> 'EUR'::text);
CREATE INDEX idx_ef_transaction_id ON public.event_forecasts USING btree (transaction_id) WHERE (transaction_id IS NOT NULL);
CREATE INDEX idx_event_forecasts_company ON public.event_forecasts USING btree (company_id);
CREATE INDEX idx_event_forecasts_is_overhead ON public.event_forecasts USING btree (is_overhead) WHERE (is_overhead = true);
CREATE INDEX idx_event_forecasts_ordering_partner ON public.event_forecasts USING btree (ordering_partner_id) WHERE (ordering_partner_id IS NOT NULL);
CREATE INDEX idx_event_forecasts_addback_settlement ON public.event_forecasts USING btree (addback_settlement_id) WHERE (addback_settlement_id IS NOT NULL);
CREATE INDEX idx_event_forecasts_event_id_active ON public.event_forecasts USING btree (event_id) WHERE (version_id IS NULL);
CREATE INDEX idx_ef_cache_config_id ON public.event_forecasts USING btree (cache_config_id) WHERE (cache_config_id IS NOT NULL);
CREATE INDEX idx_event_forecasts_master_forecast_id ON public.event_forecasts USING btree (master_forecast_id) WHERE (master_forecast_id IS NOT NULL);
CREATE INDEX idx_event_forecasts_invoice_group ON public.event_forecasts USING btree (invoice_group_id) WHERE (invoice_group_id IS NOT NULL);
CREATE INDEX idx_event_forecasts_version_id ON public.event_forecasts USING btree (version_id) WHERE (version_id IS NOT NULL);
CREATE INDEX idx_event_forecasts_paying_partner ON public.event_forecasts USING btree (paying_partner_id);
ALTER TABLE public.financial_accounts ADD CONSTRAINT financial_accounts_pkey PRIMARY KEY (id);
CREATE INDEX idx_financial_accounts_company ON public.financial_accounts USING btree (company_id);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_permission_key UNIQUE (role, permission);
ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);
CREATE INDEX idx_role_permissions_role ON public.role_permissions USING btree (role);
ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_user_company_permission_key UNIQUE (user_id, company_id, permission);
ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (id);
CREATE INDEX idx_user_permissions_company ON public.user_permissions USING btree (company_id);
ALTER TABLE public.system_audit_log ADD CONSTRAINT system_audit_log_pkey PRIMARY KEY (id);
CREATE INDEX idx_system_audit_log_company ON public.system_audit_log USING btree (company_id);
CREATE INDEX idx_system_audit_entity ON public.system_audit_log USING btree (entity_type, entity_id);
CREATE INDEX idx_system_audit_created ON public.system_audit_log USING btree (created_at DESC);
ALTER TABLE public.event_ticket_office_assignments ADD CONSTRAINT event_ticket_office_assignments_pkey PRIMARY KEY (id);
CREATE INDEX idx_event_ticket_office_assignments_company ON public.event_ticket_office_assignments USING btree (company_id);
ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT partner_paid_expenses_transaction_id_key UNIQUE (transaction_id);
ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT partner_paid_expenses_pkey PRIMARY KEY (id);
ALTER TABLE public.partner_paid_expenses ADD CONSTRAINT partner_paid_expenses_status_check CHECK ((status = ANY (ARRAY['approved'::text, 'pending_approval'::text])));
CREATE INDEX idx_partner_paid_expenses_company ON public.partner_paid_expenses USING btree (company_id);
ALTER TABLE public.reimbursement_note_items ADD CONSTRAINT reimbursement_note_items_transaction_id_key UNIQUE (transaction_id);
ALTER TABLE public.reimbursement_note_items ADD CONSTRAINT reimbursement_note_items_pkey PRIMARY KEY (id);
CREATE INDEX idx_reimbursement_note_items_company ON public.reimbursement_note_items USING btree (company_id);
ALTER TABLE public.reimbursement_notes ADD CONSTRAINT reimbursement_notes_code_key UNIQUE (code);
ALTER TABLE public.reimbursement_notes ADD CONSTRAINT reimbursement_notes_pkey PRIMARY KEY (id);
CREATE INDEX idx_reimbursement_notes_supplier_id ON public.reimbursement_notes USING btree (supplier_id);
CREATE INDEX idx_reimbursement_notes_company ON public.reimbursement_notes USING btree (company_id);
ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_pkey PRIMARY KEY (id);
ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_fx_required CHECK (((currency = 'EUR'::text) OR ((original_amount IS NOT NULL) AND (fx_rate IS NOT NULL))));
ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_payment_method_check CHECK (((payment_method IS NULL) OR (payment_method = ANY (ARRAY['transfer'::text, 'service_payment'::text, 'direct_debit'::text, 'state_payment'::text, 'compensation'::text]))));
ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_reversal_kind_check CHECK (((reversal_kind IS NULL) OR (reversal_kind = ANY (ARRAY['cash_refund'::text, 'supplier_credit'::text]))));
ALTER TABLE public.transaction_payments ADD CONSTRAINT transaction_payments_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'paid'::text, 'cancelled'::text, 'reversed'::text])));
CREATE INDEX idx_transaction_payments_company ON public.transaction_payments USING btree (company_id);
CREATE INDEX transaction_payments_offset_id_idx ON public.transaction_payments USING btree (offset_id) WHERE (offset_id IS NOT NULL);
CREATE INDEX idx_transaction_payments_scheduled ON public.transaction_payments USING btree (scheduled_date) WHERE (scheduled_date IS NOT NULL);
CREATE INDEX idx_transaction_payments_tx_status ON public.transaction_payments USING btree (transaction_id, status);
CREATE INDEX idx_transaction_payments_transaction_id ON public.transaction_payments USING btree (transaction_id);
CREATE INDEX idx_tx_payments_transaction_id ON public.transaction_payments USING btree (transaction_id);
ALTER TABLE public.ticket_office_settlements ADD CONSTRAINT ticket_office_settlements_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_office_settlements ADD CONSTRAINT settlements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'reversed'::text])));
ALTER TABLE public.ticket_office_settlements ADD CONSTRAINT ticket_office_settlements_forma_liquidacao_manual_check CHECK (((forma_liquidacao_manual IS NULL) OR (forma_liquidacao_manual = ANY (ARRAY['transferencia'::text, 'encontro_de_contas'::text, 'compensado'::text, 'por_liquidar'::text, 'apuramento'::text]))));
CREATE INDEX idx_settlements_event ON public.ticket_office_settlements USING btree (event_id);
CREATE INDEX idx_settlements_venue_invoice ON public.ticket_office_settlements USING btree (venue_retained_invoice_id) WHERE (venue_retained_invoice_id IS NOT NULL);
CREATE INDEX idx_ticket_office_settlements_company ON public.ticket_office_settlements USING btree (company_id);
CREATE UNIQUE INDEX ux_settlements_office_event_confirmed ON public.ticket_office_settlements USING btree (financial_account_id, event_id) WHERE (status = 'confirmed'::text);
CREATE INDEX idx_settlements_status ON public.ticket_office_settlements USING btree (status);
CREATE INDEX idx_settlements_office ON public.ticket_office_settlements USING btree (financial_account_id);
ALTER TABLE public.camarim_sessions ADD CONSTRAINT camarim_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.camarim_sessions ADD CONSTRAINT camarim_sessions_fund_holder_ref_check CHECK ((((fund_holder_type = 'employee'::text) AND (fund_holder_supplier_id IS NULL)) OR ((fund_holder_type = 'supplier'::text) AND (fund_holder_user_id IS NULL))));
ALTER TABLE public.camarim_sessions ADD CONSTRAINT camarim_sessions_fund_holder_type_check CHECK ((fund_holder_type = ANY (ARRAY['employee'::text, 'supplier'::text])));
ALTER TABLE public.camarim_sessions ADD CONSTRAINT camarim_sessions_currency_check CHECK ((char_length(currency) = 3));
ALTER TABLE public.camarim_sessions ADD CONSTRAINT camarim_sessions_settlement_type_check CHECK ((settlement_type = ANY (ARRAY['refund'::text, 'reinforcement'::text, 'balanced'::text])));
ALTER TABLE public.camarim_sessions ADD CONSTRAINT camarim_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_review'::text, 'closed'::text, 'integrated'::text])));
ALTER TABLE public.camarim_sessions ADD CONSTRAINT camarim_sessions_mode_check CHECK ((mode = ANY (ARRAY['single_event'::text, 'tour_consolidated'::text, 'city_session'::text])));
CREATE INDEX idx_camarim_sessions_advance_account ON public.camarim_sessions USING btree (advance_account_id);
CREATE INDEX idx_camarim_sessions_master_event_id ON public.camarim_sessions USING btree (master_event_id);
CREATE INDEX idx_camarim_sessions_fund_holder_supplier ON public.camarim_sessions USING btree (fund_holder_supplier_id);
CREATE INDEX idx_camarim_sessions_status ON public.camarim_sessions USING btree (status);
CREATE INDEX idx_camarim_sessions_company ON public.camarim_sessions USING btree (company_id);
ALTER TABLE public.companies ADD CONSTRAINT companies_slug_key UNIQUE (slug);
ALTER TABLE public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);
ALTER TABLE public.companies ADD CONSTRAINT companies_default_budget_mode_check CHECK ((default_budget_mode = ANY (ARRAY['with_bp'::text, 'without_bp'::text])));
ALTER TABLE public.companies ADD CONSTRAINT companies_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'trial'::text])));
ALTER TABLE public.coala_supplier_category_map ADD CONSTRAINT coala_scm_unique UNIQUE (company_id, supplier_id, description_normalized);
ALTER TABLE public.coala_supplier_category_map ADD CONSTRAINT coala_supplier_category_map_pkey PRIMARY KEY (id);
ALTER TABLE public.coala_supplier_category_map ADD CONSTRAINT coala_scm_matched_via_chk CHECK ((matched_via = ANY (ARRAY['inline_edit'::text, 'audit_ia'::text, 'manual'::text, 'wizard'::text])));
CREATE INDEX idx_coala_scm_company_supplier ON public.coala_supplier_category_map USING btree (company_id, supplier_id);
CREATE INDEX idx_coala_scm_desc_trgm ON public.coala_supplier_category_map USING gin (description_normalized gin_trgm_ops);
ALTER TABLE public.card_sessions ADD CONSTRAINT card_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.card_sessions ADD CONSTRAINT card_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_review'::text, 'closed'::text])));
CREATE UNIQUE INDEX ux_card_sessions_active_per_card ON public.card_sessions USING btree (card_account_id) WHERE (status <> 'closed'::text);
CREATE INDEX idx_card_sessions_company ON public.card_sessions USING btree (company_id);
CREATE INDEX idx_card_sessions_status ON public.card_sessions USING btree (status);
CREATE INDEX idx_card_sessions_card ON public.card_sessions USING btree (card_account_id);
ALTER TABLE public.card_session_loads ADD CONSTRAINT card_session_loads_pkey PRIMARY KEY (id);
ALTER TABLE public.card_session_loads ADD CONSTRAINT card_session_loads_amount_check CHECK ((amount > (0)::numeric));
CREATE INDEX idx_card_session_loads_session ON public.card_session_loads USING btree (session_id);
CREATE INDEX idx_card_session_loads_company ON public.card_session_loads USING btree (company_id);
ALTER TABLE public.payment_list_sepa_exports ADD CONSTRAINT payment_list_sepa_exports_pkey PRIMARY KEY (id);
CREATE INDEX payment_list_sepa_exports_company_idx ON public.payment_list_sepa_exports USING btree (company_id);
CREATE INDEX payment_list_sepa_exports_list_idx ON public.payment_list_sepa_exports USING btree (payment_list_id, exported_at DESC);
ALTER TABLE public.event_settlements ADD CONSTRAINT event_settlements_pkey PRIMARY KEY (id);
ALTER TABLE public.event_settlements ADD CONSTRAINT event_settlements_parent_share_basis_check CHECK ((parent_share_basis = ANY (ARRAY['net_result'::text, 'net_result_gross_expenses'::text])));
ALTER TABLE public.event_settlements ADD CONSTRAINT event_settlements_root_no_share CHECK ((((parent_id IS NULL) AND (parent_share_pct IS NULL) AND (parent_share_basis IS NULL)) OR ((parent_id IS NOT NULL) AND (parent_share_pct IS NOT NULL) AND (parent_share_pct >= (0)::numeric) AND (parent_share_pct <= (100)::numeric) AND (parent_share_basis IS NOT NULL))));
ALTER TABLE public.event_settlements ADD CONSTRAINT event_settlements_root_no_vat_return CHECK (((NOT returns_parent_deductible_vat) OR (parent_id IS NOT NULL)));
CREATE INDEX event_settlements_parent_idx ON public.event_settlements USING btree (parent_id);
CREATE INDEX event_settlements_event_idx ON public.event_settlements USING btree (event_id);
CREATE UNIQUE INDEX event_settlements_one_root_per_event ON public.event_settlements USING btree (event_id) WHERE (parent_id IS NULL);
CREATE UNIQUE INDEX event_settlements_one_vat_return_per_parent ON public.event_settlements USING btree (parent_id) WHERE returns_parent_deductible_vat;
ALTER TABLE public.transaction_offsets ADD CONSTRAINT transaction_offsets_pair_unique UNIQUE (receivable_transaction_id, payable_transaction_id);
ALTER TABLE public.transaction_offsets ADD CONSTRAINT transaction_offsets_pkey PRIMARY KEY (id);
ALTER TABLE public.transaction_offsets ADD CONSTRAINT transaction_offsets_amount_check CHECK ((amount > (0)::numeric));
CREATE INDEX transaction_offsets_payable_idx ON public.transaction_offsets USING btree (payable_transaction_id);
ALTER TABLE public.ticket_office_statements ADD CONSTRAINT ticket_office_statements_financial_account_id_number_key UNIQUE (financial_account_id, number);
ALTER TABLE public.ticket_office_statements ADD CONSTRAINT ticket_office_statements_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_office_statements ADD CONSTRAINT ticket_office_statements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text])));
ALTER TABLE public.ticket_office_statement_lines ADD CONSTRAINT ticket_office_statement_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.ticket_office_statement_lines ADD CONSTRAINT ticket_office_statement_lines_line_type_check CHECK ((line_type = ANY (ARRAY['event_right'::text, 'ticketline_invoice'::text, 'venue_settlement'::text, 'advance'::text, 'carry_over'::text])));
ALTER TABLE public.ticket_office_statement_lines ADD CONSTRAINT tosl_amount_or_pending CHECK (((amount IS NOT NULL) OR pending_document));
CREATE INDEX tosl_statement_idx ON public.ticket_office_statement_lines USING btree (statement_id);
CREATE UNIQUE INDEX tosl_transaction_once ON public.ticket_office_statement_lines USING btree (transaction_id) WHERE (transaction_id IS NOT NULL);
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
$function$;
CREATE OR REPLACE FUNCTION public._paid_guard_is_exempt(p transactions)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(p.is_reimbursement, false)
      OR (p.parent_transaction_id IS NOT NULL AND p.split_percentage IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.partner_paid_expenses e WHERE e.transaction_id = p.id);
$function$;
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
CREATE OR REPLACE FUNCTION public.account_has_balance_for(_account_id uuid, _amount numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_skip boolean;
  v_company uuid;
  v_balance numeric;
BEGIN
  SELECT skip_balance_check, company_id INTO v_skip, v_company
  FROM public.financial_accounts WHERE id = _account_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Isenção deliberada: auth.uid() IS NULL = service_role/crons/edge functions.
  IF v_uid IS NOT NULL
     AND NOT public.is_platform_admin(v_uid)
     AND v_company IS DISTINCT FROM public.current_company_id() THEN
    RETURN false;
  END IF;

  IF COALESCE(v_skip, false) THEN
    RETURN true;
  END IF;

  v_balance := public._account_true_balance_raw(_account_id);
  RETURN COALESCE(_amount, 0) <= COALESCE(v_balance, 0);
END;
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.confirm_ticket_office_statement(p_statement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record; v_sum numeric; v_pending int;
BEGIN
  SELECT * INTO s FROM public.ticket_office_statements WHERE id = p_statement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Apuramento não encontrado.'; END IF;
  IF NOT public.row_belongs_to_current_company(s.company_id) THEN RAISE EXCEPTION 'Sem acesso a este apuramento.'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'platform_admin')) THEN
    RAISE EXCEPTION 'Só admin ou manager confirmam apuramentos.';
  END IF;
  IF s.status = 'confirmed' THEN RAISE EXCEPTION 'Apuramento já confirmado.'; END IF;
  IF s.document_total IS NULL THEN RAISE EXCEPTION 'Falta o total do documento.'; END IF;
  SELECT count(*) FILTER (WHERE pending_document), COALESCE(sum(amount),0)
    INTO v_pending, v_sum FROM public.ticket_office_statement_lines WHERE statement_id = p_statement_id;
  IF v_pending > 0 THEN RAISE EXCEPTION 'Há % linha(s) pendente(s) de documento.', v_pending; END IF;
  IF abs(round(v_sum,2) - s.document_total) > 0.004 THEN
    RAISE EXCEPTION 'Σ linhas (%) ≠ total do documento (%).', round(v_sum,2), s.document_total;
  END IF;
  UPDATE public.ticket_office_statements SET status='confirmed', confirmed_at=now(), confirmed_by=auth.uid(), updated_at=now()
   WHERE id = p_statement_id;
END $function$;
CREATE OR REPLACE FUNCTION public.create_settlement_transfer(p_settlement_id uuid, p_from_account_id uuid, p_to_account_id uuid, p_amount numeric, p_date date, p_credited boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_settlement record;
  v_from_name text;
  v_to_name text;
  v_key text;
  v_desc text;
  v_out uuid;
  v_status text;
  v_paid numeric;
  v_pay_date date;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT (
      public.has_role(auth.uid(), 'admin')
      OR public.is_platform_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'manage_accounts')
    ) THEN
      RAISE EXCEPTION 'Sem permissão para lançar a transferência do fecho' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa activa não resolvida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_settlement FROM public.ticket_office_settlements WHERE id = p_settlement_id;

  IF v_settlement.id IS NULL THEN
    RAISE EXCEPTION 'Fecho não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_settlement.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'Fecho de outra empresa' USING ERRCODE = '42501';
  END IF;
  IF v_settlement.transfer_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este fecho já tem transferência lançada' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Valor da transferência tem de ser positivo' USING ERRCODE = '22023';
  END IF;
  IF p_from_account_id IS NULL OR p_to_account_id IS NULL THEN
    RAISE EXCEPTION 'Contas de origem e destino são obrigatórias' USING ERRCODE = '22023';
  END IF;
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Conta de origem e destino não podem ser a mesma' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_from_name FROM public.financial_accounts WHERE id = p_from_account_id;
  SELECT name INTO v_to_name FROM public.financial_accounts WHERE id = p_to_account_id;

  v_key := 'TRF-FECHO-' || upper(substring(replace(p_settlement_id::text, '-', '') FROM 1 FOR 8));
  v_desc := 'Transferência fecho bilheteira ' || coalesce(v_from_name, '?')
            || ' -> ' || coalesce(v_to_name, '?')
            || CASE WHEN p_credited THEN '' ELSE ' (a receber)' END;

  IF p_credited THEN
    v_status := 'paid'; v_paid := p_amount; v_pay_date := p_date;
  ELSE
    v_status := 'pending'; v_paid := 0; v_pay_date := NULL;
  END IF;

  INSERT INTO public.transactions (
    company_id, event_id, type, category_id, description, amount, iva_rate, date,
    status, paid_amount, payment_date, account_id, payment_method,
    exclude_from_result, currency, settlement_id, operation_key
  ) VALUES (
    v_company, v_settlement.event_id, 'expense', 'b32df086-c995-4747-a3f9-bfefa0063d0a',
    v_desc, p_amount, 0, p_date,
    v_status, v_paid, v_pay_date, p_from_account_id, 'transfer',
    true, 'EUR', p_settlement_id, v_key
  ) RETURNING id INTO v_out;

  INSERT INTO public.transactions (
    company_id, event_id, type, category_id, description, amount, iva_rate, date,
    status, paid_amount, payment_date, account_id, payment_method,
    exclude_from_result, currency, settlement_id, operation_key
  ) VALUES (
    v_company, v_settlement.event_id, 'income', 'b32df086-c995-4747-a3f9-bfefa0063d0a',
    v_desc, p_amount, 0, p_date,
    v_status, v_paid, v_pay_date, p_to_account_id, 'transfer',
    true, 'EUR', NULL, v_key
  );

  UPDATE public.ticket_office_settlements
  SET transfer_transaction_id = v_out,
      net_transferred = p_amount,
      transfer_account_id = p_to_account_id
  WHERE id = p_settlement_id;

  RETURN v_out;
END;
$function$;
CREATE OR REPLACE FUNCTION public.current_company_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_active uuid;
  v_company uuid;
  v_is_pa boolean;
  v_has_active_membership boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT active_company_id, company_id INTO v_active, v_company
    FROM public.profiles WHERE id = v_uid;

  SELECT EXISTS(SELECT 1 FROM public.user_roles
    WHERE user_id = v_uid AND role = 'platform_admin'::app_role) INTO v_is_pa;

  -- 1) active_company_id válido (platform_admin OU user tem membership lá)
  IF v_active IS NOT NULL THEN
    IF v_is_pa THEN
      RETURN v_active;
    END IF;
    SELECT EXISTS(SELECT 1 FROM public.user_roles
      WHERE user_id = v_uid AND company_id = v_active) INTO v_has_active_membership;
    IF v_has_active_membership THEN RETURN v_active; END IF;
  END IF;

  -- 2) fallback: profiles.company_id se ainda tem membership lá
  IF v_company IS NOT NULL THEN
    IF v_is_pa OR EXISTS(SELECT 1 FROM public.user_roles
        WHERE user_id = v_uid AND company_id = v_company) THEN
      RETURN v_company;
    END IF;
  END IF;

  -- 3) fallback: primeira empresa onde tem membership
  RETURN (SELECT ur.company_id FROM public.user_roles ur
    JOIN public.companies c ON c.id = ur.company_id
    WHERE ur.user_id = v_uid AND c.status='active'
    ORDER BY ur.id LIMIT 1);
END;
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
END $function$;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
        AND (
          _role = 'platform_admin'::app_role
          OR company_id = public.current_company_id()
        )
    )
$function$;
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
END $function$;
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
end $function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.row_belongs_to_current_company(_row_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_platform_admin()
    OR _row_company_id IS NULL
    OR _row_company_id = public.current_company_id()
$function$;
CREATE OR REPLACE FUNCTION public.save_ticket_office_settlement(p_settlement_id uuid, p_payload jsonb, p_confirm boolean, p_selected jsonb, p_transfer jsonb, p_retained_payment_notes text, p_remainder_payment_notes text, p_audit_user text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_id uuid;
  v_prev public.ticket_office_settlements%ROWTYPE;
  v_has_prev boolean := false;
  v_office uuid := (p_payload->>'financial_account_id')::uuid;
  v_event uuid := nullif(p_payload->>'event_id','')::uuid;
  v_date date := (p_payload->>'settlement_date')::date;
  v_ids uuid[];
  v_ret_amt numeric := coalesce((p_payload->>'venue_retained_amount')::numeric, 0);
  v_inv uuid := nullif(p_payload->>'venue_retained_invoice_id','')::uuid;
  v_rem_applied boolean := coalesce((p_payload->>'venue_invoice_remainder_paid')::boolean, false);
  v_rem_amt numeric := coalesce((p_payload->>'venue_invoice_remainder_amount')::numeric, 0);
  v_need_rev boolean;
  v_need_rev_rem boolean;
  v_tx record;
  v_pay uuid;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.is_platform_admin(v_uid)
          OR public.has_permission(v_uid, 'manage_accounts')) THEN
    RAISE EXCEPTION 'Sem permissão para gravar o fecho de bilheteira' USING ERRCODE = '42501';
  END IF;
  v_company := public.current_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Empresa activa não resolvida' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = v_office AND company_id = v_company) THEN
    RAISE EXCEPTION 'Bilheteira de outra empresa' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg((x->>'id')::uuid), '{}') INTO v_ids FROM jsonb_array_elements(coalesce(p_selected,'[]'::jsonb)) x;
  IF EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = ANY(v_ids) AND t.company_id IS DISTINCT FROM v_company) THEN
    RAISE EXCEPTION 'Dedução de outra empresa' USING ERRCODE = '42501';
  END IF;
  IF v_inv IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = v_inv AND company_id = v_company) THEN
    RAISE EXCEPTION 'Fatura de outra empresa' USING ERRCODE = '42501';
  END IF;

  IF p_settlement_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.ticket_office_settlements WHERE id = p_settlement_id FOR UPDATE;
    IF v_prev.id IS NULL OR v_prev.company_id IS DISTINCT FROM v_company THEN
      RAISE EXCEPTION 'Fecho não encontrado nesta empresa' USING ERRCODE = '42501';
    END IF;
    v_has_prev := true;
    v_id := p_settlement_id;
    UPDATE public.ticket_office_settlements SET
      financial_account_id = v_office, event_id = v_event, settlement_date = v_date,
      gross_revenue = (p_payload->>'gross_revenue')::numeric,
      total_deductions = (p_payload->>'total_deductions')::numeric,
      net_calculated = (p_payload->>'net_calculated')::numeric,
      net_adjusted = nullif(p_payload->>'net_adjusted','')::numeric,
      adjustment_notes = p_payload->>'adjustment_notes',
      gross_adjustment_notes = p_payload->>'gross_adjustment_notes',
      forma_liquidacao_manual = p_payload->>'forma_liquidacao_manual',
      forma_liquidacao_manual_notes = p_payload->>'forma_liquidacao_manual_notes',
      net_transferred = coalesce((p_payload->>'net_transferred')::numeric, 0),
      transfer_account_id = nullif(p_payload->>'transfer_account_id','')::uuid,
      document_url = p_payload->>'document_url',
      document_name = p_payload->>'document_name',
      notes = p_payload->>'notes',
      venue_retained_amount = v_ret_amt,
      venue_retained_invoice_id = v_inv,
      venue_retained_notes = p_payload->>'venue_retained_notes',
      venue_invoice_remainder_paid = v_rem_applied,
      venue_invoice_remainder_amount = v_rem_amt,
      status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'draft' END,
      closed_at = CASE WHEN p_confirm THEN now() ELSE closed_at END,
      closed_by = CASE WHEN p_confirm THEN v_uid ELSE closed_by END
    WHERE id = v_id;
  ELSE
    INSERT INTO public.ticket_office_settlements (
      company_id, financial_account_id, event_id, settlement_date, gross_revenue, total_deductions,
      net_calculated, net_adjusted, adjustment_notes, gross_adjustment_notes,
      forma_liquidacao_manual, forma_liquidacao_manual_notes, net_transferred, transfer_account_id,
      document_url, document_name, notes, venue_retained_amount, venue_retained_invoice_id,
      venue_retained_notes, venue_invoice_remainder_paid, venue_invoice_remainder_amount,
      status, closed_at, closed_by, created_by
    ) VALUES (
      v_company, v_office, v_event, v_date, (p_payload->>'gross_revenue')::numeric,
      (p_payload->>'total_deductions')::numeric, (p_payload->>'net_calculated')::numeric,
      nullif(p_payload->>'net_adjusted','')::numeric, p_payload->>'adjustment_notes',
      p_payload->>'gross_adjustment_notes', p_payload->>'forma_liquidacao_manual',
      p_payload->>'forma_liquidacao_manual_notes', coalesce((p_payload->>'net_transferred')::numeric, 0),
      nullif(p_payload->>'transfer_account_id','')::uuid, p_payload->>'document_url',
      p_payload->>'document_name', p_payload->>'notes', v_ret_amt, v_inv,
      p_payload->>'venue_retained_notes', v_rem_applied, v_rem_amt,
      CASE WHEN p_confirm THEN 'confirmed' ELSE 'draft' END,
      CASE WHEN p_confirm THEN now() END, CASE WHEN p_confirm THEN v_uid END, v_uid
    ) RETURNING id INTO v_id;
  END IF;

  IF p_confirm AND p_transfer IS NOT NULL AND coalesce((p_transfer->>'amount')::numeric,0) > 0
     AND NOT (v_has_prev AND v_prev.transfer_transaction_id IS NOT NULL) THEN
    PERFORM public.create_settlement_transfer(v_id, v_office, (p_transfer->>'to_account_id')::uuid,
      (p_transfer->>'amount')::numeric, v_date, coalesce((p_transfer->>'credited')::boolean, false));
  END IF;

  IF v_has_prev THEN
    UPDATE public.transactions t SET settlement_id = NULL
     WHERE t.settlement_id = v_id
       AND NOT (t.id = ANY(v_ids))
       AND t.id IS DISTINCT FROM (SELECT transfer_transaction_id FROM public.ticket_office_settlements WHERE id = v_id)
       AND coalesce(t.operation_key,'') NOT LIKE 'TRF-FECHO-%';
  END IF;

  IF array_length(v_ids,1) > 0 THEN
    IF p_confirm THEN
      FOR r IN SELECT (x->>'id')::uuid AS id, (x->>'paid_amount')::numeric AS paid
                 FROM jsonb_array_elements(p_selected) x LOOP
        IF r.paid IS NULL THEN
          UPDATE public.transactions SET settlement_id = v_id WHERE id = r.id;
          CONTINUE;
        END IF;
        SELECT id, reversed_at INTO v_tx FROM public.transactions WHERE id = r.id FOR UPDATE;
        IF v_tx.id IS NULL THEN RAISE EXCEPTION 'Dedução % não encontrada', r.id; END IF;
        UPDATE public.transactions SET settlement_id = v_id, status = 'paid', payment_date = v_date,
               account_id = v_office, paid_amount = r.paid,
               reversed_at = CASE WHEN v_tx.reversed_at IS NOT NULL THEN NULL ELSE reversed_at END,
               reversal_kind = CASE WHEN v_tx.reversed_at IS NOT NULL THEN NULL ELSE reversal_kind END
         WHERE id = r.id;
        IF v_tx.reversed_at IS NOT NULL THEN
          INSERT INTO public.transaction_audit_log (transaction_id, changed_by, field_name, old_value, new_value)
          VALUES (r.id, p_audit_user, 'Estorno', 'Estornada em ' || to_char(v_tx.reversed_at, 'YYYY-MM-DD'),
                  'Carimbo de estorno limpo — transação voltou a ser paga');
        END IF;
      END LOOP;
    ELSE
      UPDATE public.transactions SET settlement_id = v_id WHERE id = ANY(v_ids);
    END IF;
  END IF;

  v_need_rev := v_has_prev AND v_prev.venue_retained_payment_id IS NOT NULL AND (
    NOT p_confirm OR v_inv IS NULL OR v_inv IS DISTINCT FROM v_prev.venue_retained_invoice_id
    OR abs(v_ret_amt - coalesce(v_prev.venue_retained_amount,0)) > 0.005);
  IF v_need_rev THEN
    DELETE FROM public.transaction_payments WHERE id = v_prev.venue_retained_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento de compensação anterior não encontrado'; END IF;
    UPDATE public.ticket_office_settlements SET venue_retained_payment_id = NULL WHERE id = v_id;
  END IF;

  IF p_confirm AND v_ret_amt > 0 AND v_inv IS NOT NULL
     AND (v_need_rev OR NOT v_has_prev OR v_prev.venue_retained_payment_id IS NULL) THEN
    INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, payment_method, account_id, notes, created_by)
    VALUES (v_inv, v_ret_amt, v_date, 'compensation', NULL, p_retained_payment_notes, p_audit_user)
    RETURNING id INTO v_pay;
    UPDATE public.ticket_office_settlements SET venue_retained_payment_id = v_pay WHERE id = v_id;
  END IF;

  v_need_rev_rem := v_has_prev AND v_prev.venue_invoice_remainder_payment_id IS NOT NULL AND (
    NOT p_confirm OR NOT v_rem_applied OR v_inv IS NULL
    OR v_inv IS DISTINCT FROM v_prev.venue_retained_invoice_id
    OR abs(v_rem_amt - coalesce(v_prev.venue_invoice_remainder_amount,0)) > 0.005);
  IF v_need_rev_rem THEN
    DELETE FROM public.transaction_payments WHERE id = v_prev.venue_invoice_remainder_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento do saldo restante anterior não encontrado'; END IF;
    UPDATE public.ticket_office_settlements SET venue_invoice_remainder_payment_id = NULL WHERE id = v_id;
  END IF;

  IF p_confirm AND v_rem_applied AND v_inv IS NOT NULL
     AND (v_need_rev_rem OR NOT v_has_prev OR v_prev.venue_invoice_remainder_payment_id IS NULL) THEN
    INSERT INTO public.transaction_payments (transaction_id, amount, payment_date, payment_method, account_id, notes, created_by)
    VALUES (v_inv, v_rem_amt, v_date, 'transfer', v_office, p_remainder_payment_notes, p_audit_user)
    RETURNING id INTO v_pay;
    UPDATE public.ticket_office_settlements SET venue_invoice_remainder_payment_id = v_pay WHERE id = v_id;
  END IF;

  IF p_confirm AND v_event IS NOT NULL THEN
    UPDATE public.event_ticket_office_assignments
       SET is_conciliated = true, conciliated_at = now(), conciliated_by = coalesce(nullif(p_payload->>'conciliated_by',''), 'system')
     WHERE event_id = v_event AND financial_account_id = v_office;
  END IF;

  RETURN jsonb_build_object('settlement_id', v_id);
END;
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.tosl_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text; v_company uuid;
BEGIN
  SELECT status, company_id INTO v_status, v_company FROM public.ticket_office_statements
   WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
  IF v_status = 'confirmed' THEN
    RAISE EXCEPTION 'Apuramento Ticketline confirmado: as linhas não se alteram.';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.company_id IS DISTINCT FROM v_company THEN
    RAISE EXCEPTION 'A linha tem de ser da mesma empresa do apuramento.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
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
$function$;
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
$function$;
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
$function$;
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
$function$;
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
END $function$;
CREATE OR REPLACE FUNCTION public._assert_row_company(_company_id uuid, _ctx text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
BEGIN
  IF auth.uid() IS NULL THEN
    IF v_role = 'anon' THEN
      RAISE EXCEPTION '%: sessão anónima sem acesso', _ctx USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  IF public.is_platform_admin() THEN RETURN; END IF;
  IF _company_id IS NULL OR _company_id IS DISTINCT FROM public.current_company_id() THEN
    RAISE EXCEPTION '%: a linha não pertence à empresa activa', _ctx USING ERRCODE = '42501';
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION public._effective_permissions_for(_user_id uuid, _company_id uuid, _universe text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pa boolean := public.is_platform_admin(_user_id);
  v_roles text[];
  v_role text;
  v_full boolean;
  v_perms text[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('role', NULL, 'permissions', '[]'::jsonb);
  END IF;

  SELECT array_agg(DISTINCT role::text) INTO v_roles
    FROM public.user_roles
   WHERE user_id = _user_id
     AND (company_id = _company_id OR role = 'platform_admin'::app_role);

  SELECT r INTO v_role FROM unnest(coalesce(v_roles, '{}')) r
   ORDER BY CASE r WHEN 'platform_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2
     WHEN 'accountant' THEN 3 WHEN 'marketing_manager' THEN 4 WHEN 'content_manager' THEN 4
     WHEN 'editor' THEN 4 WHEN 'producer' THEN 4 WHEN 'field_producer' THEN 4
     WHEN 'partner' THEN 5 WHEN 'viewer' THEN 6 WHEN 'user' THEN 7 ELSE 99 END, r
   LIMIT 1;

  v_full := v_pa OR 'admin' = ANY(coalesce(v_roles, '{}'));

  WITH base AS (
    SELECT unnest(coalesce(_universe, '{}')) k WHERE v_full
    UNION SELECT permission FROM public.role_permissions WHERE v_pa
    UNION SELECT rp.permission FROM public.role_permissions rp
      WHERE rp.role::text = ANY(coalesce(v_roles, '{}'))
  ),
  ov AS (
    SELECT permission k, bool_and(granted) g FROM public.user_permissions
     WHERE user_id = _user_id AND company_id = _company_id GROUP BY 1
  ),
  eff AS (
    SELECT b.k FROM base b LEFT JOIN ov ON ov.k = b.k WHERE ov.g IS NULL OR ov.g
    UNION SELECT k FROM ov WHERE g
  )
  SELECT array_agg(k ORDER BY k) INTO v_perms FROM eff;

  RETURN jsonb_build_object(
    'role', coalesce(v_role, 'user'),
    'company_id', _company_id,
    'permissions', to_jsonb(coalesce(v_perms, '{}'))
  );
END;
$function$;
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
$function$;
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
END $function$;
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
END $function$;
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT granted FROM public.user_permissions
       WHERE user_id = _user_id AND permission = _permission
         AND company_id = public.current_company_id()
       LIMIT 1),
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission = _permission
        AND ur.company_id = public.current_company_id()
    )
  )
$function$;
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'platform_admin'::app_role
  )
$function$;
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
$function$;
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
END $function$;
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
$function$;
CREATE OR REPLACE FUNCTION public.reverse_ticket_office_settlement(p_settlement_id uuid, p_reason text, p_caller_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_s record;
  v_key text;
  v_exp uuid[];
  v_n int;
  v_counts jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão em falta' USING ERRCODE = '42501'; END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.is_platform_admin()) THEN
    RAISE EXCEPTION 'Só um admin pode estornar um fecho de bilheteira.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'Motivo do estorno obrigatório' USING ERRCODE = '22023'; END IF;

  SELECT * INTO v_s FROM ticket_office_settlements WHERE id = p_settlement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fecho não encontrado' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.row_belongs_to_current_company(v_s.company_id) THEN RAISE EXCEPTION 'Fecho de outra empresa' USING ERRCODE = '42501'; END IF;
  IF v_s.status = 'reversed' THEN RAISE EXCEPTION 'Fecho já estornado' USING ERRCODE = 'P0001'; END IF;

  IF v_s.transfer_transaction_id IS NOT NULL THEN
    SELECT operation_key INTO v_key FROM transactions WHERE id = v_s.transfer_transaction_id;
    UPDATE ticket_office_settlements SET transfer_transaction_id = NULL WHERE id = p_settlement_id;
    IF v_key IS NOT NULL THEN
      DELETE FROM transactions WHERE operation_key = v_key;
    ELSE
      DELETE FROM transactions WHERE id = v_s.transfer_transaction_id;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('transfer_legs', v_n);
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO v_exp FROM transactions WHERE settlement_id = p_settlement_id AND type = 'expense';
  DELETE FROM transaction_payments WHERE transaction_id = ANY(v_exp);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('payments', v_n);
  UPDATE transactions SET settlement_id = NULL, status = 'pending', payment_date = NULL, paid_amount = 0, account_id = NULL
   WHERE id = ANY(v_exp);
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('expenses', v_n);

  UPDATE event_ticket_office_advances SET settlement_id = NULL WHERE settlement_id = p_settlement_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('advances', v_n);

  UPDATE ticket_office_settlements SET status = 'reversed', reversed_at = now(), reversed_by = v_uid,
         reversal_reason = p_reason, transfer_transaction_id = NULL, net_transferred = 0, transfer_account_id = NULL
   WHERE id = p_settlement_id;

  UPDATE event_ticket_office_assignments SET is_conciliated = false, conciliated_at = NULL, conciliated_by = NULL
   WHERE event_id = v_s.event_id AND financial_account_id = v_s.financial_account_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('assignments', v_n);

  INSERT INTO system_audit_log (entity_type, entity_id, action, changed_by, metadata, company_id)
  VALUES ('ticket_office_settlement', p_settlement_id::text, 'reverse', coalesce(nullif(trim(p_caller_name), ''), v_uid::text),
          jsonb_build_object('reason', p_reason, 'counts', v_counts), v_s.company_id);

  RETURN jsonb_build_object('settlement_id', p_settlement_id, 'counts', v_counts);
END $function$;
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
$function$;
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
END $function$;
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.ticket_office_settlements FOR EACH ROW EXECUTE FUNCTION set_company_id_on_insert();
CREATE TRIGGER trg_settlements_updated_at BEFORE UPDATE ON public.ticket_office_settlements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_tosl_guard BEFORE INSERT OR DELETE OR UPDATE ON public.ticket_office_statement_lines FOR EACH ROW EXECUTE FUNCTION tosl_guard();
CREATE TRIGGER enforce_payment_date_not_future BEFORE INSERT OR UPDATE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION validate_payment_date_not_future();
CREATE TRIGGER trg_apply_transaction_offsets AFTER INSERT OR DELETE OR UPDATE OF status, reversed_at ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION apply_transaction_offsets();
CREATE TRIGGER trg_clear_reversal_on_repay AFTER INSERT ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION clear_reversal_on_repay();
CREATE TRIGGER trg_enforce_payment_list_batch_channel BEFORE INSERT ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION enforce_payment_list_batch_channel();
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION set_company_id_on_insert();
CREATE TRIGGER trg_sync_paid_amount_from_payments AFTER INSERT OR DELETE OR UPDATE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION sync_paid_amount_from_payments();
CREATE TRIGGER trg_validate_installments_total BEFORE INSERT OR UPDATE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION validate_installments_total();
CREATE TRIGGER update_transaction_payments_updated_at BEFORE UPDATE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER zz_camarim_session_leg_follows_bank AFTER INSERT OR DELETE OR UPDATE ON public.transaction_payments FOR EACH ROW EXECUTE FUNCTION trg_camarim_session_leg_follows_bank();
CREATE TRIGGER enforce_paid_payment_date BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION validate_paid_requires_payment_date();
CREATE TRIGGER enforce_transaction_approval_permission BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION enforce_transaction_approval_permission();
CREATE TRIGGER trg_card_load_on_out_delete BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION card_load_on_out_delete();
CREATE TRIGGER trg_card_load_on_out_paid AFTER UPDATE OF status ON public.transactions FOR EACH ROW EXECUTE FUNCTION card_load_on_out_paid();
CREATE TRIGGER trg_coala_capture_category_change AFTER INSERT OR UPDATE OF category_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION coala_capture_category_change();
CREATE TRIGGER trg_enforce_admin_window_event BEFORE INSERT OR UPDATE OF event_id, category_id, date, company_id, type ON public.transactions FOR EACH ROW EXECUTE FUNCTION enforce_admin_window_event();
CREATE TRIGGER trg_enforce_held_revenue_is_paid BEFORE INSERT OR UPDATE OF held_by_supplier_id, status ON public.transactions FOR EACH ROW EXECUTE FUNCTION enforce_held_revenue_is_paid();
CREATE TRIGGER trg_enforce_tx_forecast_same_event BEFORE INSERT OR UPDATE OF forecast_id, event_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION enforce_tx_forecast_same_event();
CREATE TRIGGER trg_enforce_tx_paid_requires_account BEFORE INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION enforce_tx_paid_requires_account();
CREATE TRIGGER trg_force_confidential_restricted_account BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION force_confidential_for_restricted_account();
CREATE TRIGGER trg_force_exclude_result_shared_cost BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION force_exclude_from_result_for_shared_cost();
CREATE TRIGGER trg_force_no_account_on_compensation BEFORE INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION force_no_account_on_compensation();
CREATE TRIGGER trg_force_transitory_capital BEFORE INSERT OR UPDATE OF category_id, is_transitory ON public.transactions FOR EACH ROW EXECUTE FUNCTION force_transitory_for_capital_branch();
CREATE TRIGGER trg_realign_tx_category_from_forecast AFTER UPDATE OF category_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION realign_tx_category_from_forecast();
CREATE TRIGGER trg_reimbursement_propagate_payment AFTER INSERT OR UPDATE OF status, paid_amount, payment_date ON public.transactions FOR EACH ROW EXECUTE FUNCTION reimbursement_propagate_payment();
CREATE TRIGGER trg_reimbursement_revert_on_tx_delete BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION reimbursement_revert_on_tx_delete();
CREATE TRIGGER trg_set_company_id BEFORE INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION set_company_id_on_insert();
CREATE TRIGGER trg_sync_partner_aporte_mirror AFTER INSERT OR UPDATE OF paid_amount, account_id, status, payment_date, reversed_at, description ON public.transactions FOR EACH ROW EXECUTE FUNCTION sync_partner_aporte_mirror();
CREATE TRIGGER trg_sync_partner_aporte_mirror_del BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION sync_partner_aporte_mirror();
CREATE TRIGGER trg_sync_shared_cost_mirror AFTER INSERT OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION sync_shared_cost_mirror();
CREATE TRIGGER trg_sync_shared_cost_mirror_del BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION sync_shared_cost_mirror();
CREATE TRIGGER trg_sync_tx_forecast_to_anchor AFTER INSERT OR UPDATE OF forecast_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION sync_tx_forecast_to_anchor();
CREATE TRIGGER trg_unlink_forecasts_on_tx_event_change AFTER UPDATE OF event_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION unlink_forecasts_on_tx_event_change();
CREATE TRIGGER trg_validate_paid_amount_not_exceeds_gross BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION validate_paid_amount_not_exceeds_gross();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER validate_transaction_event_settlement BEFORE INSERT OR UPDATE OF event_settlement_id, event_id ON public.transactions FOR EACH ROW EXECUTE FUNCTION validate_transaction_event_settlement();
CREATE TRIGGER zz_audit_transactions_change AFTER INSERT OR DELETE OR UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION audit_transactions_change();
CREATE TRIGGER zz_guard_paid_amount_vs_payments BEFORE UPDATE OF paid_amount ON public.transactions FOR EACH ROW EXECUTE FUNCTION guard_paid_amount_vs_payments();
CREATE TRIGGER zz_materialize_paid_amount_payment AFTER INSERT OR UPDATE OF paid_amount ON public.transactions FOR EACH ROW EXECUTE FUNCTION materialize_paid_amount_payment();
CREATE TRIGGER zz_rederive_paid_amount_on_amount_change AFTER UPDATE OF amount, iva_rate ON public.transactions FOR EACH ROW EXECUTE FUNCTION rederive_paid_amount_on_amount_change();
SET check_function_bodies = on;
