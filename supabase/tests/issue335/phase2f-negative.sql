-- LOCAL ONLY: no finance fixtures are ever sent to Cloud.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
DO $$ DECLARE a uuid; b uuid; items jsonb; g uuid; n bigint; BEGIN
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id)
 VALUES('income','2f negative+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id)
 VALUES('expense','2f negative-',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 items:=jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset'));
 SELECT count(*) INTO n FROM transaction_offset_groups;
 BEGIN
  PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',
   (SELECT jsonb_agg(jsonb_build_object('transaction_id',a,'mode','settle')) FROM generate_series(1,51)),
   '{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13');
  RAISE EXCEPTION '51 accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'too_many_items: máximo 50 documentos por encontro' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM transaction_offset_groups)<>n THEN RAISE EXCEPTION '51 partial'; END IF;
 INSERT INTO transaction_offsets(receivable_transaction_id,payable_transaction_id,amount) VALUES(a,b,39);
 BEGIN
  PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,
   '{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13');
  RAISE EXCEPTION 'divergent adoption accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'legacy_offset_amount_mismatch' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM transaction_offset_groups)<>n OR EXISTS(SELECT 1 FROM transaction_payments WHERE transaction_id IN(a,b)) THEN RAISE EXCEPTION 'adoption partial'; END IF;
 DELETE FROM transaction_offsets WHERE receivable_transaction_id=a;
 -- Legal held-by fixture: the installed trigger closes it as paid.
 UPDATE transactions SET payment_method='compensation',held_by_supplier_id='00000000-0000-0000-0000-000000000020' WHERE id=b;
 IF (SELECT status FROM transactions WHERE id=b)<>'paid' THEN RAISE EXCEPTION 'legal held_by not paid'; END IF;
 BEGIN
  PERFORM transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',items,
   '{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13');
  RAISE EXCEPTION 'held_by accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'invalid_document' THEN RAISE; END IF; END;
 IF (SELECT count(*) FROM transaction_offset_groups)<>n THEN RAISE EXCEPTION 'held_by partial'; END IF;
 RAISE NOTICE 'PASS 2f I/G: exactly 51 refused, adoption 39 versus required 40 refused, legal compensation held_by becomes paid and refused; atomic';
END $$;
ROLLBACK;