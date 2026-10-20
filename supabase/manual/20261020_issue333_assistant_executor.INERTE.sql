-- #333 fase12e — executor Ticketline autorizado. INERTE: NÃO aplicar sem revisão e "Sim" do Pedro.
-- Pré-requisito: 20261020_issue333_assistant_review.INERTE.sql (12d) aplicado. Aditivo, bloco único, lock_timeout 5s.
-- Identidade: SÓ auth.uid() e current_company_id() da sessão (JWT do chamador). Não há argumento de actor/empresa,
-- porque os writers canónicos (confirm_ticket_office_statement, regras de crédito do fecho) também dependem da sessão.
-- Carrega versão/efeitos SÓ da revisão persistida; recalcula o hash; executa apenas ações autorizadas cujas
-- dependências já têm execução conferida. Escrita + conferência + registo da execução na MESMA transação:
-- não existe estado "a meio"; resposta perdida recupera-se por leitura (modo 'status'), nunca por repetição cega.
-- Writers reutilizados:
--   a1 → INSERT ticket_office_statements/lines (mesmas colunas do ecrã Apuramentos), estado draft.
--   a2 → PERFORM public.confirm_ticket_office_statement(id) (writer canónico, sem cópia).
--   a4 → só leitura (transações pendentes do evento); nenhuma despesa criada.
--   a3 → HUMANO no modal (save_ticket_office_settlement); o executor só confere o fecho confirmado.
--   a5 → regra do painel "Confirmar crédito" (TicketOfficeSettlementsPanel): as duas pernas TRF-FECHO pendentes
--         passam a paid com payment_date e paid_amount=amount; nunca cria transação/pagamento novo; já pago = conferência.
-- Não toca #322 nem os componentes reservados #323.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $g$ BEGIN
  IF to_regclass('public.data_entry_assistant_authorizations_333') IS NULL OR to_regprocedure('public._de333_canon(jsonb)') IS NULL
  THEN RAISE EXCEPTION 'review_schema_12d_missing'; END IF;
  IF to_regclass('public.data_entry_assistant_executor_settings_333') IS NOT NULL OR to_regclass('public.data_entry_assistant_executions_333') IS NOT NULL
     OR to_regprocedure('public.data_entry_assistant_execute_333(text,uuid,text)') IS NOT NULL
  THEN RAISE EXCEPTION 'executor_absent_objects_drift'; END IF;
  IF to_regprocedure('public.confirm_ticket_office_statement(uuid)') IS NULL THEN RAISE EXCEPTION 'canonical_writer_missing'; END IF;
END $g$;

CREATE TABLE public.data_entry_assistant_executor_settings_333 (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), enabled boolean NOT NULL DEFAULT false, changed_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.data_entry_assistant_executor_settings_333 DEFAULT VALUES;

CREATE TABLE public.data_entry_assistant_executions_333 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_id uuid NOT NULL REFERENCES public.data_entry_assistant_authorizations_333(id),
  action_id text NOT NULL CHECK (action_id IN ('a1','a2','a3','a4','a5')),
  owner_id uuid NOT NULL, company_id uuid NOT NULL, effects_hash text NOT NULL CHECK (effects_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'succeeded' CHECK (status = 'succeeded'),
  result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (authorization_id, action_id));
CREATE TRIGGER de333_exec_immutable BEFORE UPDATE OR DELETE ON public.data_entry_assistant_executions_333 FOR EACH ROW EXECUTE FUNCTION public._de333_immutable();
CREATE TRIGGER de333_exec_no_truncate BEFORE TRUNCATE ON public.data_entry_assistant_executions_333 FOR EACH STATEMENT EXECUTE FUNCTION public._de333_immutable();

CREATE FUNCTION public.data_entry_assistant_execute_333(p_mode text, p_authorization uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE
  v_uid uuid := auth.uid(); v_company uuid; a public.data_entry_assistant_authorizations_333; v public.data_entry_assistant_review_versions_333;
  cur_version integer; act jsonb; e jsonb; ex public.data_entry_assistant_executions_333; res jsonb; dep text;
  v_office uuid; v_event uuid; v_st uuid; v_n int; v_sum numeric; s record; t record; v_amount numeric; v_date date; v_legs int;
BEGIN
  IF p_mode = 'probe' THEN
    RETURN jsonb_build_object('schema', '333-12e', 'enabled', coalesce((SELECT enabled FROM public.data_entry_assistant_executor_settings_333 WHERE singleton), false));
  END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
  v_company := public.current_company_id();
  IF v_company IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until <= now()))
     OR NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company AND status = 'active')
     OR coalesce(public._effective_permissions_for(v_uid, v_company, '{}'::text[])->>'role', '') NOT IN ('admin', 'manager')
  THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;

  IF p_mode = 'status' THEN
    SELECT * INTO a FROM public.data_entry_assistant_authorizations_333 WHERE id = p_authorization;
    IF NOT FOUND OR a.owner_id <> v_uid OR a.company_id <> v_company THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('authorization_id', a.id, 'action_ids', to_jsonb(a.action_ids), 'executions',
      coalesce((SELECT jsonb_agg(jsonb_build_object('action_id', x.action_id, 'status', x.status, 'result', x.result, 'at', x.created_at) ORDER BY x.created_at)
        FROM public.data_entry_assistant_executions_333 x WHERE x.authorization_id = a.id), '[]'::jsonb));
  END IF;
  IF p_mode <> 'execute' THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '22023'; END IF;
  IF NOT coalesce((SELECT enabled FROM public.data_entry_assistant_executor_settings_333 WHERE singleton), false) THEN RAISE EXCEPTION '#333: executor_closed' USING ERRCODE = '42501'; END IF;

  -- Serializa execuções da mesma autorização (concorrência: a 2.ª espera e vê a 1.ª).
  SELECT * INTO a FROM public.data_entry_assistant_authorizations_333 WHERE id = p_authorization FOR UPDATE;
  IF NOT FOUND OR a.owner_id <> v_uid OR a.company_id <> v_company THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
  SELECT * INTO ex FROM public.data_entry_assistant_executions_333 WHERE authorization_id = a.id AND action_id = p_action;
  IF FOUND THEN RETURN jsonb_build_object('action_id', p_action, 'status', ex.status, 'replayed', true, 'result', ex.result); END IF;
  IF p_action IS NULL OR NOT (p_action = ANY (a.action_ids)) THEN RAISE EXCEPTION '#333: action_not_authorized' USING ERRCODE = 'P0001'; END IF;

  SELECT version INTO cur_version FROM public.data_entry_assistant_reviews_333 WHERE id = a.review_id;
  IF cur_version IS DISTINCT FROM a.version THEN RAISE EXCEPTION '#333: stale_version' USING ERRCODE = '40001'; END IF;
  SELECT * INTO v FROM public.data_entry_assistant_review_versions_333 WHERE review_id = a.review_id AND version = a.version;
  IF NOT FOUND OR v.effects_hash <> a.effects_hash
     OR encode(sha256(convert_to(public._de333_canon(jsonb_build_object('effects', v.proposal->'effects', 'actions', v.proposal->'actions')), 'UTF8')), 'hex') <> a.effects_hash
  THEN RAISE EXCEPTION '#333: hash_mismatch' USING ERRCODE = '22023'; END IF;
  e := v.proposal->'effects';
  IF e->>'company' IS DISTINCT FROM v_company::text OR v.proposal->>'company_id' IS DISTINCT FROM v_company::text OR coalesce((e->>'human_reviewed')::boolean, false) IS NOT TRUE
  THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
  SELECT x INTO act FROM jsonb_array_elements(v.proposal->'actions') x WHERE x->>'id' = p_action;
  IF act IS NULL OR act->'blocked_reason' <> 'null'::jsonb THEN RAISE EXCEPTION '#333: actions_blocked' USING ERRCODE = 'P0001'; END IF;
  FOR dep IN SELECT jsonb_array_elements_text(act->'depends_on') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.data_entry_assistant_executions_333 WHERE authorization_id = a.id AND action_id = dep)
    THEN RAISE EXCEPTION '#333: dependency_pending' USING ERRCODE = 'P0001'; END IF;
  END LOOP;
  v_event := nullif(e->>'event', '')::uuid;

  IF p_action = 'a1' THEN
    v_office := nullif(e->>'office', '')::uuid;
    IF v_office IS NULL OR v_event IS NULL OR e->>'number' IS NULL OR e->>'date' IS NULL OR e->'total' = 'null'::jsonb THEN RAISE EXCEPTION '#333: data_incomplete' USING ERRCODE = 'P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = v_office AND company_id = v_company AND type = 'ticket_office' AND is_active)
       OR NOT EXISTS (SELECT 1 FROM public.events WHERE id = v_event AND company_id = v_company)
    THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.ticket_office_settlements WHERE event_id = v_event AND company_id = v_company AND status = 'confirmed' AND reversed_at IS NULL)
    THEN RAISE EXCEPTION '#333: event_sealed' USING ERRCODE = 'P0001'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('de333:stmt:' || v_company::text || ':' || upper(btrim(e->>'number'))));
    IF EXISTS (SELECT 1 FROM public.ticket_office_statements WHERE company_id = v_company AND upper(btrim(number)) = upper(btrim(e->>'number')))
    THEN RAISE EXCEPTION '#333: duplicate_statement' USING ERRCODE = '23505'; END IF;
    INSERT INTO public.ticket_office_statements(company_id, financial_account_id, number, statement_date, document_total, status, created_by, notes)
    VALUES (v_company, v_office, btrim(e->>'number'), (e->>'date')::date, (e->>'total')::numeric / 100, 'draft', v_uid,
            '#333 assistente: revisão ' || a.review_id || ' v' || a.version) RETURNING id INTO v_st;
    INSERT INTO public.ticket_office_statement_lines(statement_id, company_id, line_type, position, description, amount, event_id)
    SELECT v_st, v_company, l->>'line_type', (o - 1)::int, left(l->>'description', 160), (l->>'amount_cents')::numeric / 100, v_event
    FROM jsonb_array_elements(e->'lines') WITH ORDINALITY AS z(l, o);
    SELECT count(*), coalesce(sum(amount), 0) INTO v_n, v_sum FROM public.ticket_office_statement_lines WHERE statement_id = v_st;
    IF v_n <> jsonb_array_length(e->'lines') OR round(v_sum * 100) <> (SELECT coalesce(sum((l->>'amount_cents')::numeric), 0) FROM jsonb_array_elements(e->'lines') l)
    THEN RAISE EXCEPTION '#333: readback_mismatch' USING ERRCODE = 'P0001'; END IF;
    res := jsonb_build_object('statement_id', v_st, 'number', btrim(e->>'number'), 'office_id', v_office, 'lines', v_n, 'sum_cents', round(v_sum * 100));

  ELSIF p_action = 'a2' THEN
    SELECT (x.result->>'statement_id')::uuid INTO v_st FROM public.data_entry_assistant_executions_333 x WHERE x.authorization_id = a.id AND x.action_id = 'a1';
    SELECT * INTO s FROM public.ticket_office_statements WHERE id = v_st AND company_id = v_company FOR UPDATE;
    IF NOT FOUND OR s.status <> 'draft' OR round(coalesce(s.document_total, 0) * 100) <> (e->>'total')::numeric OR upper(btrim(s.number)) <> upper(btrim(e->>'number'))
    THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    SELECT count(*), coalesce(sum(amount), 0) INTO v_n, v_sum FROM public.ticket_office_statement_lines WHERE statement_id = v_st;
    IF v_n <> jsonb_array_length(e->'lines') OR round(v_sum * 100) <> (SELECT coalesce(sum((l->>'amount_cents')::numeric), 0) FROM jsonb_array_elements(e->'lines') l)
    THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    PERFORM public.confirm_ticket_office_statement(v_st);
    IF NOT EXISTS (SELECT 1 FROM public.ticket_office_statements WHERE id = v_st AND status = 'confirmed') THEN RAISE EXCEPTION '#333: readback_mismatch' USING ERRCODE = 'P0001'; END IF;
    res := jsonb_build_object('statement_id', v_st, 'number', s.number, 'office_id', s.financial_account_id, 'status', 'confirmed');

  ELSIF p_action = 'a4' THEN
    SELECT count(*) INTO v_n FROM public.transactions WHERE event_id = v_event AND company_id = v_company AND type = 'expense' AND status = 'pending';
    res := jsonb_build_object('event_id', v_event, 'pending_expenses', v_n, 'writes', 0);

  ELSIF p_action = 'a3' THEN
    SELECT * INTO s FROM public.ticket_office_settlements WHERE event_id = v_event AND company_id = v_company AND status = 'confirmed' AND reversed_at IS NULL
      AND (nullif(e->>'office', '') IS NULL OR financial_account_id = (e->>'office')::uuid) ORDER BY closed_at DESC NULLS LAST LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION '#333: awaiting_human_modal' USING ERRCODE = 'P0001'; END IF;
    res := jsonb_build_object('settlement_id', s.id, 'office_id', s.financial_account_id, 'net_transferred_cents', round(s.net_transferred * 100), 'transfer_transaction_id', s.transfer_transaction_id);

  ELSIF p_action = 'a5' THEN
    IF e->'settlement' IS NULL OR e->'settlement' = 'null'::jsonb OR e->'canonical' IS NULL OR e->'canonical' = 'null'::jsonb THEN RAISE EXCEPTION '#333: data_incomplete' USING ERRCODE = 'P0001'; END IF;
    IF NOT (public.has_role(v_uid, 'admin') OR public.is_platform_admin(v_uid) OR public.has_permission(v_uid, 'manage_accounts'))
    THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
    v_amount := (e->'settlement'->>'amount_cents')::numeric / 100; v_date := (e->'settlement'->>'date')::date;
    IF v_date > (now() AT TIME ZONE 'Europe/Lisbon')::date THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO s FROM public.ticket_office_settlements WHERE event_id = v_event AND company_id = v_company AND status = 'confirmed' AND reversed_at IS NULL FOR UPDATE;
    IF NOT FOUND OR s.transfer_transaction_id IS NULL OR s.transfer_account_id::text IS DISTINCT FROM e->'settlement'->>'account'
       OR s.transfer_account_id::text IS DISTINCT FROM e->'canonical'->>'transfer_account_id'
       OR round(s.net_transferred * 100) <> (e->'settlement'->>'amount_cents')::numeric OR round(s.net_transferred * 100) <> (e->'canonical'->>'net_transferred_cents')::numeric
       OR v_date < s.settlement_date
    THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO t FROM public.transactions WHERE id = s.transfer_transaction_id AND company_id = v_company;
    IF NOT FOUND OR t.operation_key IS NULL OR t.reversed_at IS NOT NULL OR t.amount <> v_amount THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    PERFORM 1 FROM public.transactions WHERE operation_key = t.operation_key AND company_id = v_company FOR UPDATE;
    SELECT count(*) INTO v_legs FROM public.transactions WHERE operation_key = t.operation_key AND company_id = v_company;
    IF v_legs <> 2 THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE operation_key = t.operation_key AND company_id = v_company AND status <> 'paid') THEN
      res := jsonb_build_object('settlement_id', s.id, 'transfer_transaction_id', t.id, 'operation_key', t.operation_key, 'already_liquidated', true, 'writes', 0);
    ELSE
      IF EXISTS (SELECT 1 FROM public.transactions WHERE operation_key = t.operation_key AND company_id = v_company AND (status = 'paid' OR reversed_at IS NOT NULL OR amount <> v_amount))
      THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
      UPDATE public.transactions SET status = 'paid', payment_date = v_date, paid_amount = amount
       WHERE operation_key = t.operation_key AND company_id = v_company AND status <> 'paid';
      IF (SELECT count(*) FROM public.transactions WHERE operation_key = t.operation_key AND company_id = v_company AND status = 'paid' AND paid_amount = v_amount AND payment_date = v_date) <> 2
      THEN RAISE EXCEPTION '#333: readback_mismatch' USING ERRCODE = 'P0001'; END IF;
      res := jsonb_build_object('settlement_id', s.id, 'transfer_transaction_id', t.id, 'operation_key', t.operation_key, 'already_liquidated', false, 'payment_date', v_date, 'amount_cents', round(v_amount * 100), 'writes', 2);
    END IF;
  ELSE RAISE EXCEPTION '#333: action_not_authorized' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.data_entry_assistant_executions_333(authorization_id, action_id, owner_id, company_id, effects_hash, result)
  VALUES (a.id, p_action, v_uid, v_company, a.effects_hash, res) RETURNING * INTO ex;
  RETURN jsonb_build_object('action_id', p_action, 'status', ex.status, 'replayed', false, 'result', ex.result);
END $f$;

DO $acl$ DECLARE o text; g text; BEGIN
  FOREACH o IN ARRAY ARRAY['public.data_entry_assistant_executor_settings_333','public.data_entry_assistant_executions_333'] LOOP
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', o);
    FOR g IN SELECT DISTINCT x.grantee::regrole::text FROM pg_class c, aclexplode(c.relacl) x WHERE c.oid = o::regclass AND x.grantee <> 0 AND x.grantee <> c.relowner LOOP
      EXECUTE format('REVOKE ALL ON %s FROM %s', o, g); END LOOP;
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', o);
    EXECUTE format('GRANT SELECT ON %s TO service_role', o);
  END LOOP;
  o := 'public.data_entry_assistant_execute_333(text,uuid,text)';
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', o);
  FOR g IN SELECT DISTINCT x.grantee::regrole::text FROM pg_proc p, aclexplode(p.proacl) x WHERE p.oid = o::regprocedure AND x.grantee <> 0 AND x.grantee <> p.proowner LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', o, g); END LOOP;
  -- Só authenticated: a identidade tem de ser a sessão do chamador (auth.uid()); service_role não tem sessão de utilizador.
  GRANT EXECUTE ON FUNCTION public.data_entry_assistant_execute_333(text,uuid,text) TO authenticated;
END $acl$;
COMMIT;
