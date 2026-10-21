-- LOCAL ONLY (#335 fase 2g, ponto D). Fixtures never leave the local harness.
-- Phase BEFORE runs against the captured Live trigger; AFTER installs the separate
-- inert approval candidate only in this harness, then its rollback restores Live prosrc.
\set ON_ERROR_STOP 1
CREATE SCHEMA IF NOT EXISTS issue335_test;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
CREATE TABLE IF NOT EXISTS issue335_test.g2(k text PRIMARY KEY, v uuid);
\i :root/supabase/manual/20261021_issue335_offset_approval.ROLLBACK-INERTE.sql
CREATE TABLE IF NOT EXISTS issue335_test.g2_prosrc AS SELECT prosrc FROM pg_proc WHERE oid='public.enforce_transaction_approval_permission'::regproc;
DO $$ BEGIN IF position('issue335-approval-v2l' in (SELECT prosrc FROM issue335_test.g2_prosrc))>0 THEN RAISE EXCEPTION '2g captured body is not Live'; END IF; END $$;
CREATE OR REPLACE FUNCTION issue335_test.g2_case(p_k text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE ev uuid:=gen_random_uuid(); f uuid; a uuid; b uuid; g uuid; uid text:=current_setting('request.jwt.claim.sub');
BEGIN
 INSERT INTO events(id,name,budget_mode,company_id) VALUES(ev,'2g '||p_k,'without_bp','00000000-0000-0000-0000-000000000001');
 IF p_k='verba' THEN
  UPDATE events SET budget_mode='with_bp' WHERE id=ev;
  INSERT INTO event_forecasts(id,event_id,amount,description,type) VALUES(gen_random_uuid(),ev,30,'2g verba','expense') RETURNING id INTO f;
  -- Historic over-budget approval: legacy identity-less writer (crons/syncs) path of Live trigger.
  PERFORM set_config('request.jwt.claim.sub','',true);
 END IF;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,event_id,forecast_id,company_id)
  VALUES('expense','2g '||p_k,40,0,'2026-10-13','00000000-0000-0000-0000-000000000020',ev,f,'00000000-0000-0000-0000-000000000001') RETURNING id INTO b;
 PERFORM set_config('request.jwt.claim.sub',uid,true);
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id)
  VALUES('income','2g '||p_k||'+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 SELECT (transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',
   jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset')),
   '{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13')->>'group_id')::uuid INTO g;
 IF (SELECT status FROM transactions WHERE id=b)<>'paid' THEN RAISE EXCEPTION '2g % not paid',p_k; END IF;
 UPDATE events SET budget_mode='with_bp' WHERE id=ev;
 INSERT INTO issue335_test.g2 VALUES(p_k||':g',g),(p_k||':b',b),(p_k||':a',a),(p_k||':ev',ev),(p_k||':f',f) ON CONFLICT(k) DO UPDATE SET v=excluded.v;
END $$;
-- Reverse attempt; returns SQLSTATE or 'ok'. Failure is fully rolled back (subtransaction).
CREATE OR REPLACE FUNCTION issue335_test.g2_reverse(p_k text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 PERFORM transaction_offset_reverse((SELECT v FROM issue335_test.g2 WHERE k=p_k||':g'),gen_random_uuid(),'2g reverse');
 RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE||' '||SQLERRM; END $$;

-- ===== BEFORE: Live trigger =====
-- 2n-Bloco2b: the suite installs approval after core; the captured Live body is restored by
-- the approval rollback for this BEFORE phase. Historic 2g evidence (apply ok, reverse 42501 /
-- P0409, atomic) is superseded: the core now refuses the APPLY with a clear order error,
-- before any financial write (stricter; documented in the report, section 2n-Bloco2b).
DO $$ DECLARE r text; k text; n int:=(SELECT count(*) FROM transaction_offset_groups); BEGIN
 FOREACH k IN ARRAY ARRAY['hist','verba'] LOOP
  BEGIN PERFORM issue335_test.g2_case(k); r:='ok';
  EXCEPTION WHEN OTHERS THEN r:=SQLSTATE||' '||SQLERRM; END;
  IF r<>'P0001 installation_order: approval_candidate_required' THEN RAISE EXCEPTION '2g BEFORE % expected approval_candidate_required, got %',k,r; END IF;
 END LOOP;
 IF (SELECT count(*) FROM transaction_offset_groups)<>n THEN RAISE EXCEPTION '2g BEFORE refusal not atomic'; END IF;
 RAISE NOTICE 'PASS 2g D BEFORE (2n-Bloco2b): without approval candidate the encounter is refused at apply (approval_candidate_required), zero groups written';
END $$;

-- ===== AFTER: candidate installed only here =====
\i :root/supabase/manual/20261021_issue335_offset_approval.INERTE.sql
DO $$ BEGIN PERFORM issue335_test.g2_case('hist'); PERFORM issue335_test.g2_case('verba'); END $$;
DO $$ DECLARE r text; b uuid; ev uuid; f uuid; n uuid; BEGIN
 r:=issue335_test.g2_reverse('hist');
 IF r<>'ok' THEN RAISE EXCEPTION '2g AFTER (a) hist reverse failed: %',r; END IF;
 b:=(SELECT v FROM issue335_test.g2 WHERE k='hist:b');
 IF (SELECT status FROM transactions WHERE id=b)<>'approved' OR (SELECT paid_amount FROM transactions WHERE id=b)<>0
    OR (SELECT status FROM transaction_offset_groups WHERE id=(SELECT v FROM issue335_test.g2 WHERE k='hist:g'))<>'reversed' THEN RAISE EXCEPTION '2g (a) state not restored'; END IF;
 r:=issue335_test.g2_reverse('verba');
 IF r<>'ok' THEN RAISE EXCEPTION '2g AFTER (b) verba reverse failed: %',r; END IF;
 ev:=(SELECT v FROM issue335_test.g2 WHERE k='verba:ev'); f:=(SELECT v FROM issue335_test.g2 WHERE k='verba:f');
 -- (b) new approval on the exceeded line keeps P0409.
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,event_id,forecast_id,status)
  VALUES('expense','2g new',1,0,'2026-10-13','00000000-0000-0000-0000-000000000020',ev,f,'pending') RETURNING id INTO n;
 BEGIN UPDATE transactions SET status='approved' WHERE id=n; RAISE EXCEPTION 'X (b) accepted';
 EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL; END;
 -- (c) normal approval without BP line on with_bp event stays refused.
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,event_id,status)
  VALUES('expense','2g nobp',5,0,'2026-10-13','00000000-0000-0000-0000-000000000020',ev,'pending') RETURNING id INTO n;
 BEGIN UPDATE transactions SET status='approved' WHERE id=n; RAISE EXCEPTION 'X (c) accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN IF SQLERRM NOT LIKE 'Esta transacao nao tem linha de BP%' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS 2g D AFTER (a)(b)(c): historic reverse restores approved/0; over-budget reverse ok, new approval P0409; no-BP approval 42501';
END $$;

-- (d) approval without permission; (e) attacks. Isolated, rolled back.
BEGIN;
INSERT INTO user_roles(id,user_id,role,company_id) VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000017','editor','00000000-0000-0000-0000-000000000001');
INSERT INTO profiles(id,company_id,active_company_id) VALUES('00000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001') ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id;
DO $$ DECLARE ev uuid; f uuid; n uuid; a uuid; b uuid; g uuid; r int; BEGIN
 INSERT INTO events(id,name,budget_mode,company_id) VALUES(gen_random_uuid(),'2g atk','with_bp','00000000-0000-0000-0000-000000000001') RETURNING id INTO ev;
 INSERT INTO event_forecasts(id,event_id,amount,description,type) VALUES(gen_random_uuid(),ev,1000,'2g ok','expense') RETURNING id INTO f;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,event_id,forecast_id,status)
  VALUES('expense','2g perm',5,0,'2026-10-13','00000000-0000-0000-0000-000000000020',ev,f,'pending') RETURNING id INTO n;
 -- (d)
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000017',true);
 BEGIN SET LOCAL ROLE authenticated; UPDATE transactions SET status='approved' WHERE id=n;
  GET DIAGNOSTICS r=ROW_COUNT; IF r>0 THEN RAISE EXCEPTION 'X (d) accepted'; END IF;
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
 -- (e1) document WITHOUT group: direct paid->approved with forged GUCs, no BP line -> legacy refusal.
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,event_id) VALUES('expense','2g e1',7,0,'2026-10-13','00000000-0000-0000-0000-000000000020',NULL) RETURNING id INTO a;
 INSERT INTO transaction_payments(transaction_id,amount,payment_date,account_id) VALUES(a,7,'2026-10-13','00000000-0000-0000-0000-000000000030');
 UPDATE transactions SET event_id=ev WHERE id=a;
 PERFORM set_config('issue335.trusted','on',true); PERFORM set_config('issue335.reversing','on',true); PERFORM set_config('app.bypass_approval','on',true);
 BEGIN UPDATE transaction_payments SET status='reversed',reversed_at=now() WHERE transaction_id=a; PERFORM _derive_paid_amount(a); RAISE EXCEPTION 'X (e1) accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN IF SQLERRM NOT LIKE 'Esta transacao nao tem linha de BP%' THEN RAISE; END IF; END;
 -- (e2) forged group row by application role.
 BEGIN SET LOCAL ROLE authenticated;
  INSERT INTO transaction_offset_groups(company_id,supplier_id,request_id,status) VALUES(current_company_id(),'00000000-0000-0000-0000-000000000020',gen_random_uuid(),'reversing');
  RAISE EXCEPTION 'X (e2) accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 RESET ROLE;
 BEGIN SET LOCAL ROLE authenticated; UPDATE transaction_offset_groups SET status='reversing'; GET DIAGNOSTICS r=ROW_COUNT; IF r>0 THEN RAISE EXCEPTION 'X (e2u) accepted'; END IF;
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 RESET ROLE;
 -- (e3) managed doc in APPLIED group (no proven reversal): direct paid->approved by manager-level admin, forged GUCs.
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id,event_id) VALUES('expense','2g e3',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020',NULL) RETURNING id INTO b;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','2g e3+',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 SELECT (transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset')),'{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13')->>'group_id')::uuid INTO g;
 BEGIN SET LOCAL ROLE authenticated; UPDATE transactions SET status='approved',paid_amount=0,payment_date=NULL WHERE id=b; RAISE EXCEPTION 'X (e3) accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'X %' THEN RAISE; END IF; END;
 RESET ROLE;
 IF (SELECT status FROM transactions WHERE id=b)<>'paid' THEN RAISE EXCEPTION '2g (e3) state changed'; END IF;
 -- (e4) direct call of the internal reverse, bypassing the dispatcher.
 BEGIN SET LOCAL ROLE authenticated; PERFORM _issue335_reverse(g,gen_random_uuid(),'forged'); RAISE EXCEPTION 'X (e4) accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 RESET ROLE;
 -- (e5) group of another company: reverse through public RPC sees nothing.
 BEGIN UPDATE transaction_offset_groups SET company_id='00000000-0000-0000-0000-0000000000ff' WHERE id=g; RAISE EXCEPTION 'X (e5t) tamper accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'managed_operation_required' THEN RAISE; END IF; END;
 -- Test-only fixture of a foreign-company group (replica role skips user triggers; harness superuser only).
 SET LOCAL session_replication_role=replica;
 UPDATE transaction_offset_groups SET company_id='00000000-0000-0000-0000-0000000000ff' WHERE id=g;
 UPDATE transaction_offset_items SET company_id='00000000-0000-0000-0000-0000000000ff' WHERE group_id=g;
 SET LOCAL session_replication_role=origin;
 BEGIN PERFORM transaction_offset_reverse(g,gen_random_uuid(),'other company'); RAISE EXCEPTION 'X (e5) accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%group_not_found%' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS 2g D (d)(e): editor approval 42501; ungrouped forged-GUC restore 42501 BP; forged group insert/update denied; applied-group direct restore refused; direct internal call 42501; even superuser tamper of group company refused managed_operation_required; other-company group not found';
END $$;
ROLLBACK;

-- (f) rollback restores exact Live prosrc; atomic candidate install.
\i :root/supabase/manual/20261021_issue335_offset_approval.ROLLBACK-INERTE.sql
DO $$ BEGIN
 IF (SELECT prosrc FROM pg_proc WHERE oid='public.enforce_transaction_approval_permission'::regproc) IS DISTINCT FROM (SELECT prosrc FROM issue335_test.g2_prosrc) THEN RAISE EXCEPTION '2g (f) rollback prosrc parity failed'; END IF;
 RAISE NOTICE 'PASS 2g D (f): rollback prosrc byte-identical to captured Live';
END $$;
