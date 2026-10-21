-- INERTE: reviewed only in disposable PostgreSQL. No Live application authorized.
BEGIN;
SET LOCAL lock_timeout='5s';
-- LOCAL/INERTE SQL port of src/lib/bp-tx-matching.ts; same explicit union and token winner.
CREATE OR REPLACE FUNCTION public.issue335_normalize(s text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_catalog AS $$
 SELECT btrim(regexp_replace(lower(regexp_replace(normalize(coalesce(s,''),NFD),U&'[\0300-\036f]','','g')),'[^a-z0-9]+',' ','g'))
$$;
CREATE OR REPLACE FUNCTION public.issue335_score(f text,t text) RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path=public,pg_catalog AS $$
 WITH n AS(SELECT issue335_normalize(f) f,issue335_normalize(t) t),
 ft AS(SELECT DISTINCT tok FROM n,regexp_split_to_table(n.f,' ') tok WHERE length(tok)>=3),
 tt AS(SELECT DISTINCT tok FROM n,regexp_split_to_table(n.t,' ') tok WHERE length(tok)>=3),
 c AS(SELECT (SELECT count(*) FROM ft JOIN tt USING(tok))::double precision shared,(SELECT count(*) FROM ft)::double precision fn)
 SELECT CASE WHEN n.f='' AND n.t='' THEN 0 WHEN n.f=n.t THEN 1000 WHEN n.f='' OR n.t='' OR c.shared=0 THEN 0 ELSE c.shared*100+c.shared/nullif(c.fn,0)*10-abs(length(n.f)-length(n.t))::double precision/10000 END FROM n,c
$$;
CREATE OR REPLACE FUNCTION public.issue335_matching_transactions(p_forecast uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_catalog AS $$
 WITH f AS(SELECT f.*,NULL::uuid master_id FROM event_forecasts f WHERE f.id=p_forecast),
 allf AS(SELECT x.* FROM event_forecasts x,f WHERE x.company_id=f.company_id AND x.version_id IS NULL AND x.event_id IN(f.event_id,f.master_id)),
 direct AS(SELECT t.id FROM transactions t,f WHERE t.company_id=f.company_id AND (t.forecast_id=f.id OR t.id=f.transaction_id)),
 cat AS(SELECT t.id,t.description FROM transactions t,f WHERE f.category_id IS NOT NULL AND t.company_id=f.company_id AND t.event_id IN(f.event_id,f.master_id) AND t.category_id=f.category_id AND t.type=f.type AND (t.forecast_id IS NULL OR t.forecast_id=f.id) AND NOT EXISTS(SELECT 1 FROM allf x WHERE x.id<>f.id AND x.transaction_id=t.id)),
 samef AS(SELECT x.* FROM allf x,f WHERE x.category_id=f.category_id AND x.type=f.type AND x.event_id=f.event_id)
 SELECT id FROM direct UNION SELECT c.id FROM cat c,f WHERE (SELECT count(*) FROM samef)<=1 OR (issue335_score(f.description,c.description)>0 AND issue335_score(f.description,c.description)>coalesce((SELECT max(issue335_score(x.description,c.description)) FROM samef x WHERE x.id<>f.id),0))
$$;
REVOKE ALL ON FUNCTION public.issue335_normalize(text),public.issue335_score(text,text),public.issue335_matching_transactions(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Temporary installation membership only; revoked before COMMIT. True owner postgres remains
-- an administrator, not an adversary; postgres after SET ROLE executor has no context-table access.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='issue335_executor') THEN RAISE EXCEPTION 'executor_role_exists_requires_review'; END IF;
 CREATE ROLE issue335_executor NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
END $$;
GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET TRUE;
GRANT USAGE,CREATE ON SCHEMA public TO issue335_executor;
CREATE TABLE public.issue335_execution_context (
 backend_pid integer NOT NULL, transaction_id xid8 NOT NULL, token uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN('execute','bank','reverse')),
 PRIMARY KEY(backend_pid,transaction_id)
);
GRANT ALL ON public.issue335_execution_context TO postgres;
REVOKE ALL ON public.issue335_execution_context FROM PUBLIC,anon,authenticated,service_role,issue335_executor,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
ALTER TABLE public.issue335_execution_context ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.issue335_context_valid(p_operation text DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 SELECT pg_trigger_depth()>0 AND EXISTS(SELECT 1 FROM public.issue335_execution_context c
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=pg_current_xact_id()
 AND c.token::text=current_setting('issue335.ctx',true)
 AND (p_operation IS NULL OR c.operation=p_operation))
$$;
REVOKE ALL ON FUNCTION public.issue335_context_valid(text) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.issue335_context_valid(text) TO issue335_executor;
CREATE FUNCTION public.issue335_lock_parents(p_table text,p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 IF NOT public.issue335_context_valid() OR p_table NOT IN('events','event_settlements') THEN
  RAISE EXCEPTION 'managed_operation_required'; END IF;
 -- Locks only, no UPDATE privilege on business tables is delegated to the executor.
 EXECUTE format('SELECT 1 FROM public.%I WHERE id=ANY($1) AND company_id=public.current_company_id() ORDER BY id FOR NO KEY UPDATE NOWAIT',p_table) USING p_ids;
END $$;
REVOKE ALL ON FUNCTION public.issue335_lock_parents(text,uuid[]) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.issue335_lock_parents(text,uuid[]) TO issue335_executor;
CREATE FUNCTION public.issue335_uid() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$ SELECT auth.uid() $$;
REVOKE ALL ON FUNCTION public.issue335_uid() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.issue335_uid() TO issue335_executor;
-- PUBLIC companies policy directly reads user_roles (not through has_role).
-- Minimal caller-scoped SELECT is therefore necessary even with DEFINER identity helpers.
GRANT SELECT ON public.user_roles TO issue335_executor;
CREATE POLICY issue335_company_membership ON public.user_roles FOR SELECT TO issue335_executor USING (user_id=public.issue335_uid());
GRANT SELECT ON public.companies,public.suppliers,public.events,public.financial_accounts TO issue335_executor;
GRANT SELECT ON public.transaction_offset_control TO issue335_executor;
CREATE POLICY issue335_control_read ON public.transaction_offset_control FOR SELECT TO issue335_executor USING(true);
GRANT SELECT ON public.event_settlements TO issue335_executor;
-- 2j: substitui a policy issue335_guard_read da 2i. As guardas de lista/SEPA/despesa de sócio leem por uma
-- função SECURITY DEFINER (dono = papel que instala, dono das tabelas e sem RLS forçada nelas),
-- search_path fixo, EXECUTE só ao executor. Nenhuma policy nem GRANT novo em payment_lists,
-- payment_list_items, payment_list_sepa_exports, partner_paid_expenses (objectos existentes intocados).
-- Devolve só um booleano para um documento já validado como da empresa do pedido.
CREATE FUNCTION public.issue335_payment_flow_blocked(p_tx uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.payment_list_items i JOIN public.payment_lists l ON l.id=i.payment_list_id
               WHERE i.transaction_id=p_tx AND i.removed_at IS NULL AND l.status IN('draft','pending_approval','approved','revision','partially_approved'))
     OR EXISTS(SELECT 1 FROM public.payment_list_sepa_exports e WHERE p_tx=ANY(e.transaction_ids))
     OR EXISTS(SELECT 1 FROM public.partner_paid_expenses x WHERE x.transaction_id=p_tx)
     OR EXISTS(SELECT 1 FROM public.reimbursement_notes n WHERE n.payment_transaction_id=p_tx)
     OR EXISTS(SELECT 1 FROM public.card_session_loads l WHERE p_tx IN(l.out_transaction_id,l.in_transaction_id))
     OR EXISTS(SELECT 1 FROM public.partner_aporte_mirror m WHERE p_tx IN(m.source_transaction_id,m.aporte_transaction_id))
     OR EXISTS(SELECT 1 FROM public.transactions t JOIN public.financial_accounts a ON a.id=t.account_id
               WHERE t.id=p_tx AND (a.mirror_partner_aporte OR a.type IN('ticket_office','prepaid_card','camarim_session')))
     OR EXISTS(SELECT 1 FROM public.transaction_payments p JOIN public.financial_accounts a ON a.id=p.account_id
               WHERE p.transaction_id=p_tx AND p.status='paid' AND p.reversed_at IS NULL
                 AND (a.mirror_partner_aporte OR a.type IN('ticket_office','prepaid_card','camarim_session')))
$$;
REVOKE ALL ON FUNCTION public.issue335_payment_flow_blocked(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.issue335_payment_flow_blocked(uuid) TO issue335_executor;
-- 2j (achado J7 camarim): a perna do banco de um movimento de camarim é espelhada na conta da sessão pelo trigger
-- real camarim_sync_session_leg_payment, que soma TODOS os pagamentos (incl. compensation) como 'transfer'.
-- Um encontro sobre essa perna criaria dinheiro fictício na sessão → o núcleo recusa pernas de camarim.
CREATE FUNCTION public.issue335_camarim_leg(p_tx uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM public.camarim_fund_moves m WHERE m.transaction_id=p_tx)
     OR EXISTS(SELECT 1 FROM public.camarim_fund_moves m CROSS JOIN LATERAL public._camarim_fund_move_legs(m.id) l
               WHERE m.company_id=(SELECT company_id FROM public.transactions WHERE id=p_tx) AND p_tx IN(l.bank_tx,l.session_tx))
     OR EXISTS(SELECT 1 FROM public.transactions t JOIN public.financial_accounts a ON a.id=t.account_id
               WHERE t.id=p_tx AND a.type='camarim_session')
$$;
REVOKE ALL ON FUNCTION public.issue335_camarim_leg(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.issue335_camarim_leg(uuid) TO issue335_executor;
-- 2j (achado pelo teste 2e de sandbox): o default ACL de Live dá EXECUTE a sandbox_exec* em funções novas.
DO $$ DECLARE r record; BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'sandbox_exec%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION public.issue335_payment_flow_blocked(uuid),public.issue335_camarim_leg(uuid) FROM %I',r.rolname); END LOOP; END $$;
GRANT EXECUTE ON FUNCTION public.can_see_confidential(uuid),public.has_permission(uuid,text),public.is_platform_admin(uuid) TO issue335_executor;
GRANT SELECT,INSERT,UPDATE ON public.event_forecasts,public.transactions,public.transaction_payments,public.transaction_offsets,public.bank_statement_lines,public.transaction_offset_groups,public.transaction_offset_items TO issue335_executor;
GRANT SELECT,INSERT,DELETE ON public.bank_line_transactions TO issue335_executor;
GRANT SELECT,INSERT ON public.forecast_audit_log,public.transaction_audit_log,public.system_audit_log TO issue335_executor;
GRANT EXECUTE ON FUNCTION public.current_company_id(),public.has_role(uuid,public.app_role),public.bp_tx_link_allowed(uuid,uuid,uuid,uuid),public._derive_paid_amount(uuid),public.issue335_normalize(text),public.issue335_score(text,text),public.issue335_matching_transactions(uuid) TO issue335_executor;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['companies','suppliers','events','financial_accounts','event_settlements','event_forecasts','transactions','transaction_payments','transaction_offsets','bank_statement_lines','bank_line_transactions','transaction_offset_groups','transaction_offset_items','forecast_audit_log','transaction_audit_log','system_audit_log'] LOOP
  EXECUTE format('CREATE POLICY issue335_internal ON public.%I FOR ALL TO issue335_executor USING (%s=public.current_company_id()) WITH CHECK (%s=public.current_company_id())',t,CASE WHEN t='companies' THEN 'id' ELSE 'company_id' END,CASE WHEN t='companies' THEN 'id' ELSE 'company_id' END);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.issue335_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE gid uuid; st text; trusted boolean := public.issue335_context_valid(); BEGIN
 IF TG_TABLE_NAME IN ('transaction_offset_groups','transaction_offset_items') THEN
  IF NOT trusted THEN RAISE EXCEPTION 'managed_operation_required'; END IF;
  IF TG_TABLE_NAME='transaction_offset_items' THEN
   SELECT status INTO st FROM public.transaction_offset_groups WHERE id=NEW.group_id AND company_id=NEW.company_id;
   IF st IS DISTINCT FROM 'preparing' THEN RAISE EXCEPTION 'invalid_group_state'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF TG_TABLE_NAME='transaction_payments' THEN
  gid := CASE WHEN TG_OP='DELETE' THEN OLD.offset_group_id WHEN TG_OP='INSERT' THEN NEW.offset_group_id ELSE COALESCE(OLD.offset_group_id,NEW.offset_group_id) END;
  IF gid IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_OP='INSERT' THEN
   SELECT g.status INTO st FROM public.transaction_offset_groups g JOIN public.transaction_offset_items i ON i.group_id=g.id
    WHERE g.id=NEW.offset_group_id AND i.id=NEW.offset_item_id AND i.transaction_id=NEW.transaction_id AND i.company_id=NEW.company_id;
   IF NOT trusted OR st IS DISTINCT FROM 'preparing' OR NEW.offset_id IS NOT NULL OR
      NEW.status<>'paid' OR NEW.reversed_at IS NOT NULL OR NEW.credit_amount<>0 OR NEW.withholding_amount<>0 OR
      (NEW.payment_method='compensation' AND NEW.account_id IS NOT NULL) THEN RAISE EXCEPTION 'managed_operation_required'; END IF;
  ELSE
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'reverse_entire_group'; END IF;
   SELECT status INTO st FROM public.transaction_offset_groups WHERE id=gid;
   IF NOT trusted OR st IS DISTINCT FROM 'reversing' OR
    NEW.amount IS DISTINCT FROM OLD.amount OR NEW.transaction_id IS DISTINCT FROM OLD.transaction_id OR
    NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.offset_group_id IS DISTINCT FROM OLD.offset_group_id OR
    NEW.offset_item_id IS DISTINCT FROM OLD.offset_item_id OR NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
    NEW.payment_date IS DISTINCT FROM OLD.payment_date OR NEW.status<>'reversed' OR NEW.reversed_at IS NULL THEN RAISE EXCEPTION 'reverse_entire_group'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='transaction_offsets' THEN
 IF (CASE WHEN TG_OP='DELETE' THEN OLD.offset_group_id WHEN TG_OP='INSERT' THEN NEW.offset_group_id ELSE COALESCE(OLD.offset_group_id,NEW.offset_group_id) END) IS NOT NULL THEN
  IF TG_OP='DELETE' OR NOT trusted THEN RAISE EXCEPTION 'managed_operation_required'; END IF;
 END IF;
 -- 2j (achado F1b): par legado novo/alterado sobre documento já gerido por um grupo activo é recusado.
 -- KEY SHARE explícito ANTES da verificação: espera o FOR UPDATE de um encontro em curso e, em READ COMMITTED,
 -- a consulta seguinte já vê o grupo confirmado (sem isto a verificação corria antes da espera da FK).
 IF TG_OP<>'DELETE' AND NOT trusted THEN
  PERFORM 1 FROM public.transactions WHERE id IN(NEW.receivable_transaction_id,NEW.payable_transaction_id) ORDER BY id FOR KEY SHARE;
 END IF;
 IF TG_OP<>'DELETE' AND NOT trusted AND EXISTS(SELECT 1 FROM public.transaction_offset_items i JOIN public.transaction_offset_groups g ON g.id=i.group_id
    WHERE i.transaction_id IN(NEW.receivable_transaction_id,NEW.payable_transaction_id) AND g.status IN('preparing','applied','reversing')) THEN
  RAISE EXCEPTION 'managed_operation_required';
 END IF;
 END IF;
 IF TG_TABLE_NAME='bank_statement_lines' THEN
  gid := CASE WHEN TG_OP='DELETE' THEN OLD.offset_group_id WHEN TG_OP='INSERT' THEN NEW.offset_group_id ELSE COALESCE(OLD.offset_group_id,NEW.offset_group_id) END;
  IF gid IS NOT NULL AND NOT trusted THEN RAISE EXCEPTION 'managed_bank_anchor_immutable'; END IF;
  IF gid IS NOT NULL AND TG_OP='DELETE' THEN RAISE EXCEPTION 'reverse_entire_group'; END IF;
 END IF;
 IF TG_TABLE_NAME='bank_line_transactions' THEN
  IF EXISTS(SELECT 1 FROM public.transaction_offset_groups g WHERE g.bank_line_id IN
   (CASE WHEN TG_OP<>'INSERT' THEN OLD.line_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.line_id END) AND g.status IN ('preparing','applied','reversing')) AND NOT trusted THEN
   RAISE EXCEPTION 'managed_bank_anchor_immutable';
  END IF;
 END IF;
 IF TG_TABLE_NAME='transactions' AND TG_OP<>'INSERT' THEN
 IF EXISTS(SELECT 1 FROM public.transaction_offset_items i JOIN public.transaction_offset_groups g ON g.id=i.group_id WHERE i.transaction_id=OLD.id AND g.status IN ('preparing','applied','reversing')) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'reverse_entire_group'; END IF;
  IF NEW.reversed_at IS DISTINCT FROM OLD.reversed_at OR NEW.reversal_kind IS DISTINCT FROM OLD.reversal_kind OR
   NEW.amount IS DISTINCT FROM OLD.amount OR NEW.iva_rate IS DISTINCT FROM OLD.iva_rate OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR
   NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.type IS DISTINCT FROM OLD.type OR NEW.forecast_id IS DISTINCT FROM OLD.forecast_id OR
   NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.is_hidden IS DISTINCT FROM OLD.is_hidden OR
   NEW.event_settlement_id IS DISTINCT FROM OLD.event_settlement_id OR
   -- 2j (achado E, matriz coluna-a-coluna): condições de elegibilidade e identidade também imutáveis num documento gerido.
   (NEW.id,NEW.currency,NEW.fx_rate,NEW.original_amount,NEW.installment_group_id,NEW.installment_number,NEW.installment_total,
    NEW.card_session_id,NEW.held_by_supplier_id,NEW.settlement_id,NEW.is_transitory,NEW.supplier_credit_id,NEW.parent_transaction_id,
    NEW.is_reimbursement,NEW.cache_contract_id,NEW.shared_cost_account_id,NEW.declared_withholding_amount,NEW.declared_withholding_rate,
    NEW.split_percentage,NEW.split_amount,NEW.split_mode,NEW.payment_method,NEW.reversed_by,NEW.reversal_reason,
    NEW.paying_partner_id,NEW.ordering_partner_id,NEW.shared_cost_counterparty_id,NEW.category_id,NEW.exclude_from_result,
    NEW.cache_role,NEW.cache_root_event_id,NEW.cache_artist_supplier_id,NEW.operation_key,NEW.invoice_group_id,NEW.transitory_reason)
   IS DISTINCT FROM
   (OLD.id,OLD.currency,OLD.fx_rate,OLD.original_amount,OLD.installment_group_id,OLD.installment_number,OLD.installment_total,
    OLD.card_session_id,OLD.held_by_supplier_id,OLD.settlement_id,OLD.is_transitory,OLD.supplier_credit_id,OLD.parent_transaction_id,
    OLD.is_reimbursement,OLD.cache_contract_id,OLD.shared_cost_account_id,OLD.declared_withholding_amount,OLD.declared_withholding_rate,
    OLD.split_percentage,OLD.split_amount,OLD.split_mode,OLD.payment_method,OLD.reversed_by,OLD.reversal_reason,
    OLD.paying_partner_id,OLD.ordering_partner_id,OLD.shared_cost_counterparty_id,OLD.category_id,OLD.exclude_from_result,
    OLD.cache_role,OLD.cache_root_event_id,OLD.cache_artist_supplier_id,OLD.operation_key,OLD.invoice_group_id,OLD.transitory_reason) OR
   (NOT trusted AND (NEW.account_id IS DISTINCT FROM OLD.account_id OR
    ((NEW.status IS DISTINCT FROM OLD.status OR NEW.payment_date IS DISTINCT FROM OLD.payment_date OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount) AND NOT (
      EXISTS(SELECT 1 FROM public.transaction_offset_items gi JOIN public.transaction_offset_groups gg ON gg.id=gi.group_id WHERE gi.transaction_id=OLD.id AND gg.status IN('preparing','reversing')) AND
      NEW.paid_amount IS NOT DISTINCT FROM (SELECT coalesce(sum(gp.amount),0) FROM public.transaction_payments gp WHERE gp.transaction_id=OLD.id AND gp.status='paid')
    )))) THEN RAISE EXCEPTION 'reverse_entire_group'; END IF;
 END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.issue335_guard() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['transaction_offset_groups','transaction_offset_items','transaction_payments','transaction_offsets','transactions','bank_statement_lines','bank_line_transactions'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS issue335_guard ON public.%I',t);
  EXECUTE format('CREATE TRIGGER issue335_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.issue335_guard()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public._issue335_execute(
 p_request_id uuid,p_supplier_id uuid,p_items jsonb,p_movement jsonb,p_date date,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE company uuid:=public.current_company_id(); uid uuid:=public.issue335_uid(); h text; g public.transaction_offset_groups; t public.transactions; f public.event_forecasts;
 j jsonb; txid uuid; gid uuid; iid uuid; acc uuid; amount numeric; pd date; remaining numeric; paid numeric; gross numeric; debt numeric; cash numeric; net numeric:=0;
 has_income boolean:=false; has_expense boolean:=false; ids uuid[]:='{}'; prepared jsonb:='[]'; x jsonb; cash_type text; existing public.transaction_offsets;
BEGIN
 IF NOT public.issue335_context_valid() THEN RAISE EXCEPTION 'managed_operation_required'; END IF;
 PERFORM set_config('lock_timeout','5s',true);
 IF EXISTS(SELECT 1 FROM public.transaction_offset_control WHERE NOT enabled) THEN RAISE EXCEPTION 'encontro_desativado'; END IF;
 IF uid IS NULL OR company IS NULL OR NOT (public.has_role(uid,'admin') OR public.has_role(uid,'manager') OR public.has_role(uid,'editor')) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF p_request_id IS NULL OR p_supplier_id IS NULL OR p_date IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)<2 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 IF jsonb_array_length(p_items)>50 THEN RAISE EXCEPTION 'too_many_items: máximo 50 documentos por encontro'; END IF;
 IF p_items::text ~ '"(amount|paid_amount|iva_rate)"' THEN RAISE EXCEPTION 'document_values_not_editable'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('supplier',p_supplier_id,'items',p_items,'movement',p_movement,'date',p_date,'note',p_note)::text,'UTF8')),'hex');
 -- Request identity is serialized before checking the durable result.
 PERFORM pg_advisory_xact_lock(hashtextextended(company::text||p_request_id::text,335));
 -- Admission fence: recheck after the potentially waiting request lock, and
 -- retain shared advisory fence until commit. Closure drains admitted writes.
 PERFORM pg_advisory_xact_lock_shared(335,1);
 PERFORM 1 FROM public.transaction_offset_control WHERE singleton AND enabled;
 IF NOT FOUND THEN RAISE EXCEPTION 'encontro_desativado'; END IF;
 SELECT * INTO g FROM public.transaction_offset_groups WHERE company_id=company AND request_id=p_request_id;
 IF FOUND THEN
  IF g.request_hash<>h THEN RAISE EXCEPTION 'request_changed'; END IF;
  IF g.created_by IS DISTINCT FROM uid THEN RAISE EXCEPTION 'request_actor_mismatch'; END IF;
  IF g.status NOT IN ('applied','reversed') THEN RAISE EXCEPTION 'request_incomplete'; END IF;
  RETURN g.result || jsonb_build_object('status',g.status);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier:'||company::text||p_supplier_id::text,335));
 PERFORM 1 FROM public.suppliers WHERE id=p_supplier_id AND company_id=company;
 IF NOT FOUND THEN RAISE EXCEPTION 'supplier_not_found'; END IF;
 IF p_movement IS NULL THEN amount:=0; acc:=NULL; pd:=p_date;
 ELSE
  IF jsonb_typeof(p_movement) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_movement'; END IF;
  amount:=(p_movement->>'amount')::numeric; acc:=(p_movement->>'account_id')::uuid; pd:=(p_movement->>'date')::date;
  IF amount IS NULL OR amount<>round(amount,2) OR amount=0 OR acc IS NULL OR pd IS DISTINCT FROM p_date THEN RAISE EXCEPTION 'invalid_movement'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('account:'||acc::text,335));
  PERFORM 1 FROM public.financial_accounts WHERE id=acc AND company_id=company AND type='bank' AND is_active AND NOT is_hidden AND NOT is_restricted AND partner_id IS NULL AND NOT mirror_partner_aporte;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_allowed'; END IF;
 END IF;
 PERFORM public.issue335_lock_parents('events',ARRAY(SELECT lock_f.event_id FROM public.event_forecasts lock_f WHERE lock_f.id IN (SELECT (v->>'forecast_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'forecast_id') UNION SELECT lock_t.event_id FROM public.transactions lock_t WHERE lock_t.id IN (SELECT (v->>'transaction_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'transaction_id')));
 PERFORM public.issue335_lock_parents('event_settlements',ARRAY(SELECT seal_tx.event_settlement_id FROM public.transactions seal_tx WHERE seal_tx.id IN
  (SELECT (v->>'transaction_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'transaction_id')));
 -- All BP and existing transaction locks are obtained in UUID order, not display order.
 PERFORM 1 FROM public.event_forecasts WHERE id IN (SELECT (v->>'forecast_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'forecast_id') ORDER BY id FOR NO KEY UPDATE NOWAIT;
 -- 2j (achado F1/F3): FOR UPDATE (não NO KEY UPDATE) conflitua com o KEY SHARE de inserções por confirmar que referenciam
 -- o documento (transaction_offsets, payment_list_items, transaction_payments) → recusa 55P03 em vez de aplicar em paralelo.
 PERFORM 1 FROM public.transactions WHERE id IN (SELECT (v->>'transaction_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'transaction_id') ORDER BY id FOR UPDATE NOWAIT;
 PERFORM 1 FROM public.transaction_payments WHERE transaction_id IN (SELECT (v->>'transaction_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'transaction_id') ORDER BY id FOR NO KEY UPDATE NOWAIT;
 -- Resolve all items and validate before financial writes. BP creation stays in this transaction.
 FOR j IN SELECT v FROM jsonb_array_elements(p_items) v ORDER BY COALESCE((v->>'cash_order')::integer,0),COALESCE(v->>'transaction_id',v->>'forecast_id') LOOP
  IF (j ? 'transaction_id')=(j ? 'forecast_id') THEN RAISE EXCEPTION 'invalid_item'; END IF;
  IF j ? 'forecast_id' THEN
   SELECT * INTO f FROM public.event_forecasts WHERE id=(j->>'forecast_id')::uuid AND company_id=company;
   IF NOT FOUND OR f.approved_at IS NULL OR f.version_id IS NOT NULL OR f.currency<>'EUR' OR f.fx_rate IS NOT NULL OR f.cache_config_id IS NOT NULL OR f.master_forecast_id IS NOT NULL OR f.formula_type<>'fixed' OR f.amount IS DISTINCT FROM round(f.amount,2) OR f.event_settlement_id IS NOT NULL THEN RAISE EXCEPTION 'forecast_not_available'; END IF;
   -- Match the complete canonical BP union; no LIMIT or entity prefilter.
   IF EXISTS(SELECT 1 FROM public.issue335_matching_transactions(f.id)) THEN RAISE EXCEPTION 'forecast_shared_no_creation'; END IF;
   PERFORM 1 FROM public.events WHERE id=f.event_id AND company_id=company AND status NOT IN ('completed','cancelled');
   IF NOT FOUND THEN RAISE EXCEPTION 'event_closed'; END IF;
   IF j ? 'expected_open_cents' AND (j->>'expected_open_cents')::bigint<>round(f.amount*(1+f.iva_rate/100.0),2)*100 THEN RAISE EXCEPTION 'preview_changed'; END IF;
   IF NOT public.bp_tx_link_allowed(f.event_id,company,f.event_id,f.company_id) THEN RAISE EXCEPTION 'forecast_link_denied'; END IF;
   INSERT INTO public.transactions(company_id,event_id,category_id,forecast_id,type,description,specification,amount,iva_rate,date,due_date,status,supplier_id,currency)
    VALUES(company,f.event_id,f.category_id,f.id,f.type,f.description,f.specification,f.amount,f.iva_rate,p_date,p_date,'approved',p_supplier_id,'EUR') RETURNING * INTO t;
   INSERT INTO public.forecast_audit_log(forecast_id,changed_by,field_name,old_value,new_value,company_id) VALUES(f.id,uid::text,'issue335_create_transaction',NULL,t.id::text,company);
  ELSE
   SELECT * INTO t FROM public.transactions WHERE id=(j->>'transaction_id')::uuid AND company_id=company;
   IF NOT FOUND THEN RAISE EXCEPTION 'transaction_not_found'; END IF;
  END IF;
  -- Match the installed authenticated restrictive confidential policy before any value-bearing error.
  IF NOT public.can_see_confidential(uid) AND (COALESCE(t.is_confidential,false) OR EXISTS(SELECT 1 FROM public.financial_accounts a WHERE a.id=t.account_id AND a.is_restricted)) THEN
   RAISE EXCEPTION 'document_not_available: documento inexistente ou sem acesso';
  END IF;
  IF t.id=ANY(ids) THEN RAISE EXCEPTION 'duplicate_item'; END IF; ids:=array_append(ids,t.id);
  IF t.status='partially_paid' AND position('issue335-status-v2l' in pg_get_functiondef('public._derive_paid_amount(uuid)'::regprocedure))=0 THEN
   RAISE EXCEPTION 'installation_order: status_candidate_required'; END IF;
  IF t.supplier_id IS DISTINCT FROM p_supplier_id OR t.type NOT IN ('income','expense') OR t.status NOT IN ('approved','partially_paid') OR t.reversed_at IS NOT NULL OR t.is_hidden THEN RAISE EXCEPTION 'invalid_document'; END IF;
  IF public.issue335_camarim_leg(t.id) THEN RAISE EXCEPTION 'camarim_leg_unsupported: movimentos de camarim não entram no encontro de contas'; END IF;
  -- 2k M6: não reinterpretar dinheiro legado atribuído a outra conta ao activar um grupo.
  IF EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id=t.id AND p.status='paid'
    AND p.reversed_at IS NULL AND p.payment_method IS DISTINCT FROM 'compensation'
    AND (p.account_id IS NULL OR p.account_id IS DISTINCT FROM t.account_id)) THEN
   RAISE EXCEPTION 'cash_account_inconsistent: reveja a conta das pernas existentes antes do encontro';
  END IF;
  IF t.currency<>'EUR' OR t.fx_rate IS NOT NULL OR t.original_amount IS NOT NULL OR t.installment_group_id IS NOT NULL OR t.installment_number IS NOT NULL OR t.installment_total IS NOT NULL OR
     t.card_session_id IS NOT NULL OR t.held_by_supplier_id IS NOT NULL OR t.settlement_id IS NOT NULL OR t.is_transitory OR t.supplier_credit_id IS NOT NULL OR
     public.issue335_payment_flow_blocked(t.id) OR
     t.parent_transaction_id IS NOT NULL OR t.is_reimbursement OR t.cache_contract_id IS NOT NULL OR t.shared_cost_account_id IS NOT NULL OR
     COALESCE(t.declared_withholding_amount,0)<>0 OR COALESCE(t.declared_withholding_rate,0)<>0 OR
     EXISTS(SELECT 1 FROM public.transaction_payments WHERE transaction_id=t.id AND (status='planned' OR (status='paid' AND reversed_at IS NULL AND (credit_amount<>0 OR withholding_amount<>0 OR currency<>'EUR' OR fx_rate IS NOT NULL OR reversal_kind='supplier_credit' OR offset_group_id IS NOT NULL)))) THEN RAISE EXCEPTION 'unsupported_debt'; END IF;
  IF t.amount IS DISTINCT FROM round(t.amount,2) OR EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.transaction_id=t.id AND p.status='paid' AND p.reversed_at IS NULL AND p.amount IS DISTINCT FROM round(p.amount,2)) THEN RAISE EXCEPTION 'document_precision_unsupported: valores com mais de duas casas decimais'; END IF;
  IF EXISTS(SELECT 1 FROM public.event_settlements es WHERE es.id=t.event_settlement_id AND es.is_sealed) THEN RAISE EXCEPTION 'sealed_settlement: reabra o fecho antes do encontro'; END IF;
  gross:=round(t.amount*(1+t.iva_rate/100.0),2);
  SELECT COALESCE(sum(p.amount),0) INTO paid FROM public.transaction_payments p WHERE transaction_id=t.id AND status='paid' AND reversed_at IS NULL;
  IF paid IS DISTINCT FROM t.paid_amount THEN RAISE EXCEPTION 'paid_ledger_divergent'; END IF;
  debt:=gross-paid;
  IF debt<=0 THEN RAISE EXCEPTION 'no_open_debt'; END IF;
  IF j ? 'expected_open_cents' AND (j->>'expected_open_cents')::bigint<>debt*100 THEN RAISE EXCEPTION 'preview_changed'; END IF;
  cash_type:=CASE WHEN amount<0 THEN 'expense' ELSE 'income' END;
  IF amount<>0 AND (j->>'mode') IS DISTINCT FROM (CASE WHEN t.type=cash_type THEN 'settle' ELSE 'offset' END) THEN RAISE EXCEPTION 'invalid_mode_sign'; END IF;
  IF amount=0 AND (j->>'mode') IS DISTINCT FROM 'offset' THEN RAISE EXCEPTION 'invalid_mode_sign'; END IF;
  net:=net+CASE WHEN t.type='income' THEN debt ELSE -debt END;
  has_income:=has_income OR t.type='income'; has_expense:=has_expense OR t.type='expense';
  prepared:=prepared||jsonb_build_object('id',t.id,'forecast_id',CASE WHEN j ? 'forecast_id' THEN f.id ELSE NULL END,'order',COALESCE((j->>'cash_order')::integer,0),'type',t.type,'base',t.amount,'iva',t.iva_rate,'gross',gross,'paid',paid,'prior_status',t.status,'prior_payment_date',t.payment_date,'debt',debt);
 END LOOP;
 IF NOT has_income OR NOT has_expense THEN RAISE EXCEPTION 'both_signs_required'; END IF;
 IF net<>amount THEN RAISE EXCEPTION '% % €',CASE WHEN (net-amount)*CASE WHEN amount<0 THEN -1 ELSE 1 END<0 THEN 'Faltam' ELSE 'Excedem' END,replace(to_char(abs(net-amount),'FM999999999990.00'),'.',',') USING DETAIL=jsonb_build_object('difference_cents',(net-amount)*100)::text; END IF;
 INSERT INTO public.transaction_offset_groups(company_id,supplier_id,request_id,request_hash,operation_date,account_id,movement_amount,note,created_by)
  VALUES(company,p_supplier_id,p_request_id,h,p_date,acc,amount,p_note,uid) RETURNING id INTO gid;
 -- Adopt existing un-applied internal pairs; reject external or already-applied pairs.
 FOR existing IN SELECT * FROM public.transaction_offsets WHERE receivable_transaction_id=ANY(ids) OR payable_transaction_id=ANY(ids) ORDER BY id FOR NO KEY UPDATE NOWAIT LOOP
  IF existing.offset_group_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.transaction_offset_groups oldg WHERE oldg.id=existing.offset_group_id AND oldg.status='reversed') AND NOT EXISTS(SELECT 1 FROM public.transaction_payments p WHERE p.offset_id=existing.id AND p.status='paid' AND p.reversed_at IS NULL) THEN CONTINUE; END IF;
  IF NOT(existing.receivable_transaction_id=ANY(ids) AND existing.payable_transaction_id=ANY(ids)) OR existing.offset_group_id IS NOT NULL OR
     EXISTS(SELECT 1 FROM public.transaction_payments WHERE offset_id=existing.id AND status='paid' AND reversed_at IS NULL) THEN RAISE EXCEPTION 'legacy_offset_requires_review'; END IF;
  IF existing.amount IS DISTINCT FROM least(
    (SELECT (v->>'debt')::numeric - CASE WHEN v->>'type'=cash_type THEN greatest(least((v->>'debt')::numeric,abs(amount)-coalesce((SELECT sum((z->>'debt')::numeric) FROM jsonb_array_elements(prepared) z WHERE z->>'type'=cash_type AND (z->>'order',z->>'id')<(v->>'order',v->>'id')),0)),0) ELSE 0 END FROM jsonb_array_elements(prepared) v WHERE (v->>'id')::uuid=existing.receivable_transaction_id),
    (SELECT (v->>'debt')::numeric FROM jsonb_array_elements(prepared) v WHERE (v->>'id')::uuid=existing.payable_transaction_id)) THEN RAISE EXCEPTION 'legacy_offset_amount_mismatch'; END IF;
  UPDATE public.transaction_offsets SET offset_group_id=gid WHERE id=existing.id;
 END LOOP;
 remaining:=abs(amount);
 FOR x IN SELECT v FROM jsonb_array_elements(prepared) v LOOP
  debt:=(x->>'debt')::numeric; cash:=CASE WHEN x->>'type'=cash_type THEN least(debt,remaining) ELSE 0 END; remaining:=remaining-cash;
  INSERT INTO public.transaction_offset_items(group_id,company_id,transaction_id,forecast_id,cash_order,type,base_amount,iva_rate,gross_amount,prior_paid_amount,prior_status,prior_payment_date,open_amount,cash_amount,compensation_amount)
   VALUES(gid,company,(x->>'id')::uuid,(x->>'forecast_id')::uuid,(x->>'order')::integer,x->>'type',(x->>'base')::numeric,(x->>'iva')::integer,(x->>'gross')::numeric,(x->>'paid')::numeric,x->>'prior_status',(x->>'prior_payment_date')::date,debt,cash,debt-cash) RETURNING id INTO iid;
  IF cash>0 THEN
   INSERT INTO public.transaction_payments(transaction_id,company_id,amount,payment_date,account_id,payment_method,status,created_by,offset_group_id,offset_item_id)
    VALUES((x->>'id')::uuid,company,cash,p_date,acc,'transfer','paid',uid::text,gid,iid);
   -- Preserve the document account (including prior X / compensation NULL); balance uses the cash-leg account.
  END IF;
  IF debt-cash>0 THEN
   INSERT INTO public.transaction_payments(transaction_id,company_id,amount,payment_date,account_id,payment_method,status,created_by,offset_group_id,offset_item_id)
    VALUES((x->>'id')::uuid,company,debt-cash,p_date,NULL,'compensation','paid',uid::text,gid,iid);
  END IF;
 END LOOP;
 FOR txid IN SELECT transaction_id FROM public.transaction_offset_items WHERE group_id=gid ORDER BY transaction_id LOOP PERFORM public._derive_paid_amount(txid); END LOOP;
 INSERT INTO public.transaction_audit_log(transaction_id,changed_by,changed_at,field_name,old_value,new_value,company_id) SELECT transaction_id,uid::text,now(),'issue335_apply',prior_paid_amount::text,jsonb_build_object('group_id',gid,'cash',cash_amount,'compensation',compensation_amount)::text,company FROM public.transaction_offset_items WHERE group_id=gid;
 INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,new_data,company_id) SELECT 'transaction_payment',id::text,'issue335_create',uid::text,to_jsonb(p),company FROM public.transaction_payments p WHERE offset_group_id=gid;
 IF EXISTS(SELECT 1 FROM public.transaction_offset_items i JOIN public.transactions final_tx ON final_tx.id=i.transaction_id WHERE i.group_id=gid AND
  (i.prior_paid_amount+i.open_amount IS DISTINCT FROM (SELECT coalesce(sum(p.amount),0) FROM public.transaction_payments p WHERE p.transaction_id=i.transaction_id AND p.status='paid' AND p.reversed_at IS NULL) OR
   i.gross_amount IS DISTINCT FROM round(final_tx.amount*(1+final_tx.iva_rate/100.0),2))) THEN RAISE EXCEPTION 'encontro_em_conflito: dívida alterada durante a operação' USING ERRCODE='55P03'; END IF;
 UPDATE public.transaction_offset_groups SET status='applied',result=jsonb_build_object('group_id',gid,'status','applied','movement_amount',amount,'transaction_ids',to_jsonb(ids)) WHERE id=gid RETURNING * INTO g;
 RETURN g.result;
END $$;
CREATE OR REPLACE FUNCTION public._issue335_reverse(p_group_id uuid,p_request_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE g public.transaction_offset_groups; l public.bank_statement_lines; txid uuid; BEGIN
 IF NOT public.issue335_context_valid('reverse') THEN RAISE EXCEPTION 'managed_operation_required'; END IF;
 PERFORM set_config('lock_timeout','5s',true);
 IF public.issue335_uid() IS NULL OR NOT public.has_role(public.issue335_uid(),'admin') THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF p_request_id IS NULL OR nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
 PERFORM pg_advisory_xact_lock_shared(335,1);
 PERFORM 1 FROM public.transaction_offset_control WHERE singleton AND reverse_enabled;
 IF NOT FOUND THEN RAISE EXCEPTION 'encontro_desativado'; END IF;
 -- Nonwaiting locks prevent cycles with legacy writers (which use inverted orders).
 PERFORM pg_advisory_xact_lock(hashtextextended('supplier:'||public.current_company_id()::text||(SELECT supplier_id::text FROM public.transaction_offset_groups WHERE id=p_group_id AND company_id=public.current_company_id()),335));
 -- Bank anchor before group, matching execute adapter order.
 PERFORM 1 FROM public.bank_statement_lines WHERE offset_group_id=p_group_id ORDER BY id FOR NO KEY UPDATE NOWAIT;
 SELECT * INTO g FROM public.transaction_offset_groups WHERE id=p_group_id AND company_id=public.current_company_id() FOR NO KEY UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'group_not_found'; END IF;
 IF g.status='reversed' THEN
  IF g.reversal_request_id=p_request_id AND g.reversal_reason=p_reason THEN RETURN g.result||jsonb_build_object('status','reversed'); END IF;
  RAISE EXCEPTION 'already_reversed';
 END IF;
 IF g.status<>'applied' THEN RAISE EXCEPTION 'invalid_group_state'; END IF;
 PERFORM public.issue335_lock_parents('event_settlements',ARRAY(SELECT t.event_settlement_id FROM public.transactions t JOIN public.transaction_offset_items i ON i.transaction_id=t.id WHERE i.group_id=g.id));
 PERFORM 1 FROM public.transactions WHERE id IN(SELECT transaction_id FROM public.transaction_offset_items WHERE group_id=g.id) ORDER BY id FOR UPDATE NOWAIT; -- 2j: idem execute
 PERFORM 1 FROM public.transaction_payments WHERE offset_group_id=g.id ORDER BY id FOR NO KEY UPDATE NOWAIT;
 IF EXISTS(SELECT 1 FROM public.transaction_payments WHERE offset_group_id=g.id AND (status<>'paid' OR reversed_at IS NOT NULL)) THEN RAISE EXCEPTION 'group_ledger_divergent'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions t JOIN public.transaction_offset_items i ON i.transaction_id=t.id JOIN public.event_settlements es ON es.id=t.event_settlement_id WHERE i.group_id=g.id AND es.is_sealed) THEN RAISE EXCEPTION 'sealed_settlement: reabra o fecho antes do estorno'; END IF;
 INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,old_data,company_id) SELECT 'transaction_payment',id::text,'issue335_reverse',public.issue335_uid()::text,to_jsonb(p),g.company_id FROM public.transaction_payments p WHERE offset_group_id=g.id;
 INSERT INTO public.transaction_audit_log(transaction_id,changed_by,changed_at,field_name,old_value,new_value,company_id) SELECT transaction_id,public.issue335_uid()::text,now(),'issue335_reverse',g.id::text,p_reason,g.company_id FROM public.transaction_offset_items WHERE group_id=g.id;
 UPDATE public.transaction_offset_groups SET status='reversing' WHERE id=g.id;
 UPDATE public.transaction_payments SET status='reversed',reversed_at=now(),reversed_by=public.issue335_uid(),reversal_reason=p_reason WHERE offset_group_id=g.id;
 FOR txid IN SELECT transaction_id FROM public.transaction_offset_items WHERE group_id=g.id ORDER BY transaction_id LOOP PERFORM public._derive_paid_amount(txid); END LOOP;
 FOR l IN SELECT * FROM public.bank_statement_lines WHERE offset_group_id=g.id LOOP
  INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,old_data,new_data,company_id) VALUES('bank_statement_line',l.id::text,'issue335_detach',public.issue335_uid()::text,jsonb_build_object('header',to_jsonb(l),'links',(SELECT jsonb_agg(to_jsonb(b)) FROM public.bank_line_transactions b WHERE line_id=l.id)),jsonb_build_object('status','unmatched'),g.company_id);
  DELETE FROM public.bank_line_transactions WHERE line_id=l.id;
  UPDATE public.bank_statement_lines SET status='unmatched',offset_group_id=NULL,matched_transaction_id=NULL,matched_by=NULL,matched_at=NULL WHERE id=l.id;
 END LOOP;
 -- Keep adopted legacy links managed by the retained group: old automatic trigger cannot revive them.
 UPDATE public.transaction_offset_groups SET status='reversed',reversed_at=now(),reversal_request_id=p_request_id,reversal_reason=p_reason WHERE id=g.id;
 RETURN g.result||jsonb_build_object('status','reversed');
END $$;

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
  IF NOT FOUND OR o.offset_group_id IS NOT NULL THEN RETURN NULL; END IF;
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
            WHERE (receivable_transaction_id = p_tx_id OR payable_transaction_id = p_tx_id) AND offset_group_id IS NULL
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

  IF EXISTS(SELECT 1 FROM public.transaction_payments WHERE id=p_payment_id AND offset_group_id IS NOT NULL AND status='paid' AND reversed_at IS NULL) THEN RAISE EXCEPTION 'reverse_entire_group'; END IF;

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

  IF EXISTS(SELECT 1 FROM public.transaction_payments WHERE transaction_id=p_tx_id AND offset_group_id IS NOT NULL AND status='paid' AND reversed_at IS NULL) THEN RAISE EXCEPTION 'reverse_entire_group'; END IF;

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

REVOKE ALL ON FUNCTION public.reconcile_bank_line(uuid,jsonb),public.reverse_payment(uuid,text,text,date,numeric),public.reverse_transaction(uuid,text,text,date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(uuid,jsonb),public.reverse_payment(uuid,text,text,date,numeric),public.reverse_transaction(uuid,text,text,date,boolean) TO authenticated,service_role;
-- Reset extraneous EXECUTE grants on all touched/new functions, preserving owner.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid,n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,a.grantee
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
 WHERE n.nspname='public' AND p.proname IN ('transaction_offset_execute','transaction_offset_reverse','_issue335_execute','_issue335_reverse','issue335_dispatch','issue335_guard') AND a.grantee<>p.proowner AND a.grantee<>0 AND a.grantee NOT IN(SELECT oid FROM pg_roles WHERE rolname IN ('authenticated','service_role')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM %I',r.nspname,r.proname,r.args,(SELECT rolname FROM pg_roles WHERE oid=r.grantee));
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION public._issue335_execute(uuid,uuid,jsonb,jsonb,date,text), public._issue335_reverse(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public._issue335_execute(uuid,uuid,jsonb,jsonb,date,text),public._issue335_reverse(uuid,uuid,text),public.issue335_guard() TO issue335_executor;
CREATE VIEW public.issue335_commands AS SELECT NULL::jsonb AS command,NULL::jsonb AS result WHERE false;
REVOKE ALL ON public.issue335_commands FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.issue335_commands TO authenticated,service_role;
CREATE FUNCTION public.issue335_dispatch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE context_token uuid:=gen_random_uuid(); old_context text:=current_setting('issue335.ctx',true);
BEGIN
 IF TG_RELID<>'public.issue335_commands'::regclass OR TG_OP<>'INSERT' OR pg_trigger_depth()<>1
 OR NEW.command->>'op' NOT IN('execute','bank','reverse') OR EXISTS(SELECT 1 FROM public.issue335_execution_context
 WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()) THEN
  RAISE EXCEPTION 'managed_operation_required'; END IF;
 INSERT INTO public.issue335_execution_context VALUES(pg_backend_pid(),pg_current_xact_id(),context_token,NEW.command->>'op');
 PERFORM set_config('issue335.ctx',context_token::text,true);
 NEW.result:=public.issue335_worker(NEW.command);
 DELETE FROM public.issue335_execution_context WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id();
 PERFORM set_config('issue335.ctx',coalesce(old_context,''),true);
 RETURN NEW;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'encontro_em_conflito: operação concorrente; atualize a prévia e tente novamente' USING ERRCODE='55P03';
END $$;
CREATE FUNCTION public.issue335_worker(p_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.issue335_context_valid() THEN RAISE EXCEPTION 'managed_operation_required'; END IF;
 IF p_command->>'op'='execute' THEN
  result:=public._issue335_execute((p_command->>'request_id')::uuid,(p_command->>'supplier_id')::uuid,p_command->'items',NULLIF(p_command->'movement','null'::jsonb),(p_command->>'date')::date,p_command->>'note');
 ELSIF p_command->>'op'='bank' THEN
  PERFORM public.reconcile_bank_line((p_command->>'line_id')::uuid,p_command->'items');
 ELSIF p_command->>'op'='reverse' THEN
  result:=public._issue335_reverse((p_command->>'group_id')::uuid,(p_command->>'request_id')::uuid,p_command->>'reason');
 ELSE RAISE EXCEPTION 'invalid_operation'; END IF;
 RETURN result;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'encontro_em_conflito: operação concorrente; atualize a prévia e tente novamente' USING ERRCODE='55P03';
END $$;
REVOKE ALL ON FUNCTION public.issue335_dispatch() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER issue335_dispatch INSTEAD OF INSERT ON public.issue335_commands FOR EACH ROW EXECUTE FUNCTION public.issue335_dispatch();
DO $$ DECLARE r record; BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'sandbox_exec%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION public.issue335_dispatch() FROM %I',r.rolname); END LOOP; END $$;
ALTER FUNCTION public.issue335_worker(jsonb) OWNER TO issue335_executor;
SET LOCAL ROLE issue335_executor;
REVOKE ALL ON FUNCTION public.issue335_worker(jsonb) FROM PUBLIC,anon,authenticated,service_role,sandbox_exec,sandbox_exec_sfohvvlqccmmebvjgibx;
GRANT EXECUTE ON FUNCTION public.issue335_worker(jsonb) TO postgres;
RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM issue335_executor;
GRANT EXECUTE ON FUNCTION public.reconcile_bank_line(uuid,jsonb) TO issue335_executor;
CREATE OR REPLACE FUNCTION public.transaction_offset_execute(p_request_id uuid,p_supplier_id uuid,p_items jsonb,p_movement jsonb,p_date date,p_note text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE r jsonb; BEGIN
 INSERT INTO public.issue335_commands(command) VALUES(jsonb_build_object('op','execute','request_id',p_request_id,'supplier_id',p_supplier_id,'items',p_items,'movement',p_movement,'date',p_date,'note',p_note)) RETURNING result INTO r; RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.transaction_offset_reverse(p_group_id uuid,p_request_id uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE r jsonb; BEGIN
 INSERT INTO public.issue335_commands(command) VALUES(jsonb_build_object('op','reverse','group_id',p_group_id,'request_id',p_request_id,'reason',p_reason)) RETURNING result INTO r; RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.transaction_offset_execute(uuid,uuid,jsonb,jsonb,date,text),public.transaction_offset_reverse(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transaction_offset_execute(uuid,uuid,jsonb,jsonb,date,text),public.transaction_offset_reverse(uuid,uuid,text) TO authenticated,service_role;

DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN('sandbox_exec','sandbox_exec_sfohvvlqccmmebvjgibx') LOOP
  EXECUTE format('REVOKE ALL ON public.issue335_commands FROM %I',r.rolname);
  EXECUTE format('REVOKE ALL ON FUNCTION public.transaction_offset_execute(uuid,uuid,jsonb,jsonb,date,text),public.transaction_offset_reverse(uuid,uuid,text),public._issue335_execute(uuid,uuid,jsonb,jsonb,date,text),public._issue335_reverse(uuid,uuid,text),public.issue335_guard(),public.issue335_uid(),public.issue335_normalize(text),public.issue335_score(text,text),public.issue335_matching_transactions(uuid) FROM %I',r.rolname);
 END LOOP;
END $$;

-- No permanent SET/INHERIT path to the financial identity. Rollback grants only temporary
-- installation-admin membership after its zero-history preflight, then drops the fresh role.
REVOKE issue335_executor FROM postgres;
GRANT EXECUTE ON FUNCTION public.issue335_context_valid(text) TO authenticated,service_role;
COMMIT;
