-- LOCAL ONLY: concrete regression proofs. Privileged fixtures never reach Cloud.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
DO $$ DECLARE t text; r text; BEGIN
 FOREACH t IN ARRAY ARRAY['transaction_offset_groups','transaction_offset_items'] LOOP
  FOREACH r IN ARRAY ARRAY['authenticated','service_role'] LOOP
   IF NOT has_table_privilege(r,'public.'||t,'SELECT') OR has_table_privilege(r,'public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') THEN RAISE EXCEPTION 'storage ACL % %',t,r; END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE policyname IN('offset_groups_writer','offset_items_writer','issue335_identity')) THEN RAISE EXCEPTION 'obsolete writer/identity policy'; END IF;
 IF has_function_privilege('authenticated','public.issue335_dispatch()','EXECUTE') OR has_schema_privilege('issue335_executor','public','CREATE') OR has_schema_privilege('issue335_executor','auth','USAGE') THEN RAISE EXCEPTION 'executor capability leak'; END IF;
 RAISE NOTICE 'PASS 1/2/9: private executor, no auth-schema grants, storage SELECT only (including TRUNCATE/REFERENCES/TRIGGER/MAINTAIN), no identity policies';
END $$;
SET ROLE authenticated;
DO $$ DECLARE a uuid; b uuid; r uuid; g uuid; items jsonb; line uuid; p uuid; n int; BEGIN
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','2d reuse+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','2d reuse-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 INSERT INTO transaction_offsets(receivable_transaction_id,payable_transaction_id,amount) VALUES(a,b,40);
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset'));
 INSERT INTO bank_statement_lines(id,company_id,financial_account_id,amount,booking_date) VALUES(gen_random_uuid(),current_company_id(),'00000000-0000-0000-0000-000000000030',60,'2026-10-13') RETURNING id INTO line;
 r:=gen_random_uuid(); items:=jsonb_set(items,'{0,request_id}',to_jsonb(r::text)); items:=jsonb_set(items,'{0,supplier_id}',to_jsonb('00000000-0000-0000-0000-000000000020'::text));
 PERFORM reconcile_bank_line(line,items);
 SELECT offset_group_id INTO g FROM bank_statement_lines WHERE id=line;
 BEGIN UPDATE bank_statement_lines SET status='unmatched',offset_group_id=NULL WHERE id=line; RAISE EXCEPTION 'bank detached'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'managed_bank_anchor_immutable' THEN RAISE; END IF; END;
 BEGIN DELETE FROM bank_line_transactions WHERE line_id=line; RAISE EXCEPTION 'bank link deleted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'managed_bank_anchor_immutable' THEN RAISE; END IF; END;
 IF (SELECT bank_line_id FROM transaction_offset_groups WHERE id=g) IS DISTINCT FROM line THEN RAISE EXCEPTION 'origin absent'; END IF;
 PERFORM transaction_offset_reverse(g,gen_random_uuid(),'2d reuse');
 PERFORM reconcile_bank_line(line,jsonb_set(items,'{0,request_id}',to_jsonb(gen_random_uuid()::text)));
 IF (SELECT count(*) FROM transaction_payments WHERE transaction_id IN(a,b) AND status='paid' AND reversed_at IS NULL)<>3 THEN RAISE EXCEPTION 'reuse failed'; END IF;
 RAISE NOTICE 'PASS 4/5: bank detach/delete attacks denied; durable bank origin; apply/reverse/reapply identical documents';
 -- Legacy normal compensation creation still calls the invoker helper as authenticated.
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,account_id) VALUES('income','2d legacy+',10,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000030') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','2d legacy-',10,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 INSERT INTO transaction_payments(transaction_id,amount,payment_date,account_id) VALUES(a,10,'2026-10-13','00000000-0000-0000-0000-000000000030');
 PERFORM transaction_offset_create(a,b,10,'2d legacy');
 IF (SELECT paid_amount FROM transactions WHERE id=b)<>10 THEN RAISE EXCEPTION 'legacy create broken'; END IF;
 RAISE NOTICE 'PASS 3: authenticated legacy transaction_offset_create generates compensation and closes opposite document';
END $$;
RESET ROLE;
-- Exact refusal for each account flag/type without writes.
DO $$ DECLARE a uuid; b uuid; acc uuid; partner uuid; ev uuid; items jsonb; val text; snap bigint; BEGIN
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','2d whitelist+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','2d whitelist-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset'));
 INSERT INTO events(id,company_id,name) VALUES(gen_random_uuid(),current_company_id(),'2d partner fixture') RETURNING id INTO ev;
 INSERT INTO event_partners(id,company_id,event_id,supplier_id) VALUES(gen_random_uuid(),current_company_id(),ev,'00000000-0000-0000-0000-000000000020') RETURNING id INTO partner;
 FOREACH val IN ARRAY ARRAY['inactive','hidden','restricted','partner','mirror','ticket_office','prepaid_card','other','cash'] LOOP
  INSERT INTO financial_accounts(id,company_id,name,type,is_active,is_hidden,is_restricted,partner_id,mirror_partner_aporte) VALUES(gen_random_uuid(),current_company_id(),'LOCAL whitelist',CASE WHEN val IN('ticket_office','prepaid_card','other','cash') THEN val ELSE 'bank' END,val<>'inactive',val='hidden',val='restricted',CASE WHEN val='partner' THEN partner END,val='mirror') RETURNING id INTO acc;
  snap:=(SELECT count(*) FROM transaction_offset_groups);
  BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,jsonb_build_object('account_id',acc,'date','2026-10-13','amount',60),'2026-10-13'); RAISE EXCEPTION 'account accepted %',val; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'account_not_allowed' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM transaction_offset_groups)<>snap THEN RAISE EXCEPTION 'account partial'; END IF;
 END LOOP;
 UPDATE transactions SET amount=100.001 WHERE id=a;
 BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13'); RAISE EXCEPTION 'precision accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'document_precision_unsupported:%' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS 7/12: nine forbidden account classes/flags; legacy three-decimal value explicitly refused';
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',false);
DO $$ BEGIN BEGIN PERFORM transaction_offset_reverse(gen_random_uuid(),gen_random_uuid(),'manager denied'); RAISE EXCEPTION 'manager reversed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'permission_denied' THEN RAISE; END IF; END; RAISE NOTICE 'PASS 8: manager cannot reverse group (admin only, like legacy reverse_payment)'; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);

-- Trigger-dependent settlement read, then explicit sealed refusal (including forged GUC).
DO $$ DECLARE ev uuid; es uuid; a uuid; b uuid; items jsonb; g uuid; BEGIN
 INSERT INTO events(id,company_id,name) VALUES(gen_random_uuid(),current_company_id(),'2d settlement') RETURNING id INTO ev;
 INSERT INTO event_settlements(id,event_id,company_id,name,is_sealed) VALUES(gen_random_uuid(),ev,current_company_id(),'LOCAL fecho',false) RETURNING id INTO es;
 INSERT INTO transactions(type,event_id,event_settlement_id,description,amount,iva_rate,date,supplier_id) VALUES('income',ev,es,'2d close+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','2d close-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset'));
 SELECT (transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13')->>'group_id')::uuid INTO g;
 UPDATE event_settlements SET is_sealed=true WHERE id=es;
 PERFORM set_config('app.settlement_seal_op','on',true);
 BEGIN PERFORM transaction_offset_reverse(g,gen_random_uuid(),'sealed attack'); RAISE EXCEPTION 'sealed reversed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'sealed_settlement:%' THEN RAISE; END IF; END;
 UPDATE event_settlements SET is_sealed=false WHERE id=es;
 PERFORM transaction_offset_reverse(g,gen_random_uuid(),'unsealed');
 -- 2i: em Live o selo só muda por seal_event_settlement (guard_sealed_event_settlement); antes: UPDATE directo.
 PERFORM seal_event_settlement(es,'{"check1":0,"check2":0}'::jsonb,NULL,'LOCAL 2d');
 BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13'); RAISE EXCEPTION 'sealed applied'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'sealed_settlement:%' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS 10/seal: settlement-linked document apply/reverse unsealed; sealed apply/reverse denied even with forged seal GUC';
END $$;

-- #233 alignment message for managed legs (not a generic reverse_entire_group).
SET ROLE authenticated;
DO $$ DECLARE a uuid; line uuid; BEGIN
 SELECT i.transaction_id INTO a FROM transaction_offset_items i JOIN transaction_offset_groups g ON g.id=i.group_id JOIN transactions t ON t.id=i.transaction_id WHERE g.status='applied' AND i.cash_amount>0 AND t.type='income' ORDER BY i.id LIMIT 1;
 INSERT INTO bank_statement_lines(id,company_id,financial_account_id,amount,booking_date) VALUES(gen_random_uuid(),current_company_id(),'00000000-0000-0000-0000-000000000030',60,'2026-10-12') RETURNING id INTO line;
 BEGIN PERFORM reconcile_bank_line(line,jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','link','amount',60,'date_action','align'))); RAISE EXCEPTION 'managed align accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'managed_group_date_alignment_forbidden:%' THEN RAISE; END IF; END;
 IF (SELECT status FROM bank_statement_lines WHERE id=line)<>'unmatched' THEN RAISE EXCEPTION 'align partial'; END IF;
 RAISE NOTICE 'PASS 12: #233 align on managed legs gives specific refusal and leaves bank line unmatched';
END $$;
RESET ROLE;
-- Expose rather than hide canonical balance defect: new compensation changes paid_amount.
-- This is an OPEN blocker, NOT an assertion that the financial result is acceptable.
DO $$ DECLARE a uuid; b uuid; items jsonb; before_balance numeric; after_balance numeric; BEGIN
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,account_id) VALUES('income','2d balance+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000030') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','2d balance-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 before_balance:=_account_true_balance_raw('00000000-0000-0000-0000-000000000030');
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset'));
 PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13');
 after_balance:=_account_true_balance_raw('00000000-0000-0000-0000-000000000030');
 IF after_balance-before_balance<>100 THEN RAISE EXCEPTION 'canonical balance defect reproduction changed: %',after_balance-before_balance; END IF;
 RAISE WARNING 'OPEN BLOCKER balance: canonical account delta=100 but real cash=60; compensation counted as cash. No financial acceptance.';
END $$;
