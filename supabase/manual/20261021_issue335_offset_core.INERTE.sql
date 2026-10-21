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
REVOKE ALL ON FUNCTION public.issue335_normalize(text),public.issue335_score(text,text),public.issue335_matching_transactions(uuid) FROM PUBLIC,anon,authenticated;

-- INERTE phase2b: dedicated NOLOGIN execution identity, never granted to app roles.
-- An INSERT into the command view is equivalent to the RPC: full authorization,
-- hash, locks and validation still execute. No GUC/caller text is an authorization token.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='issue335_executor') THEN RAISE EXCEPTION 'executor_role_exists_requires_review'; END IF;
 CREATE ROLE issue335_executor NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
END $$;
GRANT USAGE ON SCHEMA public,auth TO issue335_executor;
GRANT SELECT,UPDATE ON public.companies,public.suppliers,public.events,public.financial_accounts TO issue335_executor;
GRANT SELECT ON public.partner_paid_expenses TO issue335_executor;
-- Real current_company_id()/has_role() read identity tables as invoker. The executor may read only the caller's own rows.
GRANT SELECT ON public.profiles,public.user_roles TO issue335_executor;
CREATE POLICY issue335_identity ON public.profiles FOR SELECT TO issue335_executor USING (id=auth.uid());
CREATE POLICY issue335_identity ON public.user_roles FOR SELECT TO issue335_executor USING (user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE ON public.event_forecasts,public.transactions,public.transaction_payments,public.transaction_offsets,public.bank_statement_lines,public.transaction_offset_groups,public.transaction_offset_items TO issue335_executor;
GRANT SELECT,INSERT,DELETE ON public.bank_line_transactions TO issue335_executor;
GRANT SELECT,INSERT ON public.forecast_audit_log,public.transaction_audit_log,public.system_audit_log TO issue335_executor;
GRANT EXECUTE ON FUNCTION auth.uid(),public.current_company_id(),public.has_role(uuid,public.app_role),public.bp_tx_link_allowed(uuid,uuid,uuid,uuid),public._derive_paid_amount(uuid),public.issue335_normalize(text),public.issue335_score(text,text),public.issue335_matching_transactions(uuid) TO issue335_executor;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['companies','suppliers','events','financial_accounts','event_forecasts','transactions','transaction_payments','transaction_offsets','bank_statement_lines','bank_line_transactions','transaction_offset_groups','transaction_offset_items','forecast_audit_log','transaction_audit_log','system_audit_log'] LOOP
  EXECUTE format('CREATE POLICY issue335_internal ON public.%I FOR ALL TO issue335_executor USING (%s=public.current_company_id()) WITH CHECK (%s=public.current_company_id())',t,CASE WHEN t='companies' THEN 'id' ELSE 'company_id' END,CASE WHEN t='companies' THEN 'id' ELSE 'company_id' END);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.issue335_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE gid uuid; st text; trusted boolean := current_user = 'issue335_executor'; BEGIN
 IF TG_TABLE_NAME IN ('transaction_offset_groups','transaction_offset_items') THEN
  IF NOT trusted THEN RAISE EXCEPTION 'managed_operation_required'; END IF;
  IF TG_TABLE_NAME='transaction_offset_items' THEN
   SELECT status INTO st FROM public.transaction_offset_groups WHERE id=NEW.group_id AND company_id=NEW.company_id;
   IF st IS DISTINCT FROM 'preparing' THEN RAISE EXCEPTION 'invalid_group_state'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='transaction_payments' THEN
  gid := CASE WHEN TG_OP='DELETE' THEN OLD.offset_group_id ELSE COALESCE(OLD.offset_group_id,NEW.offset_group_id) END;
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
 IF (CASE WHEN TG_OP='DELETE' THEN OLD.offset_group_id ELSE COALESCE(OLD.offset_group_id,NEW.offset_group_id) END) IS NOT NULL THEN
  IF TG_OP='DELETE' OR NOT trusted THEN RAISE EXCEPTION 'managed_operation_required'; END IF;
 END IF;
 END IF;
 IF TG_TABLE_NAME='transactions' THEN
 IF EXISTS(SELECT 1 FROM public.transaction_offset_items i JOIN public.transaction_offset_groups g ON g.id=i.group_id WHERE i.transaction_id=OLD.id AND g.status IN ('preparing','applied','reversing')) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'reverse_entire_group'; END IF;
  IF NEW.reversed_at IS DISTINCT FROM OLD.reversed_at OR NEW.reversal_kind IS DISTINCT FROM OLD.reversal_kind OR
   NEW.amount IS DISTINCT FROM OLD.amount OR NEW.iva_rate IS DISTINCT FROM OLD.iva_rate OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR
   NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.type IS DISTINCT FROM OLD.type OR NEW.forecast_id IS DISTINCT FROM OLD.forecast_id THEN RAISE EXCEPTION 'reverse_entire_group'; END IF;
 END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.issue335_guard() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['transaction_offset_groups','transaction_offset_items','transaction_payments','transaction_offsets','transactions'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS issue335_guard ON public.%I',t);
  EXECUTE format('CREATE TRIGGER issue335_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.issue335_guard()',t);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public._issue335_execute(
 p_request_id uuid,p_supplier_id uuid,p_items jsonb,p_movement jsonb,p_date date,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE company uuid:=public.current_company_id(); uid uuid:=auth.uid(); h text; g public.transaction_offset_groups; t public.transactions; f public.event_forecasts;
 j jsonb; txid uuid; gid uuid; iid uuid; acc uuid; amount numeric; pd date; remaining numeric; paid numeric; gross numeric; debt numeric; cash numeric; net numeric:=0;
 has_income boolean:=false; has_expense boolean:=false; ids uuid[]:='{}'; prepared jsonb:='[]'; x jsonb; cash_type text; existing public.transaction_offsets;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 IF uid IS NULL OR company IS NULL OR NOT (public.has_role(uid,'admin') OR public.has_role(uid,'manager') OR public.has_role(uid,'editor')) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF p_request_id IS NULL OR p_supplier_id IS NULL OR p_date IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)<2 THEN RAISE EXCEPTION 'invalid_request'; END IF;
 IF p_items::text ~ '"(amount|paid_amount|iva_rate)"' THEN RAISE EXCEPTION 'document_values_not_editable'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('supplier',p_supplier_id,'items',p_items,'movement',p_movement,'date',p_date,'note',p_note)::text,'UTF8')),'hex');
 -- Request identity is serialized before checking the durable result.
 PERFORM pg_advisory_xact_lock(hashtextextended(company::text||p_request_id::text,335));
 SELECT * INTO g FROM public.transaction_offset_groups WHERE company_id=company AND request_id=p_request_id;
 IF FOUND THEN
  IF g.request_hash<>h THEN RAISE EXCEPTION 'request_changed'; END IF;
  IF g.status NOT IN ('applied','reversed') THEN RAISE EXCEPTION 'request_incomplete'; END IF;
  RETURN g.result || jsonb_build_object('status',g.status);
 END IF;
 PERFORM 1 FROM public.companies WHERE id=company FOR UPDATE NOWAIT;
 PERFORM 1 FROM public.suppliers WHERE id=p_supplier_id AND company_id=company FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'supplier_not_found'; END IF;
 IF p_movement IS NULL THEN amount:=0; acc:=NULL; pd:=p_date;
 ELSE
  IF jsonb_typeof(p_movement) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_movement'; END IF;
  amount:=(p_movement->>'amount')::numeric; acc:=(p_movement->>'account_id')::uuid; pd:=(p_movement->>'date')::date;
  IF amount IS NULL OR amount<>round(amount,2) OR amount=0 OR acc IS NULL OR pd IS DISTINCT FROM p_date THEN RAISE EXCEPTION 'invalid_movement'; END IF;
  PERFORM 1 FROM public.financial_accounts WHERE id=acc AND company_id=company AND type NOT IN ('cash','camarim_session') FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_not_allowed'; END IF;
 END IF;
 PERFORM 1 FROM public.events WHERE id IN (SELECT lock_f.event_id FROM public.event_forecasts lock_f WHERE lock_f.id IN (SELECT (v->>'forecast_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'forecast_id') UNION SELECT lock_t.event_id FROM public.transactions lock_t WHERE lock_t.id IN (SELECT (v->>'transaction_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'transaction_id')) ORDER BY id FOR UPDATE NOWAIT;
 -- All BP and existing transaction locks are obtained in UUID order, not display order.
 PERFORM 1 FROM public.event_forecasts WHERE id IN (SELECT (v->>'forecast_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'forecast_id') ORDER BY id FOR UPDATE NOWAIT;
 PERFORM 1 FROM public.transactions WHERE id IN (SELECT (v->>'transaction_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'transaction_id') ORDER BY id FOR UPDATE NOWAIT;
 PERFORM 1 FROM public.transaction_payments WHERE transaction_id IN (SELECT (v->>'transaction_id')::uuid FROM jsonb_array_elements(p_items) v WHERE v ? 'transaction_id') ORDER BY id FOR UPDATE NOWAIT;
 -- Resolve all items and validate before financial writes. BP creation stays in this transaction.
 FOR j IN SELECT v FROM jsonb_array_elements(p_items) v ORDER BY COALESCE((v->>'cash_order')::integer,0),COALESCE(v->>'transaction_id',v->>'forecast_id') LOOP
  IF (j ? 'transaction_id')=(j ? 'forecast_id') THEN RAISE EXCEPTION 'invalid_item'; END IF;
  IF j ? 'forecast_id' THEN
   SELECT * INTO f FROM public.event_forecasts WHERE id=(j->>'forecast_id')::uuid AND company_id=company;
   IF NOT FOUND OR f.approved_at IS NULL OR f.version_id IS NOT NULL OR f.currency<>'EUR' OR f.fx_rate IS NOT NULL OR f.cache_config_id IS NOT NULL OR f.master_forecast_id IS NOT NULL OR f.formula_type<>'fixed' THEN RAISE EXCEPTION 'forecast_not_available'; END IF;
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
  IF t.id=ANY(ids) THEN RAISE EXCEPTION 'duplicate_item'; END IF; ids:=array_append(ids,t.id);
  IF t.supplier_id IS DISTINCT FROM p_supplier_id OR t.type NOT IN ('income','expense') OR t.status NOT IN ('approved','partially_paid') OR t.reversed_at IS NOT NULL OR t.is_hidden THEN RAISE EXCEPTION 'invalid_document'; END IF;
  IF t.currency<>'EUR' OR t.fx_rate IS NOT NULL OR t.original_amount IS NOT NULL OR t.installment_group_id IS NOT NULL OR t.installment_number IS NOT NULL OR t.installment_total IS NOT NULL OR
     t.parent_transaction_id IS NOT NULL OR t.is_reimbursement OR t.cache_contract_id IS NOT NULL OR t.shared_cost_account_id IS NOT NULL OR
     COALESCE(t.declared_withholding_amount,0)<>0 OR COALESCE(t.declared_withholding_rate,0)<>0 OR EXISTS(SELECT 1 FROM public.partner_paid_expenses WHERE transaction_id=t.id) OR
     EXISTS(SELECT 1 FROM public.transaction_payments WHERE transaction_id=t.id AND (status='planned' OR credit_amount<>0 OR withholding_amount<>0 OR currency<>'EUR' OR fx_rate IS NOT NULL OR reversal_kind='supplier_credit' OR offset_group_id IS NOT NULL)) THEN RAISE EXCEPTION 'unsupported_debt'; END IF;
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
  prepared:=prepared||jsonb_build_object('id',t.id,'forecast_id',CASE WHEN j ? 'forecast_id' THEN f.id ELSE NULL END,'order',COALESCE((j->>'cash_order')::integer,0),'type',t.type,'base',t.amount,'iva',t.iva_rate,'gross',gross,'paid',paid,'debt',debt);
 END LOOP;
 IF NOT has_income OR NOT has_expense THEN RAISE EXCEPTION 'both_signs_required'; END IF;
 IF net<>amount THEN RAISE EXCEPTION '% % €',CASE WHEN (net-amount)*CASE WHEN amount<0 THEN -1 ELSE 1 END<0 THEN 'Faltam' ELSE 'Excedem' END,replace(to_char(abs(net-amount),'FM999999999990.00'),'.',',') USING DETAIL=jsonb_build_object('difference_cents',(net-amount)*100)::text; END IF;
 INSERT INTO public.transaction_offset_groups(company_id,supplier_id,request_id,request_hash,operation_date,account_id,movement_amount,note,created_by)
  VALUES(company,p_supplier_id,p_request_id,h,p_date,acc,amount,p_note,uid) RETURNING id INTO gid;
 -- Adopt existing un-applied internal pairs; reject external or already-applied pairs.
 FOR existing IN SELECT * FROM public.transaction_offsets WHERE receivable_transaction_id=ANY(ids) OR payable_transaction_id=ANY(ids) ORDER BY id FOR UPDATE NOWAIT LOOP
  IF NOT(existing.receivable_transaction_id=ANY(ids) AND existing.payable_transaction_id=ANY(ids)) OR existing.offset_group_id IS NOT NULL OR
     EXISTS(SELECT 1 FROM public.transaction_payments WHERE offset_id=existing.id AND status='paid' AND reversed_at IS NULL) THEN RAISE EXCEPTION 'legacy_offset_requires_review'; END IF;
  UPDATE public.transaction_offsets SET offset_group_id=gid WHERE id=existing.id;
 END LOOP;
 remaining:=abs(amount);
 FOR x IN SELECT v FROM jsonb_array_elements(prepared) v LOOP
  debt:=(x->>'debt')::numeric; cash:=CASE WHEN x->>'type'=cash_type THEN least(debt,remaining) ELSE 0 END; remaining:=remaining-cash;
  INSERT INTO public.transaction_offset_items(group_id,company_id,transaction_id,forecast_id,cash_order,type,base_amount,iva_rate,gross_amount,prior_paid_amount,open_amount,cash_amount,compensation_amount)
   VALUES(gid,company,(x->>'id')::uuid,(x->>'forecast_id')::uuid,(x->>'order')::integer,x->>'type',(x->>'base')::numeric,(x->>'iva')::integer,(x->>'gross')::numeric,(x->>'paid')::numeric,debt,cash,debt-cash) RETURNING id INTO iid;
  IF cash>0 THEN
   INSERT INTO public.transaction_payments(transaction_id,company_id,amount,payment_date,account_id,payment_method,status,created_by,offset_group_id,offset_item_id)
    VALUES((x->>'id')::uuid,company,cash,p_date,acc,'transfer','paid',uid::text,gid,iid);
   UPDATE public.transactions SET account_id=acc WHERE id=(x->>'id')::uuid AND account_id IS NULL;
  END IF;
  IF debt-cash>0 THEN
   INSERT INTO public.transaction_payments(transaction_id,company_id,amount,payment_date,account_id,payment_method,status,created_by,offset_group_id,offset_item_id)
    VALUES((x->>'id')::uuid,company,debt-cash,p_date,NULL,'compensation','paid',uid::text,gid,iid);
  END IF;
 END LOOP;
 FOR txid IN SELECT transaction_id FROM public.transaction_offset_items WHERE group_id=gid ORDER BY transaction_id LOOP PERFORM public._derive_paid_amount(txid); END LOOP;
 INSERT INTO public.transaction_audit_log(transaction_id,changed_by,changed_at,field_name,old_value,new_value,company_id) SELECT transaction_id,uid::text,now(),'issue335_apply',prior_paid_amount::text,jsonb_build_object('group_id',gid,'cash',cash_amount,'compensation',compensation_amount)::text,company FROM public.transaction_offset_items WHERE group_id=gid;
 INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,new_data,company_id) SELECT 'transaction_payment',id::text,'issue335_create',uid::text,to_jsonb(p),company FROM public.transaction_payments p WHERE offset_group_id=gid;
 UPDATE public.transaction_offset_groups SET status='applied',result=jsonb_build_object('group_id',gid,'status','applied','movement_amount',amount,'transaction_ids',to_jsonb(ids)) WHERE id=gid RETURNING * INTO g;
 RETURN g.result;
END $$;
CREATE OR REPLACE FUNCTION public._issue335_reverse(p_group_id uuid,p_request_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE g public.transaction_offset_groups; l public.bank_statement_lines; txid uuid; BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'editor')) THEN RAISE EXCEPTION 'permission_denied'; END IF;
 IF p_request_id IS NULL OR nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'reason_required'; END IF;
 -- Nonwaiting locks prevent cycles with legacy writers (which use inverted orders).
 PERFORM 1 FROM public.companies WHERE id=public.current_company_id() FOR UPDATE NOWAIT;
 PERFORM 1 FROM public.suppliers WHERE id IN (SELECT supplier_id FROM public.transaction_offset_groups WHERE id=p_group_id AND company_id=public.current_company_id()) ORDER BY id FOR UPDATE NOWAIT;
 -- Bank anchor before group, matching execute adapter order.
 PERFORM 1 FROM public.bank_statement_lines WHERE offset_group_id=p_group_id ORDER BY id FOR UPDATE NOWAIT;
 SELECT * INTO g FROM public.transaction_offset_groups WHERE id=p_group_id AND company_id=public.current_company_id() FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'group_not_found'; END IF;
 IF g.status='reversed' THEN
  IF g.reversal_request_id=p_request_id AND g.reversal_reason=p_reason THEN RETURN g.result||jsonb_build_object('status','reversed'); END IF;
  RAISE EXCEPTION 'already_reversed';
 END IF;
 IF g.status<>'applied' THEN RAISE EXCEPTION 'invalid_group_state'; END IF;
 PERFORM 1 FROM public.transactions WHERE id IN(SELECT transaction_id FROM public.transaction_offset_items WHERE group_id=g.id) ORDER BY id FOR UPDATE NOWAIT;
 PERFORM 1 FROM public.transaction_payments WHERE offset_group_id=g.id ORDER BY id FOR UPDATE NOWAIT;
 IF EXISTS(SELECT 1 FROM public.transaction_payments WHERE offset_group_id=g.id AND (status<>'paid' OR reversed_at IS NOT NULL)) THEN RAISE EXCEPTION 'group_ledger_divergent'; END IF;
 INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,old_data,company_id) SELECT 'transaction_payment',id::text,'issue335_reverse',auth.uid()::text,to_jsonb(p),g.company_id FROM public.transaction_payments p WHERE offset_group_id=g.id;
 INSERT INTO public.transaction_audit_log(transaction_id,changed_by,changed_at,field_name,old_value,new_value,company_id) SELECT transaction_id,auth.uid()::text,now(),'issue335_reverse',g.id::text,p_reason,g.company_id FROM public.transaction_offset_items WHERE group_id=g.id;
 UPDATE public.transaction_offset_groups SET status='reversing' WHERE id=g.id;
 UPDATE public.transaction_payments SET status='reversed',reversed_at=now(),reversed_by=auth.uid(),reversal_reason=p_reason WHERE offset_group_id=g.id;
 FOR txid IN SELECT transaction_id FROM public.transaction_offset_items WHERE group_id=g.id ORDER BY transaction_id LOOP PERFORM public._derive_paid_amount(txid); END LOOP;
 FOR l IN SELECT * FROM public.bank_statement_lines WHERE offset_group_id=g.id LOOP
  INSERT INTO public.system_audit_log(entity_type,entity_id,action,changed_by,old_data,new_data,company_id) VALUES('bank_statement_line',l.id::text,'issue335_detach',auth.uid()::text,jsonb_build_object('header',to_jsonb(l),'links',(SELECT jsonb_agg(to_jsonb(b)) FROM public.bank_line_transactions b WHERE line_id=l.id)),jsonb_build_object('status','unmatched'),g.company_id);
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

  SELECT * INTO v_payment FROM public.transaction_payments WHERE id = p_payment_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found: %', p_payment_id;
  END IF;

  IF v_payment.reversal_kind IS NOT NULL THEN
    RAISE EXCEPTION 'already_reversed: este pagamento já foi estornado (%)', v_payment.reversal_kind;
  END IF;

  IF v_payment.status <> 'paid' THEN
    RAISE EXCEPTION 'payment_not_paid: só parcelas pagas podem ser estornadas (status atual: %)', v_payment.status;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = v_payment.transaction_id FOR UPDATE NOWAIT;
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

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_tx_id FOR UPDATE NOWAIT;
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
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nada a conciliar: p_items tem de ser um array com pelo menos um item.';
  end if;

  select * into v_line from public.bank_statement_lines where id = p_line_id FOR UPDATE NOWAIT;
  if v_line.id is null then
    raise exception 'Linha do banco inexistente ou sem acesso: %', p_line_id;
  end if;

  v_current := public.current_company_id();
  if v_current is null or v_current <> v_line.company_id then
    raise exception 'A linha do banco pertence a outra empresa (%) — empresa activa %.', v_line.company_id, v_current;
  end if;

  if exists(select 1 from jsonb_array_elements(p_items) i where i->>'mode'='offset') then
    v_request := (p_items->0->>'request_id')::uuid;
    v_supplier := (p_items->0->>'supplier_id')::uuid;
    if v_line.offset_group_id is not null then
      perform 1 from public.transaction_offset_groups where id=v_line.offset_group_id and request_id=v_request;
      if not found then raise exception 'line_already_matched'; end if;
    elsif v_line.status<>'unmatched' or v_line.matched_transaction_id is not null or v_line.created_transaction_id is not null or exists(select 1 from public.bank_line_transactions where line_id=p_line_id) then
      raise exception 'line_already_matched';
    end if;
    v_group := public.transaction_offset_execute(v_request,v_supplier,p_items,
      jsonb_build_object('account_id',v_line.financial_account_id,'date',coalesce(v_line.value_date,v_line.booking_date),'amount',v_line.amount),
      coalesce(v_line.value_date,v_line.booking_date),null);
    v_gid := (v_group->>'group_id')::uuid;
    if v_group->>'status'<>'applied' then raise exception 'group_not_applied'; end if;
    if v_line.offset_group_id is not null then return; end if;
    insert into public.system_audit_log(entity_type,entity_id,action,changed_by,old_data,new_data,company_id)
      values('bank_statement_line',p_line_id::text,'issue335_attach',auth.uid()::text,to_jsonb(v_line),jsonb_build_object('group_id',v_gid,'transactions',(select jsonb_agg(transaction_id order by transaction_id) from public.transaction_offset_items where group_id=v_gid and cash_amount>0)),v_current);
    update public.bank_statement_lines set status='matched',offset_group_id=v_gid,matched_by='offset:'||auth.uid()::text,matched_at=now() where id=p_line_id;
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
 WHERE n.nspname='public' AND p.proname IN ('transaction_offset_execute','transaction_offset_reverse','_issue335_execute','_issue335_reverse','issue335_dispatch','issue335_guard','reconcile_bank_line','_apply_transaction_offset','_reverse_transaction_offsets_for','reverse_payment','reverse_transaction') AND a.grantee<>p.proowner AND a.grantee<>0 AND a.grantee NOT IN(SELECT oid FROM pg_roles WHERE rolname IN ('authenticated','service_role')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM %I',r.nspname,r.proname,r.args,(SELECT rolname FROM pg_roles WHERE oid=r.grantee));
 END LOOP;
END $$;

REVOKE ALL ON FUNCTION public._issue335_execute(uuid,uuid,jsonb,jsonb,date,text), public._issue335_reverse(uuid,uuid,text), public._apply_transaction_offset(uuid,uuid),public._reverse_transaction_offsets_for(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public._issue335_execute(uuid,uuid,jsonb,jsonb,date,text),public._issue335_reverse(uuid,uuid,text),public.issue335_guard() TO issue335_executor;
CREATE VIEW public.issue335_commands AS SELECT NULL::jsonb AS command,NULL::jsonb AS result WHERE false;
REVOKE ALL ON public.issue335_commands FROM PUBLIC,anon;
GRANT SELECT,INSERT ON public.issue335_commands TO authenticated,service_role;
CREATE FUNCTION public.issue335_dispatch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
BEGIN
 IF NEW.command->>'op'='execute' THEN
  NEW.result:=public._issue335_execute((NEW.command->>'request_id')::uuid,(NEW.command->>'supplier_id')::uuid,NEW.command->'items',NULLIF(NEW.command->'movement','null'::jsonb),(NEW.command->>'date')::date,NEW.command->>'note');
 ELSIF NEW.command->>'op'='reverse' THEN
  NEW.result:=public._issue335_reverse((NEW.command->>'group_id')::uuid,(NEW.command->>'request_id')::uuid,NEW.command->>'reason');
 ELSE RAISE EXCEPTION 'invalid_operation'; END IF;
 RETURN NEW;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'encontro_em_conflito: operação concorrente; atualize a prévia e tente novamente' USING ERRCODE='55P03';
END $$;
ALTER FUNCTION public.issue335_dispatch() OWNER TO issue335_executor;
REVOKE ALL ON FUNCTION public.issue335_dispatch() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER issue335_dispatch INSTEAD OF INSERT ON public.issue335_commands FOR EACH ROW EXECUTE FUNCTION public.issue335_dispatch();
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

COMMIT;
