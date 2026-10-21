-- #335 fase 2j — LOCAL ONLY, harness fiel PG 17.6. Nada aqui corre em Live.
-- J0 superfície da leitura de listas/SEPA/sócio; J1 matriz E coluna-a-coluna; J2 fecho selado;
-- J3 janela administrativa; J4 reabertura/fecho de evento; J5 restauro; J6 saldo A + débito; J7 camarim.
\set ON_ERROR_STOP 1
CREATE SCHEMA IF NOT EXISTS issue335_test;
SET ROLE service_role;
INSERT INTO public.user_roles(user_id,role,company_id) VALUES
 ('00000000-0000-0000-0000-000000000016','manager','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000017','editor','00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
RESET ROLE;
CREATE TABLE IF NOT EXISTS issue335_test.j(k text PRIMARY KEY, v uuid);

-- Cria um encontro aplicado (+100 receita / −40 despesa / movimento 60) como o admin de teste.
CREATE OR REPLACE FUNCTION issue335_test.j_group(p_k text, p_extra jsonb DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE a uuid; b uuid; g uuid; BEGIN
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id,event_id,event_settlement_id)
  VALUES(public.current_company_id(),'approved','income','2j '||p_k||'+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020',
         (p_extra->>'event_id')::uuid,(p_extra->>'event_settlement_id')::uuid) RETURNING id INTO a;
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id)
  VALUES(public.current_company_id(),'approved','expense','2j '||p_k||'-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 SELECT (public.transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',
   jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset')),
   '{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13')->>'group_id')::uuid INTO g;
 INSERT INTO issue335_test.j VALUES(p_k||':a',a),(p_k||':b',b),(p_k||':g',g) ON CONFLICT(k) DO UPDATE SET v=excluded.v;
 RETURN g;
END $$;
GRANT USAGE ON SCHEMA issue335_test TO authenticated;
GRANT ALL ON issue335_test.j TO authenticated;
GRANT EXECUTE ON FUNCTION issue335_test.j_group(text,jsonb) TO authenticated;

-- ===================== J0 — superfície da leitura (alternativa à policy da 2i) =====================
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['payment_lists','payment_list_items','payment_list_sepa_exports','partner_paid_expenses'] LOOP
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname LIKE 'issue335%') THEN RAISE EXCEPTION 'J0 policy issue335 em %',t; END IF;
  IF has_table_privilege('issue335_executor','public.'||t,'SELECT') THEN RAISE EXCEPTION 'J0 executor com SELECT em %',t; END IF;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','sandbox_exec','sandbox_exec_sfohvvlqccmmebvjgibx'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) AND has_function_privilege(r,'public.issue335_payment_flow_blocked(uuid)','EXECUTE') THEN RAISE EXCEPTION 'J0 % executa a função de leitura',r; END IF;
 END LOOP;
 IF NOT has_function_privilege('issue335_executor','public.issue335_payment_flow_blocked(uuid)','EXECUTE') THEN RAISE EXCEPTION 'J0 executor sem EXECUTE'; END IF;
 IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=public, pg_catalog'] FROM pg_proc WHERE oid='public.issue335_payment_flow_blocked(uuid)'::regprocedure) THEN RAISE EXCEPTION 'J0 definer/search_path'; END IF;
 IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='public.issue335_payment_flow_blocked(uuid)'::regprocedure)<>'postgres' THEN RAISE EXCEPTION 'J0 dono'; END IF;
 RAISE NOTICE 'PASS 2j J0 superfície: zero policies/GRANTs novos nas 4 tabelas; função DEFINER dono postgres, search_path fixo, EXECUTE só executor';
END $$;
-- ANTES/DEPOIS na mesma base: com o GRANT de tabela da 2h (sem policy) o executor vê ZERO linhas (fail-open);
-- a função vê a linha. Reposto por ROLLBACK.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
BEGIN;
DO $$ DECLARE a uuid; l uuid; raw int; fn boolean; BEGIN
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(public.current_company_id(),'approved','expense','2j J0',10,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO public.payment_lists(id,title,status,company_id) VALUES(gen_random_uuid(),'LOCAL J0','draft',public.current_company_id()) RETURNING id INTO l;
 INSERT INTO public.payment_list_items(transaction_id,payment_list_id,company_id) VALUES(a,l,public.current_company_id());
 GRANT SELECT ON public.payment_lists,public.payment_list_items TO issue335_executor; -- estado 2h, só nesta transacção
 SET LOCAL ROLE issue335_executor;
 SELECT count(*) INTO raw FROM public.payment_list_items WHERE transaction_id=a;
 fn:=public.issue335_payment_flow_blocked(a);
 RESET ROLE;
 IF raw<>0 THEN RAISE EXCEPTION 'J0 ANTES: esperado 0 linhas visíveis sob RLS, obtido %',raw; END IF;
 IF fn IS NOT TRUE THEN RAISE EXCEPTION 'J0 DEPOIS: função não vê a lista'; END IF;
 RAISE NOTICE 'PASS 2j J0 ANTES (GRANT sem policy) executor vê % linhas = fail-open; DEPOIS função = %',raw,fn;
END $$;
ROLLBACK;
-- Despesa de sócio (partner_paid_expenses) também recusa pela função (unsupported_debt).
SET ROLE authenticated;
BEGIN;
DO $$ DECLARE a uuid; b uuid; ev uuid; BEGIN
 INSERT INTO public.events(id,company_id,budget_mode,name,date,event_nature) VALUES(gen_random_uuid(),public.current_company_id(),'without_bp','2j sócio','2026-10-13','producao_propria') RETURNING id INTO ev;
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(public.current_company_id(),'approved','income','2j ppe+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id,event_id) VALUES(public.current_company_id(),'approved','expense','2j ppe-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020',ev) RETURNING id INTO b;
 -- 2j: partner_id referencia event_partners (FK real).
 INSERT INTO public.event_partners(id,company_id,event_id,supplier_id) VALUES(gen_random_uuid(),public.current_company_id(),ev,'00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO public.partner_paid_expenses(event_id,partner_id,transaction_id) VALUES(ev,a,b);
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(public.current_company_id(),'approved','income','2j ppe+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 BEGIN PERFORM public.transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset')),'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13'); RAISE EXCEPTION 'J0 ppe aceite';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'unsupported_debt' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS 2j J0 despesa paga por sócio recusada (unsupported_debt)';
END $$;
ROLLBACK;
RESET ROLE;

-- ===================== J1 — E: matriz coluna-a-coluna =====================
SET ROLE authenticated;
SELECT issue335_test.j_group('E');
INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id)
 VALUES(public.current_company_id(),'approved','income','2j legado',50,0,'2026-10-13','00000000-0000-0000-0000-000000000020');
INSERT INTO issue335_test.j SELECT 'E:legacy',id FROM public.transactions WHERE description='2j legado' ORDER BY created_at DESC LIMIT 1 ON CONFLICT(k) DO UPDATE SET v=excluded.v;
INSERT INTO public.transaction_payments(transaction_id,amount,payment_date,account_id,payment_method)
 SELECT v,10,'2026-10-13','00000000-0000-0000-0000-000000000030','transfer' FROM issue335_test.j WHERE k='E:legacy';
RESET ROLE;
CREATE OR REPLACE FUNCTION issue335_test.e_value(p_udt text,p_col text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE
  WHEN p_udt='uuid' THEN 'gen_random_uuid()'
  WHEN p_udt IN('text','varchar') THEN quote_literal('j2e-'||p_col)
  WHEN p_udt='bool' THEN format('NOT coalesce(%I,false)',p_col)
  WHEN p_udt IN('numeric','int4','int8','float8') THEN format('coalesce(%I,0)+1',p_col)
  WHEN p_udt='date' THEN format('coalesce(%I,DATE ''2026-10-13'')+1',p_col)
  WHEN p_udt='timestamptz' THEN format('coalesce(%I,now())+interval ''1 day''',p_col)
  WHEN p_udt='jsonb' THEN '''{"j2e":1}''::jsonb'
  ELSE NULL END
$$;
CREATE TABLE IF NOT EXISTS issue335_test.e_matrix(tbl text,col text,actor text,target text,state text,msg text);
TRUNCATE issue335_test.e_matrix;
DO $$ DECLARE c record; w record; tg record; val text; n int; st text; m text; BEGIN
 FOR w IN SELECT * FROM (VALUES('manager','00000000-0000-0000-0000-000000000016'),('editor','00000000-0000-0000-0000-000000000017')) x(r,u) LOOP
  FOR tg IN SELECT 'transactions' tbl,'gerido' tgt,v id FROM issue335_test.j WHERE k='E:a'
            UNION ALL SELECT 'transactions','legado',v FROM issue335_test.j WHERE k='E:legacy'
            UNION ALL SELECT 'transaction_payments','gerido',(SELECT p.id FROM public.transaction_payments p JOIN issue335_test.j j ON j.v=p.transaction_id AND j.k='E:a' WHERE p.payment_method='transfer')
            UNION ALL SELECT 'transaction_payments','legado',(SELECT p.id FROM public.transaction_payments p JOIN issue335_test.j j ON j.v=p.transaction_id AND j.k='E:legacy') LOOP
   FOR c IN SELECT column_name,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=tg.tbl AND is_generated='NEVER' ORDER BY ordinal_position LOOP
    val:=issue335_test.e_value(c.udt_name,c.column_name);
    IF val IS NULL THEN INSERT INTO issue335_test.e_matrix VALUES(tg.tbl,c.column_name,w.r,tg.tgt,'skip','tipo '||c.udt_name); CONTINUE; END IF;
    PERFORM set_config('request.jwt.claim.sub',w.u,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
     EXECUTE format('UPDATE public.%I SET %I=%s WHERE id=$1',tg.tbl,c.column_name,val) USING tg.id;
     GET DIAGNOSTICS n=ROW_COUNT;
     RAISE EXCEPTION 'j2e_applied:%',n USING ERRCODE='P0335';
    EXCEPTION WHEN OTHERS THEN st:=SQLSTATE; m:=SQLERRM; END;
    EXECUTE 'RESET ROLE';
    INSERT INTO issue335_test.e_matrix VALUES(tg.tbl,c.column_name,w.r,tg.tgt,st,left(m,160));
   END LOOP;
  END LOOP;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
END $$;
-- Colunas que, num documento gerido, TÊM de ser recusadas (mudam dinheiro, partes, ligação ao grupo, ou são
-- condições de elegibilidade que o encontro verificou e não podem passar a verdadeiras depois).
CREATE TABLE IF NOT EXISTS issue335_test.e_required(tbl text,col text);
TRUNCATE issue335_test.e_required;
INSERT INTO issue335_test.e_required SELECT 'transactions',unnest(ARRAY[
 'id','company_id','type','supplier_id','amount','iva_rate','status','paid_amount','payment_date','account_id','event_id','forecast_id',
 'is_hidden','reversed_at','reversal_kind','reversal_reason','reversed_by','event_settlement_id',
 'currency','fx_rate','original_amount','installment_group_id','installment_number','installment_total','card_session_id','held_by_supplier_id',
 'settlement_id','is_transitory','supplier_credit_id','parent_transaction_id','is_reimbursement','cache_contract_id','shared_cost_account_id',
 'declared_withholding_amount','declared_withholding_rate','split_percentage','split_amount','split_mode','payment_method']);
INSERT INTO issue335_test.e_required SELECT 'transaction_payments',column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='transaction_payments' AND is_generated='NEVER';
-- Relatório completo (vai para o .out e é anexado ao relatório).
SELECT tbl,col,actor,target,state,msg FROM issue335_test.e_matrix ORDER BY tbl,target,col,actor;
DO $$ DECLARE bad text; leg text; BEGIN
 -- Gerido: cada coluna obrigatória tem de ser recusada por um trigger/RLS ANTES de qualquer FK/CHECK
 -- (23503/23514 = só a FK/CHECK travou: com um valor válido passaria) e nunca aplicada.
 SELECT string_agg(DISTINCT m.tbl||'.'||m.col||'('||m.actor||':'||m.state||')',', ') INTO bad
  FROM issue335_test.e_matrix m JOIN issue335_test.e_required r USING(tbl,col)
  WHERE m.target='gerido' AND m.state<>'skip' AND (m.state IN('P0335','23503','23514','23502','22P02','22007') AND m.msg NOT LIKE 'j2e_applied:0');
 IF bad IS NOT NULL THEN RAISE EXCEPTION 'E coluna obrigatória não protegida em documento gerido: %',bad; END IF;
 -- Legado: nenhuma recusa vem da guarda do #335.
 SELECT string_agg(DISTINCT m.tbl||'.'||m.col,', ') INTO leg FROM issue335_test.e_matrix m
  WHERE m.target='legado' AND m.msg IN('reverse_entire_group','managed_operation_required','managed_bank_anchor_immutable')
    -- colunas criadas pelo próprio #335: não existem no legado; ligar um pagamento antigo a um grupo É um ataque.
    AND NOT (m.tbl='transaction_payments' AND m.col IN('offset_group_id','offset_item_id'));
 IF leg IS NOT NULL THEN RAISE EXCEPTION 'E documento sem grupo afectado pela guarda #335: %',leg; END IF;
 RAISE NOTICE 'PASS 2j J1 E: % ataques; colunas obrigatórias recusadas em documento gerido (manager e editor); legado sem guarda #335',(SELECT count(*) FROM issue335_test.e_matrix);
END $$;

-- ===================== J2 — fecho selado =====================
-- Encontro recusado em transacção de fecho selado; estorno do grupo recusado depois de selar; reabrir → estorno ok.
SET ROLE authenticated;
DO $$ DECLARE ev uuid; es uuid; g uuid; BEGIN
 INSERT INTO public.events(id,company_id,budget_mode,name,date,event_nature) VALUES(gen_random_uuid(),public.current_company_id(),'without_bp','2j selo','2026-10-13','producao_propria') RETURNING id INTO ev;
 INSERT INTO public.event_settlements(id,event_id,company_id,name,is_sealed) VALUES(gen_random_uuid(),ev,public.current_company_id(),'LOCAL 2j',false) RETURNING id INTO es;
 g:=issue335_test.j_group('S',jsonb_build_object('event_id',ev,'event_settlement_id',es));
 PERFORM public.seal_event_settlement(es,'{"check1":0,"check2":0}'::jsonb,NULL,'LOCAL 2j');
 BEGIN PERFORM public.transaction_offset_reverse(g,gen_random_uuid(),'2j selado'); RAISE EXCEPTION 'J2 estorno aceite em fecho selado';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'sealed_settlement%' THEN RAISE; END IF; END;
 -- writer existente: reverse_payment num pagamento gerido continua recusado (guarda #335) — não contorna o selo.
 BEGIN PERFORM public.reverse_payment((SELECT id FROM public.transaction_payments WHERE offset_group_id=g AND payment_method='transfer'),'cash_refund','2j',NULL,NULL); RAISE EXCEPTION 'J2 reverse_payment aceite';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT IN('reverse_entire_group','managed_operation_required') AND SQLERRM NOT LIKE '%selad%' THEN RAISE; END IF; END;
 PERFORM public.unseal_event_settlement(es,'LOCAL 2j reabrir');
 PERFORM public.transaction_offset_reverse(g,gen_random_uuid(),'2j após reabrir');
 IF (SELECT status FROM public.transaction_offset_groups WHERE id=g)<>'reversed' THEN RAISE EXCEPTION 'J2 estorno após reabrir'; END IF;
 RAISE NOTICE 'PASS 2j J2 fecho selado: estorno recusado selado, reverse_payment recusado, estorno ok após reabrir';
END $$;
RESET ROLE;

-- ===================== J3 — janela administrativa =====================
-- Linha BP com categoria allocate_to_active_event dentro de uma janela de outro evento: criação recusada pelo trigger
-- real enforce_admin_window_event, atómica (zero grupo/transacção/pagamento).
DO $$ DECLARE win uuid; ev uuid; cat uuid; f uuid; a uuid; n0 bigint; BEGIN
 SET LOCAL ROLE service_role;
 -- 2j: a flag só é aceite em L3 do Grupo 10 (validate_category_allocate_flag real) → plano local 10 > 10.9 > 10.9.35.
 INSERT INTO public.account_categories(id,company_id,code,name,type,parent_id) VALUES('00000000-0000-0000-0000-000000000060','00000000-0000-0000-0000-000000000001','10','LOCAL G10','expense',NULL) ON CONFLICT DO NOTHING;
 INSERT INTO public.account_categories(id,company_id,code,name,type,parent_id) VALUES('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000001','10.9','LOCAL G10.9','expense','00000000-0000-0000-0000-000000000060') ON CONFLICT DO NOTHING;
 INSERT INTO public.account_categories(company_id,code,name,type,parent_id,allocate_to_active_event) VALUES('00000000-0000-0000-0000-000000000001','10.9.35','LOCAL janela','expense','00000000-0000-0000-0000-000000000061',true) RETURNING id INTO cat;
 INSERT INTO public.events(id,company_id,name,date,event_nature,absorbs_admin_costs,admin_window_start,admin_window_end) VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000001','2j janela','2026-10-01','producao_propria',true,'2026-10-01','2026-10-31') RETURNING id INTO win;
 RESET ROLE;
 INSERT INTO issue335_test.j VALUES('W:cat',cat),('W:win',win) ON CONFLICT(k) DO UPDATE SET v=excluded.v;
EXCEPTION WHEN undefined_column THEN RAISE NOTICE 'J3 colunas de janela diferentes: %',SQLERRM; RAISE;
END $$;
SET ROLE authenticated;
DO $$ DECLARE ev uuid; f uuid; b uuid; n0 bigint; n1 bigint; BEGIN
 INSERT INTO public.events(id,company_id,budget_mode,name,date,event_nature) VALUES(gen_random_uuid(),public.current_company_id(),'without_bp','2j fora da janela','2026-10-13','producao_propria') RETURNING id INTO ev;
 INSERT INTO public.event_forecasts(id,company_id,event_id,category_id,type,description,amount,iva_rate,approved_at)
  VALUES(gen_random_uuid(),public.current_company_id(),ev,(SELECT v FROM issue335_test.j WHERE k='W:cat'),'expense','2j janela BP',100,0,now()) RETURNING id INTO f;
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(public.current_company_id(),'approved','income','2j janela+',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 SELECT count(*) INTO n0 FROM public.transactions;
 BEGIN PERFORM public.transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',jsonb_build_array(jsonb_build_object('forecast_id',f,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset')),'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":-60}','2026-10-13'); RAISE EXCEPTION 'J3 janela contornada';
 EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'42501' OR SQLERRM NOT LIKE 'Esta conta é custo do evento%' THEN RAISE; END IF; END;
 SELECT count(*) INTO n1 FROM public.transactions;
 IF n1<>n0 OR EXISTS(SELECT 1 FROM public.transaction_payments WHERE transaction_id=b) THEN RAISE EXCEPTION 'J3 escrita parcial'; END IF;
 RAISE NOTICE 'PASS 2j J3 janela administrativa: criação a partir do BP recusada pelo trigger real (42501), atómica';
END $$;
-- Mudar a janela depois de existir um grupo não mexe em transacções/pagamentos; a contiguidade real continua a valer.
DO $$ DECLARE g uuid; BEGIN
 g:=issue335_test.j_group('W2');
 BEGIN UPDATE public.events SET admin_window_end='2026-09-01' WHERE id=(SELECT v FROM issue335_test.j WHERE k='W:win'); EXCEPTION WHEN OTHERS THEN NULL; END;
 IF (SELECT count(*) FROM public.transaction_payments WHERE offset_group_id=g AND status='paid')<>3 THEN RAISE EXCEPTION 'J3 janela alterou grupo'; END IF;
 RAISE NOTICE 'PASS 2j J3b alteração da janela não toca nas pernas do grupo (3 pagas)';
END $$;

-- ===================== J4 — fecho/reabertura de evento =====================
DO $$ DECLARE ev uuid; f uuid; b uuid; g uuid; BEGIN
 INSERT INTO public.events(id,company_id,budget_mode,name,date,event_nature) VALUES(gen_random_uuid(),public.current_company_id(),'without_bp','2j fecho','2026-10-13','producao_propria') RETURNING id INTO ev;
 g:=issue335_test.j_group('C',jsonb_build_object('event_id',ev));
 UPDATE public.events SET status='completed' WHERE id=ev;  -- enforce_event_close_blockers real: grupo não é bloqueio
 INSERT INTO public.event_forecasts(id,company_id,event_id,category_id,type,description,amount,iva_rate,approved_at) VALUES(gen_random_uuid(),public.current_company_id(),ev,'00000000-0000-0000-0000-000000000052','income','2j fechado BP',100,0,now()) RETURNING id INTO f;
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(public.current_company_id(),'approved','expense','2j fechado-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 BEGIN PERFORM public.transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',jsonb_build_array(jsonb_build_object('forecast_id',f,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset')),'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13'); RAISE EXCEPTION 'J4 BP em evento fechado';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT IN('event_closed','forecast_not_available') AND SQLERRM NOT LIKE 'Evento%' AND SQLERRM NOT LIKE '%conclu%' THEN RAISE; END IF; END;
 -- Reabrir: o trigger real enforce_event_reopen_permission continua a decidir (manager sem reopen_event recusado).
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000016',true);
 BEGIN UPDATE public.events SET status='active' WHERE id=ev; RAISE EXCEPTION 'J4 reabertura sem permissão';
 EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>'42501' THEN RAISE; END IF; END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
 IF (SELECT status FROM public.transaction_offset_groups WHERE id=g)<>'applied' THEN RAISE EXCEPTION 'J4 grupo mexido'; END IF;
 RAISE NOTICE 'PASS 2j J4 fecho real aceita evento com grupo; criação BP em evento fechado recusada; reabertura sem permissão 42501';
END $$;
RESET ROLE;

-- ===================== J5 — restauro (função real restore_apply_from_shadow) =====================
-- O restauro desliga os triggers de utilizador (por desenho) e, num restauro por tabela, pode deixar o grupo
-- incoerente. Prova: restauro de transaction_payments sem as tabelas de grupo → vigias do #335 acendem.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT issue335_test.j_group('R');
RESET ROLE;
DO $$ DECLARE g uuid:=(SELECT v FROM issue335_test.j WHERE k='R:g'); before bigint; after bigint; BEGIN
 SELECT coalesce(sum(current_count),0) INTO before FROM public.issue335_invariant_counts();
 SET LOCAL ROLE service_role;
 PERFORM public.restore_shadow_prepare(ARRAY['transaction_payments']);
 EXECUTE 'INSERT INTO restore_shadow.public__transaction_payments SELECT * FROM public.transaction_payments WHERE offset_group_id IS DISTINCT FROM $1' USING g;
 PERFORM public.restore_apply_from_shadow('company','00000000-0000-0000-0000-000000000001',ARRAY['transaction_payments'],NULL);
 RESET ROLE;
 SELECT coalesce(sum(current_count),0) INTO after FROM public.issue335_invariant_counts();
 IF (SELECT status FROM public.transaction_offset_groups WHERE id=g)<>'applied' OR EXISTS(SELECT 1 FROM public.transaction_payments WHERE offset_group_id=g) THEN RAISE EXCEPTION 'J5 cenário não reproduzido'; END IF;
 IF after<=before THEN RAISE EXCEPTION 'J5 restauro parcial deixou grupo incoerente SEM vigia (antes %, depois %)',before,after; END IF;
 RAISE NOTICE 'ACHADO 2j J5: restauro por tabela contorna a guarda (triggers desligados por desenho) e deixa grupo applied sem pernas; DETECTADO pelas vigias #335 (% → %). Não impedido.',before,after;
END $$;
ROLLBACK;

-- ===================== J6 — A: matriz de saldo lado a lado com as funções de Live =====================
-- legacy_* = cópias byte-iguais das funções instaladas em Live (live/phase2e-balance-baseline.sql).
CREATE TABLE IF NOT EXISTS issue335_test.a_matrix(caso text,conta text,live numeric,candidato numeric,esperado numeric);
TRUNCATE issue335_test.a_matrix;
SET ROLE service_role;
INSERT INTO public.financial_accounts(id,company_id,name,type,initial_balance,initial_balance_date) VALUES
 ('00000000-0000-0000-0000-0000000003a1','00000000-0000-0000-0000-000000000001','LOCAL A1','bank',0,'2026-10-12'),
 ('00000000-0000-0000-0000-0000000003a2','00000000-0000-0000-0000-000000000001','LOCAL A2 (X prévio)','bank',0,'2026-10-12')
ON CONFLICT DO NOTHING;
RESET ROLE;
CREATE OR REPLACE FUNCTION issue335_test.a_snap(p_caso text,p_esp1 numeric,p_esp2 numeric,p_asof date DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
 INSERT INTO issue335_test.a_matrix
 SELECT p_caso,n,
  CASE WHEN p_asof IS NULL THEN issue335_test.legacy_account_true_balance_raw(a) ELSE issue335_test.legacy_account_true_balance_asof_raw(a,p_asof) END,
  CASE WHEN p_asof IS NULL THEN public._account_true_balance_raw(a) ELSE public._account_true_balance_asof_raw(a,p_asof) END, e
 FROM (VALUES('A1','00000000-0000-0000-0000-0000000003a1'::uuid,p_esp1),('A2','00000000-0000-0000-0000-0000000003a2'::uuid,p_esp2)) v(n,a,e)
$$;
SET ROLE authenticated;
DO $$ DECLARE a uuid; b uuid; c uuid; d uuid; g uuid; o uuid; BEGIN
 -- 1) legado: pagamento real na própria conta.
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id,account_id) VALUES(public.current_company_id(),'approved','income','A legado',50,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-0000000003a1') RETURNING id INTO a;
 INSERT INTO public.transaction_payments(transaction_id,amount,payment_date,account_id,payment_method) VALUES(a,50,'2026-10-13','00000000-0000-0000-0000-0000000003a1','transfer');
 PERFORM issue335_test.a_snap('1 legado transfer',50,0);
 -- 2) payment_method='compensation' na transacção: trigger real limpa a conta → não conta em lado nenhum.
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id,account_id,payment_method) VALUES(public.current_company_id(),'approved','income','A comp',30,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-0000000003a1','compensation') RETURNING id INTO b;
 IF (SELECT account_id FROM public.transactions WHERE id=b) IS NOT NULL THEN RAISE EXCEPTION 'A2 trigger compensation não limpou conta'; END IF;
 PERFORM issue335_test.a_snap('2 método compensation na tx',50,0);
 -- 3) compensação legada par-a-par (transaction_offsets): receita paga 100 em A1, despesa compensada sem conta.
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id,account_id) VALUES(public.current_company_id(),'approved','income','A par+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-0000000003a1') RETURNING id INTO c;
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(public.current_company_id(),'approved','expense','A par-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO d;
 INSERT INTO public.transaction_offsets(receivable_transaction_id,payable_transaction_id,amount) VALUES(c,d,40);
 INSERT INTO public.transaction_payments(transaction_id,amount,payment_date,account_id,payment_method) VALUES(c,100,'2026-10-13','00000000-0000-0000-0000-0000000003a1','transfer');
 IF (SELECT paid_amount FROM public.transactions WHERE id=d)<>40 THEN RAISE EXCEPTION 'A3 par legado não compensou'; END IF;
 PERFORM issue335_test.a_snap('3 par legado transaction_offsets',150,0);
 -- 4) encontro com account_id PRÉVIO X=A2 na receita; dinheiro entra em A1.
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id,account_id) VALUES(public.current_company_id(),'approved','income','A enc+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-0000000003a2') RETURNING id INTO a;
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(public.current_company_id(),'approved','expense','A enc-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 g:=(public.transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset')),'{"account_id":"00000000-0000-0000-0000-0000000003a1","date":"2026-10-13","amount":60}','2026-10-13')->>'group_id')::uuid;
 IF (SELECT account_id FROM public.transactions WHERE id=a)<>'00000000-0000-0000-0000-0000000003a2' THEN RAISE EXCEPTION 'A4 núcleo reatribuiu account_id'; END IF;
 PERFORM issue335_test.a_snap('4 encontro, conta X prévia',210,0);
 -- 5) as-of: antes do corte (12/10) zero; no dia (13/10) igual ao total.
 PERFORM issue335_test.a_snap('5a as-of 12/10',0,0,'2026-10-12');
 PERFORM issue335_test.a_snap('5b as-of 13/10',210,0,'2026-10-13');
 -- 6) guarda de débito no servidor: account_has_balance_for usa _account_true_balance_raw.
 IF NOT public.account_has_balance_for('00000000-0000-0000-0000-0000000003a1',210) OR public.account_has_balance_for('00000000-0000-0000-0000-0000000003a1',210.01) THEN RAISE EXCEPTION 'A6 débito A1'; END IF;
 IF public.account_has_balance_for('00000000-0000-0000-0000-0000000003a2',0.01) THEN RAISE EXCEPTION 'A6 débito A2: saldo fantasma autoriza saída'; END IF;
 -- 7) estorno integral do encontro.
 PERFORM public.transaction_offset_reverse(g,gen_random_uuid(),'A estorno');
 PERFORM issue335_test.a_snap('7 após estorno',150,0);
 -- 8) encontro a débito (despesas > receitas), dinheiro sai de A1.
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(public.current_company_id(),'approved','income','A deb+',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(public.current_company_id(),'approved','expense','A deb-',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 PERFORM public.transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',jsonb_build_array(jsonb_build_object('transaction_id',b,'mode','settle'),jsonb_build_object('transaction_id',a,'mode','offset')),'{"account_id":"00000000-0000-0000-0000-0000000003a1","date":"2026-10-13","amount":-60}','2026-10-13');
 PERFORM issue335_test.a_snap('8 encontro a débito',90,0);
END $$;
RESET ROLE;
SELECT caso,conta,live,candidato,esperado,CASE WHEN live<>candidato THEN 'DIFERE' ELSE '' END FROM issue335_test.a_matrix ORDER BY caso,conta;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM issue335_test.a_matrix WHERE candidato IS DISTINCT FROM esperado) THEN
  RAISE EXCEPTION 'A candidato ≠ esperado: %',(SELECT string_agg(caso||'/'||conta||' '||candidato||'≠'||esperado,'; ') FROM issue335_test.a_matrix WHERE candidato IS DISTINCT FROM esperado); END IF;
 IF EXISTS(SELECT 1 FROM issue335_test.a_matrix WHERE caso<'4' AND live IS DISTINCT FROM candidato) THEN RAISE EXCEPTION 'A legado diverge do Live sem encontro'; END IF;
 IF NOT EXISTS(SELECT 1 FROM issue335_test.a_matrix WHERE caso LIKE '4%' AND live<>candidato) THEN RAISE EXCEPTION 'A defeito Live não reproduzido no caso 4'; END IF;
 RAISE NOTICE 'PASS 2j J6 A: 8 casos; legado igual ao Live; encontro: candidato = dinheiro real, Live difere (defeito reproduzido); débito servidor coerente';
END $$;

-- ===================== J7 — camarim (triggers reais) =====================
SET ROLE authenticated;
DO $$ DECLARE s uuid; sa uuid; bk uuid; st uuid; inc uuid; mv uuid; r text; BEGIN
 INSERT INTO public.camarim_sessions(id,title,company_id) VALUES(gen_random_uuid(),'LOCAL 2j camarim',public.current_company_id()) RETURNING id,advance_account_id INTO s,sa;
 IF sa IS NULL THEN RAISE EXCEPTION 'J7 trigger real não criou conta da sessão'; END IF;
 -- adiantamento: saída do banco (expense, conta banco) + gémea na conta da sessão (income), como o modal cria.
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id,account_id) VALUES(public.current_company_id(),'approved','expense','Camarim adiantamento 2j',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000030') RETURNING id INTO bk;
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,account_id) VALUES(public.current_company_id(),'approved','income','Camarim adiantamento 2j',40,0,'2026-10-13',sa) RETURNING id INTO st;
 INSERT INTO public.camarim_fund_moves(session_id,move_type,amount,move_date,transaction_id,company_id) VALUES(s,'advance',40,'2026-10-13',bk,public.current_company_id()) RETURNING id INTO mv;
 IF NOT EXISTS(SELECT 1 FROM public._camarim_fund_move_legs(mv) l WHERE l.bank_tx=bk AND l.session_tx=st) THEN RAISE EXCEPTION 'J7 pernas camarim não reconhecidas'; END IF;
 INSERT INTO public.transactions(company_id,status,type,description,amount,iva_rate,date,supplier_id) VALUES(public.current_company_id(),'approved','income','2j camarim+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO inc;
 BEGIN
  PERFORM public.transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',jsonb_build_array(jsonb_build_object('transaction_id',inc,'mode','settle'),jsonb_build_object('transaction_id',bk,'mode','offset')),'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13');
  r:='aceite; espelho na sessão='||coalesce((SELECT sum(amount)::text FROM public.transaction_payments WHERE transaction_id=st AND status='paid'),'0')||' método '||coalesce((SELECT string_agg(payment_method,',') FROM public.transaction_payments WHERE transaction_id=st),'-');
  RAISE EXCEPTION 'J7 ANTES: encontro sobre perna de camarim %',r;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'camarim_leg_unsupported%' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM public.transaction_payments WHERE transaction_id IN(bk,st,inc)) THEN RAISE EXCEPTION 'J7 escrita parcial'; END IF;
 RAISE NOTICE 'PASS 2j J7 camarim: perna de adiantamento recusada (camarim_leg_unsupported), zero pagamentos, conta da sessão intacta';
END $$;
RESET ROLE;
