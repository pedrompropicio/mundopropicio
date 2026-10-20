-- #333 fase12f — executor Ticketline autorizado (substitui o 12e). INERTE: NÃO aplicar sem revisão e "Sim" do Pedro.
-- Pré-requisito: 20261020_issue333_assistant_review.INERTE.sql (esquema '333-12f') aplicado. Aditivo, bloco único, lock_timeout 5s.
-- Identidade: SÓ auth.uid() e current_company_id() da sessão (JWT do chamador); EXECUTE só authenticated.
-- Gate próprio + âmbito nominal com expiração (data_entry_assistant_scope_333) verificados AQUI, não só no servidor.
-- Contrato de ações fixo no SQL (ids, tipos e dependências); proposta/efeitos vêm SÓ da versão persistida; hash recalculado.
-- Escrita + conferência + registo na MESMA transação; resposta perdida recupera-se por 'status', nunca por repetição cega.
-- Writers canónicos chamados tal como estão (sem cópia de regras):
--   a1 → INSERT ticket_office_statements/lines (colunas do ecrã Apuramentos; trigger tosl_guard real), estado draft.
--   a2 → public.confirm_ticket_office_statement(id).
--   a4 → conferência das deduções escolhidas na revisão contra a elegibilidade do modal (0 escritas).
--   a3 → public.save_ticket_office_settlement(NULL, payload, true, deduções, transferência 'a receber', …): o MESMO RPC do
--        modal de fecho; receita bruta recalculada aqui (ticket_sales da bilheteira, total_value ou quantity×unit_price),
--        deduções re-conferidas, líquido = bruto − deduções (sem retido/fatura/ajuste: esses casos ficam no modal).
--   a5 → regra "Confirmar crédito" (TicketOfficeSettlementsPanel): UPDATE status/payment_date/paid_amount das 2 pernas
--        TRF-FECHO; os triggers reais materializam 1 transaction_payments por perna (prova canon12f). Nunca cria transação.
-- Não toca #322 nem os componentes reservados #323.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $g$ BEGIN
  IF to_regclass('public.data_entry_assistant_authorizations_333') IS NULL OR to_regclass('public.data_entry_assistant_scope_333') IS NULL
     OR to_regprocedure('public._de333_canon(jsonb)') IS NULL
  THEN RAISE EXCEPTION 'review_schema_12f_missing'; END IF;
  IF to_regclass('public.data_entry_assistant_executor_settings_333') IS NOT NULL OR to_regclass('public.data_entry_assistant_executions_333') IS NOT NULL
     OR to_regprocedure('public.data_entry_assistant_execute_333(text,uuid,text)') IS NOT NULL OR to_regprocedure('public._de333_closing_check(jsonb,uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'executor_absent_objects_drift'; END IF;
  IF to_regprocedure('public.confirm_ticket_office_statement(uuid)') IS NULL
     OR to_regprocedure('public.save_ticket_office_settlement(uuid,jsonb,boolean,jsonb,jsonb,text,text,text)') IS NULL
  THEN RAISE EXCEPTION 'canonical_writer_missing'; END IF;
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

-- Re-conferência do plano de fecho revisto contra o ERP atual, com as mesmas regras do modal
-- (TicketOfficeSettlementModal + isSettlementEligibleTxn). Devolve a receita bruta exata; recusa qualquer divergência.
CREATE FUNCTION public._de333_closing_check(c jsonb, p_company uuid) RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $k$
DECLARE v_office uuid := (c->>'office')::uuid; v_event uuid := (c->>'event')::uuid; v_to uuid := (c->>'transfer_account')::uuid;
  v_gross numeric; v_n int; d jsonb; t record; v_sum bigint := 0;
BEGIN
  IF v_office IS NULL OR v_event IS NULL OR v_to IS NULL OR c->>'settlement_date' IS NULL OR jsonb_typeof(c->'deductions') <> 'array'
  THEN RAISE EXCEPTION '#333: data_incomplete' USING ERRCODE = 'P0001'; END IF;
  IF (c->>'settlement_date')::date > (now() AT TIME ZONE 'Europe/Lisbon')::date THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = v_office AND company_id = p_company AND type = 'ticket_office' AND is_active)
     OR NOT EXISTS (SELECT 1 FROM public.financial_accounts WHERE id = v_to AND company_id = p_company AND is_active AND type IN ('bank','cash','venue') AND id <> v_office)
     OR NOT EXISTS (SELECT 1 FROM public.events WHERE id = v_event AND company_id = p_company)
     OR NOT EXISTS (SELECT 1 FROM public.event_ticket_office_assignments WHERE event_id = v_event AND financial_account_id = v_office)
  THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.ticket_office_settlements WHERE event_id = v_event AND company_id = p_company AND status <> 'reversed' AND reversed_at IS NULL)
  THEN RAISE EXCEPTION '#333: event_sealed' USING ERRCODE = 'P0001'; END IF;
  SELECT count(*), coalesce(sum(coalesce(s.total_value, s.quantity * s.unit_price)), 0) INTO v_n, v_gross
    FROM public.ticket_sales s JOIN public.event_ticket_zones z ON z.id = s.zone_id
   WHERE z.event_id = v_event AND s.financial_account_id = v_office;
  IF v_n = 0 OR round(v_gross * 100) <> (c->>'gross_cents')::bigint THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
  IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(c->'deductions') x) <> jsonb_array_length(c->'deductions')
  THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
  FOR d IN SELECT x FROM jsonb_array_elements(c->'deductions') x LOOP
    SELECT * INTO t FROM public.transactions WHERE id = (d->>'id')::uuid FOR UPDATE;
    IF NOT FOUND OR t.company_id <> p_company OR t.type <> 'expense' OR t.settlement_id IS NOT NULL OR coalesce(t.exclude_from_result, false)
       OR coalesce(t.operation_key, '') LIKE 'TRF-FECHO-%' OR t.reversed_at IS NOT NULL
       OR NOT (t.status IN ('pending','approved') OR (t.status = 'paid' AND t.account_id = v_office))
       OR NOT (t.event_id = v_event OR EXISTS (SELECT 1 FROM public.transactions sp WHERE sp.parent_transaction_id = t.id AND sp.event_id = v_event AND sp.type = 'expense'))
       OR EXISTS (SELECT 1 FROM public.event_ticket_office_advances a WHERE a.event_id = v_event AND a.financial_account_id = v_office AND a.transaction_id = t.id)
       OR EXISTS (SELECT 1 FROM public.ticket_office_statement_lines l WHERE l.transaction_id = t.id AND l.line_type IN ('advance','carry_over'))
       OR round(round(t.amount * (1 + coalesce(t.iva_rate, 0) / 100.0), 2) * 100) <> (d->>'gross_cents')::bigint
    THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    v_sum := v_sum + (d->>'gross_cents')::bigint;
  END LOOP;
  IF v_sum <> (c->>'deductions_cents')::bigint OR (c->>'net_cents')::bigint <> round(v_gross * 100) - v_sum OR (c->>'net_cents')::bigint <= 0
     OR (c->>'event_right_cents')::bigint IS DISTINCT FROM (c->>'net_cents')::bigint
  THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
  RETURN v_gross;
END $k$;

CREATE FUNCTION public.data_entry_assistant_execute_333(p_mode text, p_authorization uuid, p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE
  v_uid uuid := auth.uid(); v_company uuid; a public.data_entry_assistant_authorizations_333; v public.data_entry_assistant_review_versions_333;
  cur_version integer; act jsonb; e jsonb; c jsonb; ex public.data_entry_assistant_executions_333; res jsonb; dep text; x jsonb;
  v_office uuid; v_event uuid; v_st uuid; v_n int; v_sum numeric; s record; t record; v_amount numeric; v_date date;
  v_gross numeric; v_set uuid; v_email text; v_key text; v_legs int; v_bad int; v_paid int;
BEGIN
  IF p_mode = 'probe' THEN
    RETURN jsonb_build_object('schema', '333-12f', 'enabled', coalesce((SELECT enabled FROM public.data_entry_assistant_executor_settings_333 WHERE singleton), false));
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
      coalesce((SELECT jsonb_agg(jsonb_build_object('action_id', y.action_id, 'status', y.status, 'result', y.result, 'at', y.created_at) ORDER BY y.created_at)
        FROM public.data_entry_assistant_executions_333 y WHERE y.authorization_id = a.id), '[]'::jsonb));
  END IF;
  IF p_mode <> 'execute' THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '22023'; END IF;
  IF NOT coalesce((SELECT enabled FROM public.data_entry_assistant_executor_settings_333 WHERE singleton), false) THEN RAISE EXCEPTION '#333: executor_closed' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.data_entry_assistant_scope_333 WHERE owner_id = v_uid AND company_id = v_company AND expires_at > now())
  THEN RAISE EXCEPTION '#333: scope_closed' USING ERRCODE = '42501'; END IF;

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
  -- Contrato de ações fixo (server-owned): ids, tipos e dependências; a5 depende de a3 ou, com fecho já confirmado, de nada.
  FOR x IN SELECT y FROM jsonb_array_elements(v.proposal->'actions') y LOOP
    IF NOT ((x->>'id', x->>'kind', x->'depends_on') IN (('a1','create_statement','[]'::jsonb), ('a2','confirm_statement','["a1"]'::jsonb),
        ('a4','verify_deductions','["a2"]'::jsonb), ('a3','save_settlement','["a4"]'::jsonb), ('a5','register_liquidation','["a3"]'::jsonb), ('a5','register_liquidation','[]'::jsonb)))
    THEN RAISE EXCEPTION '#333: actions_blocked' USING ERRCODE = 'P0001'; END IF;
  END LOOP;
  e := v.proposal->'effects';
  IF e->>'company' IS DISTINCT FROM v_company::text OR v.proposal->>'company_id' IS DISTINCT FROM v_company::text OR coalesce((e->>'human_reviewed')::boolean, false) IS NOT TRUE
  THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
  SELECT y INTO act FROM jsonb_array_elements(v.proposal->'actions') y WHERE y->>'id' = p_action;
  IF act IS NULL OR act->'blocked_reason' <> 'null'::jsonb THEN RAISE EXCEPTION '#333: actions_blocked' USING ERRCODE = 'P0001'; END IF;
  FOR dep IN SELECT jsonb_array_elements_text(act->'depends_on') LOOP
    IF NOT (dep = ANY (a.action_ids)) OR NOT EXISTS (SELECT 1 FROM public.data_entry_assistant_executions_333 WHERE authorization_id = a.id AND action_id = dep)
    THEN RAISE EXCEPTION '#333: dependency_pending' USING ERRCODE = 'P0001'; END IF;
  END LOOP;
  v_event := nullif(e->>'event', '')::uuid;
  v_office := nullif(e->>'office', '')::uuid;

  IF p_action = 'a1' THEN
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
    SELECT (y.result->>'statement_id')::uuid INTO v_st FROM public.data_entry_assistant_executions_333 y WHERE y.authorization_id = a.id AND y.action_id = 'a1';
    SELECT * INTO s FROM public.ticket_office_statements WHERE id = v_st AND company_id = v_company FOR UPDATE;
    IF NOT FOUND OR s.status <> 'draft' OR round(coalesce(s.document_total, 0) * 100) <> (e->>'total')::numeric OR upper(btrim(s.number)) <> upper(btrim(e->>'number'))
    THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    SELECT count(*), coalesce(sum(amount), 0) INTO v_n, v_sum FROM public.ticket_office_statement_lines WHERE statement_id = v_st;
    IF v_n <> jsonb_array_length(e->'lines') OR round(v_sum * 100) <> (SELECT coalesce(sum((l->>'amount_cents')::numeric), 0) FROM jsonb_array_elements(e->'lines') l)
    THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    PERFORM public.confirm_ticket_office_statement(v_st);
    IF NOT EXISTS (SELECT 1 FROM public.ticket_office_statements WHERE id = v_st AND status = 'confirmed') THEN RAISE EXCEPTION '#333: readback_mismatch' USING ERRCODE = 'P0001'; END IF;
    res := jsonb_build_object('statement_id', v_st, 'number', s.number, 'office_id', s.financial_account_id, 'status', 'confirmed');

  ELSIF p_action IN ('a4', 'a3') THEN
    c := e->'closing';
    IF c IS NULL OR c = 'null'::jsonb OR c->>'office' IS DISTINCT FROM v_office::text OR c->>'event' IS DISTINCT FROM v_event::text
    THEN RAISE EXCEPTION '#333: data_incomplete' USING ERRCODE = 'P0001'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('de333:close:' || v_office::text || ':' || v_event::text));
    v_gross := public._de333_closing_check(c, v_company);
    IF p_action = 'a4' THEN
      res := jsonb_build_object('event_id', v_event, 'deductions', jsonb_array_length(c->'deductions'), 'deductions_cents', (c->>'deductions_cents')::bigint,
        'gross_cents', round(v_gross * 100), 'net_cents', (c->>'net_cents')::bigint, 'writes', 0);
    ELSE
      SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
      v_set := (public.save_ticket_office_settlement(NULL,
        jsonb_build_object('financial_account_id', v_office, 'event_id', v_event, 'settlement_date', c->>'settlement_date',
          'gross_revenue', v_gross, 'total_deductions', (c->>'deductions_cents')::numeric / 100, 'net_calculated', (c->>'net_cents')::numeric / 100,
          'net_adjusted', null, 'net_transferred', 0, 'transfer_account_id', null, 'venue_retained_amount', 0, 'venue_retained_invoice_id', null,
          'venue_invoice_remainder_paid', false, 'venue_invoice_remainder_amount', 0,
          'notes', '#333 assistente: revisão ' || a.review_id || ' v' || a.version, 'conciliated_by', coalesce(v_email, 'system')),
        true,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('id', d->>'id', 'paid_amount', (d->>'gross_cents')::numeric / 100)), '[]'::jsonb) FROM jsonb_array_elements(c->'deductions') d),
        jsonb_build_object('amount', (c->>'net_cents')::numeric / 100, 'to_account_id', c->>'transfer_account', 'credited', false),
        NULL, NULL, coalesce(v_email, v_uid::text)) ->> 'settlement_id')::uuid;
      SELECT * INTO s FROM public.ticket_office_settlements WHERE id = v_set;
      IF NOT FOUND OR s.status <> 'confirmed' OR s.company_id <> v_company OR round(s.net_transferred * 100) <> (c->>'net_cents')::bigint
         OR s.transfer_account_id::text IS DISTINCT FROM c->>'transfer_account' OR s.transfer_transaction_id IS NULL
         OR round(s.total_deductions * 100) <> (c->>'deductions_cents')::bigint OR round(s.net_calculated * 100) <> (c->>'net_cents')::bigint
      THEN RAISE EXCEPTION '#333: readback_mismatch' USING ERRCODE = 'P0001'; END IF;
      SELECT operation_key INTO v_key FROM public.transactions WHERE id = s.transfer_transaction_id;
      SELECT count(*) INTO v_legs FROM public.transactions WHERE company_id = v_company AND operation_key = v_key AND status = 'pending' AND paid_amount = 0 AND round(amount * 100) = (c->>'net_cents')::bigint;
      SELECT count(*) INTO v_bad FROM jsonb_array_elements(c->'deductions') d JOIN public.transactions t2 ON t2.id = (d->>'id')::uuid
        WHERE t2.settlement_id IS DISTINCT FROM v_set OR t2.status <> 'paid' OR round(t2.paid_amount * 100) <> (d->>'gross_cents')::bigint
           OR round(coalesce((SELECT sum(p.amount) FROM public.transaction_payments p WHERE p.transaction_id = t2.id AND p.status = 'paid'), 0) * 100) <> (d->>'gross_cents')::bigint;
      IF v_legs <> 2 OR v_bad <> 0 THEN RAISE EXCEPTION '#333: readback_mismatch' USING ERRCODE = 'P0001'; END IF;
      res := jsonb_build_object('settlement_id', v_set, 'event_id', v_event, 'office_id', v_office, 'net_cents', (c->>'net_cents')::bigint,
        'transfer_transaction_id', s.transfer_transaction_id, 'operation_key', v_key, 'deductions', jsonb_array_length(c->'deductions'));
    END IF;

  ELSIF p_action = 'a5' THEN
    IF e->'settlement' IS NULL OR e->'settlement' = 'null'::jsonb THEN RAISE EXCEPTION '#333: data_incomplete' USING ERRCODE = 'P0001'; END IF;
    IF NOT (public.has_role(v_uid, 'admin') OR public.is_platform_admin(v_uid) OR public.has_permission(v_uid, 'manage_accounts'))
    THEN RAISE EXCEPTION '#333: context_mismatch' USING ERRCODE = '42501'; END IF;
    v_amount := (e->'settlement'->>'amount_cents')::numeric / 100; v_date := (e->'settlement'->>'date')::date;
    IF v_date > (now() AT TIME ZONE 'Europe/Lisbon')::date THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    IF 'a3' = ANY (a.action_ids) THEN
      -- Fecho gravado por esta autorização: a referência é o plano revisto (closing) e o resultado conferido de a3.
      SELECT (y.result->>'settlement_id')::uuid INTO v_set FROM public.data_entry_assistant_executions_333 y WHERE y.authorization_id = a.id AND y.action_id = 'a3';
      IF e->'closing'->>'transfer_account' IS DISTINCT FROM e->'settlement'->>'account' OR (e->'closing'->>'net_cents')::bigint <> (e->'settlement'->>'amount_cents')::bigint
      THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
      SELECT * INTO s FROM public.ticket_office_settlements WHERE id = v_set AND company_id = v_company FOR UPDATE;
    ELSE
      IF e->'canonical' IS NULL OR e->'canonical' = 'null'::jsonb THEN RAISE EXCEPTION '#333: data_incomplete' USING ERRCODE = 'P0001'; END IF;
      SELECT * INTO s FROM public.ticket_office_settlements WHERE event_id = v_event AND company_id = v_company AND status = 'confirmed' AND reversed_at IS NULL FOR UPDATE;
      IF FOUND AND (s.transfer_account_id::text IS DISTINCT FROM e->'canonical'->>'transfer_account_id' OR round(s.net_transferred * 100) <> (e->'canonical'->>'net_transferred_cents')::numeric)
      THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    END IF;
    IF s.id IS NULL OR s.status <> 'confirmed' OR s.reversed_at IS NOT NULL OR s.transfer_transaction_id IS NULL
       OR s.transfer_account_id::text IS DISTINCT FROM e->'settlement'->>'account' OR round(s.net_transferred * 100) <> (e->'settlement'->>'amount_cents')::numeric
       OR v_date < s.settlement_date
    THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO t FROM public.transactions WHERE id = s.transfer_transaction_id AND company_id = v_company;
    IF NOT FOUND OR t.operation_key IS NULL OR t.operation_key NOT LIKE 'TRF-FECHO-%' THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    v_key := t.operation_key;
    PERFORM 1 FROM public.transactions WHERE operation_key = v_key FOR UPDATE;
    -- Integridade do par TRF-FECHO (create_settlement_transfer): perna de saída = bilheteira/ligada ao fecho; perna de entrada = conta do fecho.
    SELECT count(*) INTO v_legs FROM public.transactions WHERE operation_key = v_key;
    SELECT count(*) INTO v_bad FROM public.transactions x2 WHERE x2.operation_key = v_key AND NOT (
      x2.company_id = v_company AND x2.event_id = s.event_id AND x2.amount = v_amount AND coalesce(x2.iva_rate, 0) = 0 AND x2.reversed_at IS NULL
      AND x2.exclude_from_result AND x2.payment_method = 'transfer' AND x2.currency = 'EUR'
      AND ((x2.type = 'expense' AND x2.id = s.transfer_transaction_id AND x2.account_id = s.financial_account_id AND x2.settlement_id = s.id)
        OR (x2.type = 'income' AND x2.id <> s.transfer_transaction_id AND x2.account_id = s.transfer_account_id AND x2.settlement_id IS NULL)));
    IF v_legs <> 2 OR v_bad <> 0 OR (SELECT count(DISTINCT type) FROM public.transactions WHERE operation_key = v_key) <> 2
    THEN RAISE EXCEPTION '#333: data_changed' USING ERRCODE = 'P0001'; END IF;
    SELECT count(*) FILTER (WHERE x3.status = 'paid' AND round(x3.paid_amount, 2) = v_amount
             AND (SELECT coalesce(sum(p.amount), 0) FROM public.transaction_payments p WHERE p.transaction_id = x3.id AND p.status = 'paid') = v_amount),
           count(*) FILTER (WHERE x3.status IN ('pending','approved') AND coalesce(x3.paid_amount, 0) = 0
             AND NOT EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = x3.id AND p.status IN ('planned','paid')))
      INTO v_paid, v_n FROM public.transactions x3 WHERE x3.operation_key = v_key;
    IF v_paid = 2 THEN
      res := jsonb_build_object('settlement_id', s.id, 'transfer_transaction_id', t.id, 'operation_key', v_key, 'already_liquidated', true, 'writes', 0);
    ELSIF v_n = 2 THEN
      UPDATE public.transactions SET status = 'paid', payment_date = v_date, paid_amount = amount WHERE operation_key = v_key;
      SELECT count(*) INTO v_bad FROM public.transactions x4 WHERE x4.operation_key = v_key AND NOT (
        x4.status = 'paid' AND x4.paid_amount = v_amount AND x4.payment_date = v_date
        AND (SELECT count(*) FROM public.transaction_payments p WHERE p.transaction_id = x4.id) = 1
        AND EXISTS (SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id = x4.id AND p.status = 'paid' AND p.amount = v_amount
          AND p.payment_date = v_date AND p.account_id = x4.account_id AND p.company_id = v_company AND p.payment_method = 'transfer' AND p.reversed_at IS NULL));
      IF v_bad <> 0 THEN RAISE EXCEPTION '#333: readback_mismatch' USING ERRCODE = 'P0001'; END IF;
      res := jsonb_build_object('settlement_id', s.id, 'transfer_transaction_id', t.id, 'operation_key', v_key, 'already_liquidated', false,
        'payment_date', v_date, 'amount_cents', round(v_amount * 100), 'writes', 2, 'payments', 2);
    ELSE
      -- Parcial, estornado, pago numa só perna ou pagamentos planeados: não se adivinha; fica para o painel/estorno manual.
      RAISE EXCEPTION '#333: partial_state_manual' USING ERRCODE = 'P0001';
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
    FOR g IN SELECT DISTINCT y.grantee::regrole::text FROM pg_class c, aclexplode(c.relacl) y WHERE c.oid = o::regclass AND y.grantee <> 0 AND y.grantee <> c.relowner LOOP
      EXECUTE format('REVOKE ALL ON %s FROM %s', o, g); END LOOP;
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', o);
    EXECUTE format('GRANT SELECT ON %s TO service_role', o);
  END LOOP;
  FOREACH o IN ARRAY ARRAY['public.data_entry_assistant_execute_333(text,uuid,text)', 'public._de333_closing_check(jsonb,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', o);
    FOR g IN SELECT DISTINCT y.grantee::regrole::text FROM pg_proc p, aclexplode(p.proacl) y WHERE p.oid = o::regprocedure AND y.grantee <> 0 AND y.grantee <> p.proowner LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', o, g); END LOOP;
  END LOOP;
  -- Só authenticated: a identidade tem de ser a sessão do chamador (auth.uid()); service_role não tem sessão de utilizador.
  GRANT EXECUTE ON FUNCTION public.data_entry_assistant_execute_333(text,uuid,text) TO authenticated;
END $acl$;
COMMIT;
