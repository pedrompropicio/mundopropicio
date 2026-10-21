-- LOCAL ONLY. Real balance bodies retained as immutable legacy aliases.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
DO $$ DECLARE a uuid; b uuid; g uuid; items jsonb; before_balance numeric; old_balance numeric; actual numeric; acc uuid; x uuid; d date; BEGIN
 INSERT INTO financial_accounts(id,company_id,name,type,initial_balance) VALUES(gen_random_uuid(),current_company_id(),'2e cash','bank',0) RETURNING id INTO acc;
 INSERT INTO financial_accounts(id,company_id,name,type,initial_balance) VALUES(gen_random_uuid(),current_company_id(),'2e prior X','bank',0) RETURNING id INTO x;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,account_id) VALUES('income','2e mixed',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020',x) RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','2e compensation',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset'));
 SELECT (transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,jsonb_build_object('account_id',acc,'date','2026-10-13','amount',60),'2026-10-13')->>'group_id')::uuid INTO g;
 IF _account_true_balance_raw(acc)<>60 OR _account_true_balance_raw(x)<>0 OR (SELECT account_id FROM transactions WHERE id=a) IS DISTINCT FROM x THEN RAISE EXCEPTION '2e mixed/prior X cash invalid'; END IF;
 IF issue335_balance_invariant_count()<>0 THEN RAISE EXCEPTION '2e balance invariant false positive'; END IF;
 BEGIN
  EXECUTE 'CREATE OR REPLACE FUNCTION public._account_true_balance_raw(_account_id uuid) RETURNS numeric LANGUAGE sql AS $fake$ SELECT 999::numeric $fake$';
  IF issue335_balance_invariant_count()=0 THEN RAISE EXCEPTION '2e balance invariant missed corruption'; END IF;
  RAISE EXCEPTION 'restore balance after proved corruption' USING ERRCODE='P0335';
 EXCEPTION WHEN SQLSTATE 'P0335' THEN NULL; END;
 IF issue335_balance_invariant_count()<>0 THEN RAISE EXCEPTION '2e balance invariant restore failed'; END IF;
 IF _account_true_balance_asof_raw(acc,'2026-10-12')<>0 OR _account_true_balance_asof_raw(acc,'2026-10-13')<>60 THEN RAISE EXCEPTION '2e asof invalid'; END IF;
 UPDATE financial_accounts SET initial_balance_date='2026-10-13' WHERE id=acc;
 IF _account_true_balance_raw(acc)<>0 THEN RAISE EXCEPTION '2e cutoff equality invalid'; END IF;
 UPDATE financial_accounts SET initial_balance_date='2026-10-12' WHERE id=acc;
 IF _account_true_balance_raw(acc)<>60 THEN RAISE EXCEPTION '2e after cutoff invalid'; END IF;
 BEGIN SET LOCAL ROLE authenticated; UPDATE transactions SET account_id=acc WHERE id=a; RAISE EXCEPTION '2e attack accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'reverse_entire_group' THEN RAISE; END IF; END;
 PERFORM transaction_offset_reverse(g,gen_random_uuid(),'2e reverse');
 IF _account_true_balance_raw(acc)<>0 OR _account_true_balance_raw(x)<>0 THEN RAISE EXCEPTION '2e reverse balance invalid'; END IF;
 RAISE NOTICE 'PASS 2e A/E: mixed 60+40=60, prior X preserved, compensation zero, cutoff/asof, editor account attack, reversal zero';
 -- Legacy exact parity including hidden/status/reversed metadata and all cutoff/asof combinations.
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,account_id) VALUES('income','2e legacy',17,0,'2026-10-13','00000000-0000-0000-0000-000000000020',acc) RETURNING id INTO a;
 INSERT INTO transaction_payments(transaction_id,amount,payment_date,account_id) VALUES(a,17,'2026-10-13',acc);
 UPDATE transactions SET is_hidden=true WHERE id=a;
 FOREACH d IN ARRAY ARRAY[NULL::date,'2026-10-12'::date,'2026-10-13'::date,'2026-10-14'::date] LOOP
  IF _account_true_balance_raw(acc) IS DISTINCT FROM issue335_test.legacy_account_true_balance_raw(acc) OR _account_true_balance_asof_raw(acc,d) IS DISTINCT FROM issue335_test.legacy_account_true_balance_asof_raw(acc,d) THEN RAISE EXCEPTION '2e legacy parity failed'; END IF;
 END LOOP;
 RAISE NOTICE 'PASS 2e A: unmanaged legacy balance exact numerical parity, hidden/cutoff/asof';
END $$;
-- Isolated security and eligibility scenarios roll back fixtures and successful groups.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
INSERT INTO user_roles(id,user_id,role,company_id) VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000016','manager','00000000-0000-0000-0000-000000000001');
INSERT INTO profiles(id,company_id,active_company_id) VALUES('00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001') ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id,active_company_id=EXCLUDED.active_company_id;
DO $$ DECLARE a uuid; b uuid; items jsonb; BEGIN
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,is_confidential) VALUES('income','2e secret',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020',true) RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','2e public',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset'));
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000016',true);
 BEGIN SET LOCAL ROLE authenticated; PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13'); RAISE EXCEPTION 'secret accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'document_not_available: documento inexistente ou sem acesso' THEN RAISE; END IF; END;
 RESET ROLE;
 RAISE NOTICE 'PASS 2e C: confidential document refused without amount disclosure';
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
 UPDATE transactions SET is_confidential=false,account_id='00000000-0000-0000-0000-000000000030' WHERE id=a;
 UPDATE financial_accounts SET is_restricted=true WHERE id='00000000-0000-0000-0000-000000000030';
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000016',true);
 BEGIN SET LOCAL ROLE authenticated; PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,NULL,'2026-10-13'); RAISE EXCEPTION 'restricted source accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'document_not_available: documento inexistente ou sem acesso' THEN RAISE; END IF; END;
 RESET ROLE;
 RAISE NOTICE 'PASS 2e C: restricted source account refused before value-bearing errors';
END $$;
ROLLBACK;
BEGIN;
INSERT INTO public.user_roles(id,user_id,role,company_id) VALUES
 (gen_random_uuid(),'00000000-0000-0000-0000-000000000014','editor','00000000-0000-0000-0000-000000000001'),
 (gen_random_uuid(),'00000000-0000-0000-0000-000000000015','manager','00000000-0000-0000-0000-000000000001');
INSERT INTO public.profiles(id,company_id,active_company_id) VALUES
 ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
DO $$ DECLARE a uuid; b uuid; l uuid; req uuid; items jsonb; val text; lid uuid; BEGIN
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','2e permission+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','2e permission-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 INSERT INTO bank_statement_lines(id,company_id,financial_account_id,amount,booking_date) VALUES(gen_random_uuid(),current_company_id(),'00000000-0000-0000-0000-000000000030',60,'2026-10-13') RETURNING id INTO l;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle','request_id',gen_random_uuid(),'supplier_id','00000000-0000-0000-0000-000000000020'),jsonb_build_object('transaction_id',b,'mode','offset'));
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000014',true);
 BEGIN SET LOCAL ROLE authenticated; PERFORM reconcile_bank_line(l,items); RAISE EXCEPTION 'editor bank accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'permission_denied' THEN RAISE; END IF; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000015',true);
 SET LOCAL ROLE authenticated; PERFORM reconcile_bank_line(l,items); RESET ROLE;
 RAISE NOTICE 'PASS 2e B: editor without permission denied; manager bank accepted; admin bank exercised in retained scenarios';
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
DO $$ DECLARE a uuid; b uuid; ev uuid; g uuid; snap jsonb; items jsonb; BEGIN
 INSERT INTO events(id,company_id,name,budget_mode) VALUES(gen_random_uuid(),current_company_id(),'2e historical BP','without_bp') RETURNING id INTO ev;
 INSERT INTO transactions(type,event_id,description,amount,iva_rate,date,supplier_id) VALUES('expense',ev,'2e grandfathered',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','2e D+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 UPDATE events SET budget_mode='with_bp' WHERE id=ev;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset'));
 SELECT (transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13')->>'group_id')::uuid INTO g;
 BEGIN PERFORM transaction_offset_reverse(g,gen_random_uuid(),'2e D trigger'); RAISE EXCEPTION 'historical reversal unexpectedly accepted'; EXCEPTION WHEN SQLSTATE '42501' THEN
  IF SQLERRM NOT LIKE '%linha de BP%' THEN RAISE; END IF;
 END;
 IF (SELECT status FROM transaction_offset_groups WHERE id=g)<>'applied' OR EXISTS(SELECT 1 FROM transaction_payments WHERE offset_group_id=g AND status<>'paid') THEN RAISE EXCEPTION 'D refusal partial'; END IF;
 RAISE NOTICE 'CONFIRMED 2e D STOP: real approval trigger rejects historical no-BP reversal; group/payment state atomic and retained. Trigger not changed, JWT not cleared.';
END $$;
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
DO $$ DECLARE a uuid; b uuid; lid uuid; v text; items jsonb; mov jsonb; n bigint; BEGIN
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','2e workflow+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','2e workflow-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset'));
 mov:='{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}';
 FOREACH v IN ARRAY ARRAY['settlement_id','supplier_credit_id','is_transitory','card_session_id'] LOOP
  IF v='is_transitory' THEN UPDATE transactions SET is_transitory=true,transitory_reason='caucao' WHERE id=a;
  ELSE EXECUTE format('UPDATE transactions SET %I=gen_random_uuid() WHERE id=$1',v) USING a; END IF;
  BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,mov,'2026-10-13'); RAISE EXCEPTION 'unsupported accepted %',v; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'unsupported_debt' THEN RAISE; END IF; END;
  IF v='is_transitory' THEN UPDATE transactions SET is_transitory=false,transitory_reason=NULL WHERE id=a;
  ELSE EXECUTE format('UPDATE transactions SET %I=NULL WHERE id=$1',v) USING a; END IF;
 END LOOP;
 FOREACH v IN ARRAY ARRAY['draft','pending_approval','approved','revision','partially_approved'] LOOP
  INSERT INTO payment_lists(id,status) VALUES(gen_random_uuid(),v) RETURNING id INTO lid;
  INSERT INTO payment_list_items(transaction_id,payment_list_id) VALUES(a,lid);
  BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,mov,'2026-10-13'); RAISE EXCEPTION 'list accepted %',v; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'unsupported_debt' THEN RAISE; END IF; END;
  DELETE FROM payment_list_items WHERE transaction_id=a;
 END LOOP;
 INSERT INTO payment_list_sepa_exports(id,transaction_ids) VALUES(gen_random_uuid(),ARRAY[a]);
 BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,mov,'2026-10-13'); RAISE EXCEPTION 'SEPA accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'unsupported_debt' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS 2e G: four fields, five active list statuses and SEPA array refused; held_by unproved separately';
END $$;
ROLLBACK;
DO $$ DECLARE r text; f record; BEGIN
 FOREACH r IN ARRAY ARRAY['sandbox_exec','sandbox_exec_sfohvvlqccmmebvjgibx'] LOOP
  IF has_table_privilege(r,'public.issue335_commands','SELECT,INSERT') THEN RAISE EXCEPTION '2e sandbox command leak %',r; END IF;
  FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'issue335_%' OR proname LIKE '_issue335_%' OR proname IN('transaction_offset_execute','transaction_offset_reverse')) LOOP
   IF has_function_privilege(r,f.oid,'EXECUTE') THEN RAISE EXCEPTION '2e sandbox helper leak % %',r,f.oid::regprocedure; END IF;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'PASS 2e H: sandbox LOGIN/BYPASSRLS command view and internal helper ACL denied';
END $$;