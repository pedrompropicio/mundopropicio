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
