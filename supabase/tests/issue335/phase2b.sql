-- All fixtures and fault injection are disposable LOCAL ONLY.
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false),set_config('issue335.ignored_company','00000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE g uuid; p uuid; t uuid; BEGIN
 SELECT id INTO g FROM transaction_offset_groups WHERE status='applied' LIMIT 1;
 SELECT id,transaction_id INTO p,t FROM transaction_payments WHERE offset_group_id=g LIMIT 1;
 PERFORM set_config('issue335.authorized','true',true);
 BEGIN EXECUTE 'SET ROLE issue335_executor'; RAISE EXCEPTION 'role forged'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM _issue335_reverse(g,gen_random_uuid(),'attack'); RAISE EXCEPTION 'internal helper exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM issue335_dispatch(); RAISE EXCEPTION 'trigger helper exposed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO transaction_payments(transaction_id,amount,payment_date,offset_group_id,offset_item_id) VALUES(t,1,'2026-10-13',gen_random_uuid(),gen_random_uuid()); RAISE EXCEPTION 'invented leg accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'managed_operation_required' THEN RAISE; END IF; END;
 BEGIN DELETE FROM transaction_payments WHERE id=p; RAISE EXCEPTION 'managed deletion accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'reverse_entire_group' THEN RAISE; END IF; END;
 BEGIN UPDATE transaction_payments SET offset_group_id=NULL,offset_item_id=NULL WHERE id=p; RAISE EXCEPTION 'identity erased'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'reverse_entire_group' THEN RAISE; END IF; END;
 BEGIN PERFORM reverse_payment(p,'cash_refund','attack'); RAISE EXCEPTION 'managed payment reversed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'reverse_entire_group' THEN RAISE; END IF; END;
 BEGIN PERFORM reverse_transaction(t,'cash_refund','attack',NULL,false); RAISE EXCEPTION 'managed tx reversed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'reverse_entire_group' THEN RAISE; END IF; END;
 BEGIN UPDATE transaction_offsets SET note='attack' WHERE offset_group_id IS NOT NULL; RAISE EXCEPTION 'legacy edit accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'managed_operation_required' THEN RAISE; END IF; END;
 BEGIN DELETE FROM transaction_offsets WHERE offset_group_id IS NOT NULL; RAISE EXCEPTION 'legacy deletion accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'managed_operation_required' THEN RAISE; END IF; END;
 IF NOT has_function_privilege('authenticated','public._apply_transaction_offset(uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public._issue335_execute(uuid,uuid,jsonb,jsonb,date,text)','EXECUTE') THEN RAISE EXCEPTION 'ACL exposed'; END IF;
 RAISE NOTICE 'PASS attacks: SET ROLE, spoofed GUC, helpers, invented IDs, delete/edit/reverse legs and legacy pairs';
END $$;
RESET SESSION AUTHORIZATION;
-- Roles are real session identities; hosted JWT/company helpers are still local substitutes.
INSERT INTO public.user_roles VALUES('00000000-0000-0000-0000-000000000012','manager');
SET SESSION AUTHORIZATION anon;
DO $$ BEGIN
 IF has_table_privilege(current_user,'public.transaction_offset_groups','SELECT') OR has_function_privilege(current_user,'public.transaction_offset_execute(uuid,uuid,jsonb,jsonb,date,text)','EXECUTE') OR has_function_privilege(current_user,'public.issue335_dispatch()','EXECUTE') THEN RAISE EXCEPTION 'anon access'; END IF;
 RAISE NOTICE 'PASS matrix anon: tables/RPCs/helpers denied';
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000099',false);
DO $$ DECLARE r jsonb; BEGIN
 IF EXISTS(SELECT 1 FROM transaction_offset_groups) THEN RAISE EXCEPTION 'no-role read'; END IF;
 BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020','[]',NULL,'2026-10-13'); RAISE EXCEPTION 'no-role execute'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'permission_denied' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS matrix authenticated without role: no read/no execute';
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',false);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM transaction_offset_groups) THEN RAISE EXCEPTION 'staff read'; END IF;
 BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020','[]',NULL,'2026-10-13'); RAISE EXCEPTION 'staff validation bypass'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'invalid_request' THEN RAISE; END IF; END;
 IF has_table_privilege(current_user,'public.transaction_offset_groups','INSERT') OR has_function_privilege(current_user,'public._issue335_reverse(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'staff writes/helpers'; END IF;
 RAISE NOTICE 'PASS matrix staff: read, authorized validation; direct writes/helpers denied';
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claim.sub','',false);
DO $$ BEGIN
 IF has_table_privilege(current_user,'public.transaction_offset_groups','INSERT') OR has_function_privilege(current_user,'public._issue335_reverse(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'service write/helper'; END IF;
 BEGIN PERFORM transaction_offset_reverse(gen_random_uuid(),gen_random_uuid(),'service no actor'); RAISE EXCEPTION 'service actor bypass'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'permission_denied' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS matrix service: read grant, no direct writes/helpers; no actor denied';
END $$;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
DO $$ DECLARE f uuid; f2 uuid; ev uuid; cat uuid; a uuid; b uuid; BEGIN
 -- 2i: Live exige category_id existente (FK); categoria L3 local nova, isolada como o uuid aleatório antigo.
 INSERT INTO account_categories(company_id,code,name,type,parent_id) VALUES(current_company_id(),'335.'||substr(md5(random()::text),1,8),'LOCAL matching','income','00000000-0000-0000-0000-000000000051') RETURNING id INTO cat;
 INSERT INTO events(id,company_id,name) VALUES(gen_random_uuid(),current_company_id(),'Matching local') RETURNING id INTO ev;
 INSERT INTO event_forecasts(company_id,event_id,category_id,type,description,amount,iva_rate,approved_at) VALUES(current_company_id(),ev,cat,'income','Diárias staff',10,0,now()) RETURNING id INTO f;
 IF EXISTS(SELECT 1 FROM issue335_matching_transactions(f)) THEN RAISE EXCEPTION 'zero matching'; END IF;
 INSERT INTO transactions(type,event_id,category_id,description,amount,iva_rate,date,supplier_id) VALUES('income',ev,cat,'Outra',1,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 IF (SELECT count(*) FROM issue335_matching_transactions(f))<>1 THEN RAISE EXCEPTION 'single category'; END IF;
 INSERT INTO suppliers(id,company_id,name) VALUES('00000000-0000-0000-0000-000000000029',current_company_id(),'Outra entidade') ON CONFLICT DO NOTHING;
 INSERT INTO transactions(type,event_id,category_id,description,amount,iva_rate,date,supplier_id) SELECT 'income',ev,cat,'Outra',1,0,'2026-10-13',CASE WHEN n%2=0 THEN '00000000-0000-0000-0000-000000000020'::uuid ELSE '00000000-0000-0000-0000-000000000029'::uuid END FROM generate_series(1,1001)n;
 IF (SELECT count(*) FROM issue335_matching_transactions(f))<>1002 THEN RAISE EXCEPTION '1000 truncated or entity filtered'; END IF;
 INSERT INTO event_forecasts(company_id,event_id,category_id,type,description,amount,iva_rate,approved_at) VALUES(current_company_id(),ev,cat,'income','Outra',10,0,now()) RETURNING id INTO f2;
 IF EXISTS(SELECT 1 FROM issue335_matching_transactions(f)) THEN RAISE EXCEPTION 'zero score claimed'; END IF;
 IF (SELECT count(*) FROM issue335_matching_transactions(f2))<>1002 THEN RAISE EXCEPTION 'unique winner'; END IF;
 UPDATE transactions SET forecast_id=f WHERE id=a;
 IF (SELECT count(*) FROM issue335_matching_transactions(f))<>1 OR (SELECT count(*) FROM issue335_matching_transactions(f2))<>1001 THEN RAISE EXCEPTION 'explicit or foreign claim'; END IF;
 UPDATE event_forecasts SET transaction_id=a WHERE id=f;
 IF (SELECT count(*) FROM issue335_matching_transactions(f))<>1 THEN RAISE EXCEPTION 'direct anchor not deduped'; END IF;
 IF issue335_score('Diárias/Staff','diarias staff')<>1000 THEN RAISE EXCEPTION 'normalization'; END IF;
 RAISE NOTICE 'PASS canonical matching 0/1/1002, multiple entities, direct/anchor union, unique winner/zero, foreign claims and accents';
END $$;
-- Failure after EVERY physical write, including nested production triggers and audit.
CREATE SCHEMA IF NOT EXISTS issue335_test;
CREATE FUNCTION issue335_test.fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE n int; BEGIN
 IF coalesce(current_setting('issue335_test.fail_at',true),'')<>'' THEN
  n:=coalesce(nullif(current_setting('issue335_test.write_count',true),''),'0')::int+1;
  PERFORM set_config('issue335_test.write_count',n::text,true);
  IF n=current_setting('issue335_test.fail_at')::int THEN RAISE EXCEPTION 'issue335_test_injected_%',n; END IF;
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['transactions','transaction_payments','transaction_offsets','event_forecasts','transaction_offset_groups','transaction_offset_items','forecast_audit_log','transaction_audit_log','system_audit_log','bank_statement_lines','bank_line_transactions'] LOOP
 EXECUTE format('CREATE TRIGGER zzz_issue335_failure AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION issue335_test.fail_write()',t);
END LOOP; END $$;
CREATE FUNCTION issue335_test.snapshot() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t text; rows jsonb; result jsonb:='{}'; BEGIN
 FOREACH t IN ARRAY ARRAY['transactions','transaction_payments','transaction_offsets','event_forecasts','transaction_offset_groups','transaction_offset_items','system_audit_log','transaction_audit_log','forecast_audit_log','bank_statement_lines','bank_line_transactions'] LOOP
  EXECUTE format('SELECT jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text) FROM public.%I x',t) INTO rows;
  result:=result||jsonb_build_object(t,rows);
 END LOOP; RETURN result;
END $$;
DO $$ DECLARE a uuid; b uuid; r uuid:=gen_random_uuid(); g uuid; items jsonb; snap jsonb; k int; hit boolean; total int:=0; BEGIN
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','Fault+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','Fault-',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','offset'),jsonb_build_object('transaction_id',b,'mode','offset'));
 FOR k IN 1..100 LOOP
  snap:=issue335_test.snapshot();hit:=false;
  PERFORM set_config('issue335_test.fail_at',k::text,true);PERFORM set_config('issue335_test.write_count','0',true);
  BEGIN PERFORM transaction_offset_execute(r,'00000000-0000-0000-0000-000000000020',items,NULL,'2026-10-13');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'issue335_test_injected_%' THEN RAISE; END IF;hit:=true; END;
  PERFORM set_config('issue335_test.fail_at','',true);
  IF hit THEN IF snap IS DISTINCT FROM issue335_test.snapshot() THEN RAISE EXCEPTION 'partial apply at %',k; END IF;total:=total+1; ELSE EXIT; END IF;
 END LOOP;
 RAISE NOTICE 'PASS injected failure after every apply write: % physical writes including audit; total rollback',total;
 SELECT id INTO g FROM transaction_offset_groups WHERE request_id=r;
 total:=0;
 FOR k IN 1..100 LOOP
  snap:=issue335_test.snapshot();hit:=false;
  PERFORM set_config('issue335_test.fail_at',k::text,true);PERFORM set_config('issue335_test.write_count','0',true);
  BEGIN PERFORM transaction_offset_reverse(g,r,'failure local'); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'issue335_test_injected_%' THEN RAISE; END IF;hit:=true; END;
  PERFORM set_config('issue335_test.fail_at','',true);
  IF hit THEN IF snap IS DISTINCT FROM issue335_test.snapshot() THEN RAISE EXCEPTION 'partial reverse at %',k; END IF;total:=total+1; ELSE EXIT; END IF;
 END LOOP;
 RAISE NOTICE 'PASS injected failure after every reversal write: % physical writes including audit; total rollback',total;
 IF NOT EXISTS(SELECT 1 FROM system_audit_log WHERE entity_type='transaction_payment' AND action='issue335_create') OR NOT EXISTS(SELECT 1 FROM transaction_audit_log WHERE field_name='issue335_reverse') OR NOT EXISTS(SELECT 1 FROM forecast_audit_log WHERE field_name='issue335_create_transaction') THEN RAISE EXCEPTION 'audit missing'; END IF;
 RAISE NOTICE 'PASS installed audit plus explicit payment/transaction/forecast ledgers';
END $$;
-- Privileged corruption only in discarded subtransactions; guards aren't weakened for clients.
DO $$ DECLARE g uuid; i uuid; BEGIN
 SELECT id INTO g FROM transaction_offset_groups WHERE status='applied' AND movement_amount<>0 AND bank_line_id IS NULL LIMIT 1;
 SELECT id INTO i FROM transaction_offset_items WHERE group_id=g AND cash_amount>0 LIMIT 1;
 ALTER TABLE transaction_offset_groups DISABLE TRIGGER issue335_guard;
 ALTER TABLE transaction_offset_items DISABLE TRIGGER issue335_guard;
 ALTER TABLE transaction_payments DISABLE TRIGGER issue335_guard;
 BEGIN
  UPDATE transaction_offset_groups SET movement_amount=movement_amount+1 WHERE id=g;
  IF NOT EXISTS(SELECT 1 FROM issue335_invariant_counts() WHERE name='encontro_desequilibrado' AND current_count>0) THEN RAISE EXCEPTION 'watch balance missed'; END IF;
  RAISE EXCEPTION 'restore'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'restore' THEN RAISE; END IF; END;
 BEGIN
  UPDATE transaction_offset_items SET cash_amount=cash_amount+1,compensation_amount=compensation_amount-1 WHERE id=i;
  IF NOT EXISTS(SELECT 1 FROM issue335_invariant_counts() WHERE name='encontro_pernas_divergentes' AND current_count>0) THEN RAISE EXCEPTION 'watch legs missed'; END IF;
  RAISE EXCEPTION 'restore'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'restore' THEN RAISE; END IF; END;
 BEGIN
  UPDATE transaction_offset_groups SET status='reversed' WHERE id=g;
  IF NOT EXISTS(SELECT 1 FROM issue335_invariant_counts() WHERE name='encontro_reversao_parcial' AND current_count>0) THEN RAISE EXCEPTION 'watch reverse missed'; END IF;
  RAISE EXCEPTION 'restore'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'restore' THEN RAISE; END IF; END;
 BEGIN
  UPDATE transaction_payments SET account_id=NULL WHERE offset_item_id=i AND payment_method='transfer';
  IF NOT EXISTS(SELECT 1 FROM issue335_invariant_counts() WHERE name='encontro_dinheiro_sem_conta' AND current_count>0) THEN RAISE EXCEPTION 'watch account missed'; END IF;
  RAISE EXCEPTION 'restore'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'restore' THEN RAISE; END IF; END;
 ALTER TABLE transaction_offset_groups ENABLE TRIGGER issue335_guard;
 ALTER TABLE transaction_offset_items ENABLE TRIGGER issue335_guard;
 ALTER TABLE transaction_payments ENABLE TRIGGER issue335_guard;
 -- Source adapter Estoril was reversed, create a deliberate invalid bank header for watcher only.
 ALTER TABLE bank_statement_lines DISABLE TRIGGER issue335_guard;
 BEGIN
  INSERT INTO bank_statement_lines(id,company_id,financial_account_id,amount,booking_date,status,offset_group_id) VALUES(gen_random_uuid(),current_company_id(),'00000000-0000-0000-0000-000000000030',1,'2026-10-13','matched',g);
  IF NOT EXISTS(SELECT 1 FROM issue335_invariant_counts() WHERE name='encontro_vinculo_bancario_divergente' AND current_count>0) THEN RAISE EXCEPTION 'watch bank missed'; END IF;
  RAISE EXCEPTION 'restore'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'restore' THEN RAISE; END IF; END;
 ALTER TABLE bank_statement_lines ENABLE TRIGGER issue335_guard;
 IF EXISTS(SELECT 1 FROM issue335_invariant_counts() WHERE current_count<>0) THEN RAISE EXCEPTION 'corruption not restored'; END IF;
 RAISE NOTICE 'PASS all five watchers detect injected corruption and return to zero';
END $$;
