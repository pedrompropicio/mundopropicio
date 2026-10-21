SET ROLE authenticated;
SELECT set_config('t.uid','00000000-0000-0000-0000-000000000010',false),set_config('t.company','00000000-0000-0000-0000-000000000001',false);
INSERT INTO transactions(id,company_id,type,description,amount,iva_rate,date,supplier_id) VALUES
 ('00000000-0000-0000-0000-000000000101',current_company_id(),'income','Estoril',25200,23,'2026-10-13','00000000-0000-0000-0000-000000000020'),
 ('00000000-0000-0000-0000-000000000102',current_company_id(),'expense','Staff',6716.81,13,'2026-10-13','00000000-0000-0000-0000-000000000020');
INSERT INTO transaction_offsets(id,receivable_transaction_id,payable_transaction_id,amount) VALUES('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000102',7590);
INSERT INTO bank_statement_lines(id,company_id,financial_account_id,amount,booking_date) VALUES('00000000-0000-0000-0000-000000000301',current_company_id(),'00000000-0000-0000-0000-000000000030',23406,'2026-10-13');
SELECT reconcile_bank_line('00000000-0000-0000-0000-000000000301','[{"transaction_id":"00000000-0000-0000-0000-000000000101","mode":"settle","request_id":"00000000-0000-0000-0000-000000000401","supplier_id":"00000000-0000-0000-0000-000000000020"},{"transaction_id":"00000000-0000-0000-0000-000000000102","mode":"offset"}]');
DO $$ BEGIN
 IF (SELECT paid_amount FROM transactions WHERE id='00000000-0000-0000-0000-000000000101')<>30996 THEN RAISE EXCEPTION 'Estoril receipt not closed'; END IF;
 IF (SELECT paid_amount FROM transactions WHERE id='00000000-0000-0000-0000-000000000102')<>7590 THEN RAISE EXCEPTION 'Estoril expense not closed'; END IF;
 IF (SELECT sum(amount) FROM transaction_payments WHERE payment_method='transfer')<>23406 THEN RAISE EXCEPTION 'cash divergent'; END IF;
 IF (SELECT count(*) FROM transaction_payments WHERE offset_id IS NOT NULL)<>0 THEN RAISE EXCEPTION 'legacy duplicated'; END IF;
 IF (SELECT count(*) FROM bank_line_transactions)<>1 THEN RAISE EXCEPTION 'non-cash linked'; END IF;
 RAISE NOTICE 'PASS Estoril, bilateral payments, adopted legacy, cash, bank bridge';
END $$;
SELECT reconcile_bank_line('00000000-0000-0000-0000-000000000301','[{"transaction_id":"00000000-0000-0000-0000-000000000101","mode":"settle","request_id":"00000000-0000-0000-0000-000000000401","supplier_id":"00000000-0000-0000-0000-000000000020"},{"transaction_id":"00000000-0000-0000-0000-000000000102","mode":"offset"}]');
DO $$ BEGIN
 IF (SELECT count(*) FROM transaction_payments)<>3 THEN RAISE EXCEPTION 'replay duplicated'; END IF;
 BEGIN UPDATE transaction_payments SET status='reversed',reversed_at=now() WHERE payment_method='transfer'; RAISE EXCEPTION 'guard bypass'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'reverse_entire_group' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS same replay, individual reversal denied';
END $$;
SELECT transaction_offset_reverse((SELECT offset_group_id FROM bank_statement_lines LIMIT 1),'00000000-0000-0000-0000-000000000501','local reversal');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM transactions WHERE paid_amount<>0) THEN RAISE EXCEPTION 'reversal failed'; END IF;
 IF EXISTS(SELECT 1 FROM bank_line_transactions) THEN RAISE EXCEPTION 'bridge retained'; END IF;
 RAISE NOTICE 'PASS integral reversal derived; documents/history retained';
END $$;
RESET ROLE;
SELECT * FROM issue335_invariant_counts();

-- Four-document and zero/debit symmetry, cents, BP rollback, ACL and replay changes.
SET ROLE authenticated;
DO $$ DECLARE a uuid; b uuid; c uuid; d uuid; req uuid; items jsonb; mov jsonb; result jsonb; n bigint; BEGIN
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','Sponsor',10000,23,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','Tickets',15000,6,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','Staff',5000,13,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO c;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','Room',3000,23,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO d;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle','cash_order',0),jsonb_build_object('transaction_id',b,'mode','settle','cash_order',1),jsonb_build_object('transaction_id',c,'mode','offset','cash_order',2),jsonb_build_object('transaction_id',d,'mode','offset','cash_order',3));
 mov:=jsonb_build_object('account_id','00000000-0000-0000-0000-000000000030','date','2026-10-13','amount',18860);
 SELECT count(*) INTO n FROM transaction_payments;
 BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,jsonb_set(mov,'{amount}','18860.01'),'2026-10-13'); RAISE EXCEPTION 'cent accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Faltam 0,01%' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM transaction_payments)<>n THEN RAISE EXCEPTION 'failed cent wrote payments'; END IF;
 req:=gen_random_uuid(); result:=transaction_offset_execute(req,'00000000-0000-0000-0000-000000000020',items,mov,'2026-10-13');
 IF (SELECT cash_amount FROM transaction_offset_items WHERE transaction_id=a)<>12300 OR (SELECT cash_amount FROM transaction_offset_items WHERE transaction_id=b)<>6560 THEN RAISE EXCEPTION 'allocation wrong'; END IF;
 IF (SELECT compensation_amount FROM transaction_offset_items WHERE transaction_id=b)<>9340 THEN RAISE EXCEPTION 'comp wrong'; END IF;
 BEGIN PERFORM transaction_offset_execute(req,'00000000-0000-0000-0000-000000000020',items,mov,'2026-10-13','changed'); RAISE EXCEPTION 'changed replay accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'request_changed' THEN RAISE; END IF; END;
 BEGIN DELETE FROM transaction_payments WHERE transaction_id=a; RAISE EXCEPTION 'delete accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'reverse_entire_group' THEN RAISE; END IF; END;
 BEGIN UPDATE transactions SET amount=amount+1 WHERE id=a; RAISE EXCEPTION 'money edit accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'reverse_entire_group' THEN RAISE; END IF; END;
 PERFORM transaction_offset_reverse((result->>'group_id')::uuid,gen_random_uuid(),'local');
 -- Reversals keep history; use fresh documents for debit.
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','Debit',30996,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','Credit',7590,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset'));
 result:=transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,jsonb_set(mov,'{amount}','-23406'),'2026-10-13');
 IF (SELECT cash_amount FROM transaction_offset_items WHERE transaction_id=a)<>23406 THEN RAISE EXCEPTION 'debit wrong'; END IF;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','Zero+',7590,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','Zero-',7590,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 result:=transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','offset'),jsonb_build_object('transaction_id',b,'mode','offset')),NULL,'2026-10-13');
 IF EXISTS(SELECT 1 FROM transaction_payments WHERE offset_group_id=(result->>'group_id')::uuid AND (account_id IS NOT NULL OR payment_method<>'compensation')) THEN RAISE EXCEPTION 'zero cash invented'; END IF;
 RAISE NOTICE 'PASS four VAT docs, cents rollback, changed replay, guards, debit, zero';
END $$;
DO $$ DECLARE f uuid; e uuid; a uuid; items jsonb; n bigint; BEGIN
 INSERT INTO events(id,company_id,name) VALUES(gen_random_uuid(),current_company_id(),'LOCAL') RETURNING id INTO e;
 INSERT INTO event_forecasts(company_id,event_id,type,description,amount,iva_rate,approved_at) VALUES(current_company_id(),e,'income','BP',25200,23,now()) RETURNING id INTO f;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','BP counter',7590,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 items:=jsonb_build_array(jsonb_build_object('forecast_id',f,'mode','settle'),jsonb_build_object('transaction_id',a,'mode','offset'));
 SELECT count(*) INTO n FROM transactions;
 BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,jsonb_build_object('account_id','00000000-0000-0000-0000-000000000030','date','2026-10-13','amount',23406.01),'2026-10-13'); RAISE EXCEPTION 'bad BP accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Faltam 0,01%' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM transactions)<>n THEN RAISE EXCEPTION 'BP creation not rolled back'; END IF;
 PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,jsonb_build_object('account_id','00000000-0000-0000-0000-000000000030','date','2026-10-13','amount',23406),'2026-10-13');
 IF (SELECT count(*) FROM transactions WHERE forecast_id=f)<>1 THEN RAISE EXCEPTION 'BP anchor missing'; END IF;
 RAISE NOTICE 'PASS BP atomic creation and rollback';
END $$;
SELECT set_config('t.uid','00000000-0000-0000-0000-000000000011',false);
DO $$ BEGIN
 BEGIN PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020','[]',NULL,'2026-10-13'); RAISE EXCEPTION 'viewer wrote'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'permission_denied' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS viewer denied';
END $$;
SELECT set_config('t.company','00000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM transaction_offset_groups) THEN RAISE EXCEPTION 'tenant leak'; END IF; RAISE NOTICE 'PASS tenant isolation'; END $$;
RESET ROLE;
SELECT set_config('t.company','00000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM issue335_invariant_counts() WHERE current_count<>0) THEN RAISE EXCEPTION 'invariants failed'; END IF; RAISE NOTICE 'PASS all five bilateral invariants'; END $$;
-- Installed #233 protocol preserved: explicit keep vs align, pending mismatch, audit.
SET ROLE authenticated;
SELECT set_config('t.uid','00000000-0000-0000-0000-000000000010',false);
DO $$ DECLARE a uuid; b uuid; payload jsonb; BEGIN
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,account_id) VALUES('income','Legacy align',100,0,'2026-10-12','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000030') RETURNING id INTO a;
 INSERT INTO transaction_payments(transaction_id,amount,payment_date,account_id) VALUES(a,100,'2026-10-12','00000000-0000-0000-0000-000000000030');
 INSERT INTO bank_statement_lines(id,company_id,financial_account_id,amount,booking_date) VALUES(gen_random_uuid(),current_company_id(),'00000000-0000-0000-0000-000000000030',100,'2026-10-13') RETURNING id INTO b;
 payload:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','link','amount',100));
 BEGIN PERFORM reconcile_bank_line(b,payload); RAISE EXCEPTION 'pending date bypass'; EXCEPTION WHEN SQLSTATE 'P0410' THEN NULL; END;
 PERFORM reconcile_bank_line(b,jsonb_set(payload,'{0,date_action}','"align"'));
 IF (SELECT payment_date FROM transactions WHERE id=a)<>'2026-10-13' OR NOT EXISTS(SELECT 1 FROM transaction_audit_log WHERE transaction_id=a AND field_name='payment_date') THEN RAISE EXCEPTION 'align audit lost'; END IF;
 INSERT INTO bank_statement_lines(id,company_id,financial_account_id,amount,booking_date) VALUES(gen_random_uuid(),current_company_id(),'00000000-0000-0000-0000-000000000030',100,'2026-10-14') RETURNING id INTO b;
 PERFORM reconcile_bank_line(b,jsonb_set(payload,'{0,date_action}','"keep"'));
 IF (SELECT payment_date FROM transactions WHERE id=a)<>'2026-10-13' OR (SELECT date_divergence FROM bank_statement_lines WHERE id=b) IS NULL THEN RAISE EXCEPTION 'keep lost'; END IF;
 RAISE NOTICE 'PASS #233 pending/align/keep and installed audit';
END $$;
RESET ROLE;
