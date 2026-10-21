-- LOCAL ONLY. New phase 2l assertions under faithful PG17.6; triggers remain active.
\set ON_ERROR_STOP 1
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
BEGIN;
DO $$ BEGIN
 IF pg_has_role('postgres','issue335_executor','SET') THEN RAISE EXCEPTION 'executor_set_leak'; END IF;
 BEGIN SET LOCAL ROLE issue335_executor; RAISE EXCEPTION 'SET_ROLE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS 2l M1 postgres SET ROLE denied after install';
END $$;
ROLLBACK;
-- Artificially recreate only SET-role exposure: proves context independent of membership removal.
BEGIN;
GRANT issue335_executor TO postgres WITH INHERIT FALSE, SET TRUE;
SET LOCAL ROLE issue335_executor;
DO $$ DECLARE t text; BEGIN
 PERFORM set_config('issue335.ctx',gen_random_uuid()::text,true);
 BEGIN PERFORM public._issue335_execute(gen_random_uuid(),NULL,'[]',NULL,current_date,NULL);
  RAISE EXCEPTION 'direct_core_allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'managed_operation_required' THEN RAISE; END IF; END;
 BEGIN INSERT INTO public.issue335_execution_context VALUES(pg_backend_pid(),pg_current_xact_id(),gen_random_uuid(),'execute');
  RAISE EXCEPTION 'context_forge_allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 FOREACH t IN ARRAY ARRAY['companies','suppliers','events','financial_accounts','event_settlements'] LOOP
  IF has_table_privilege(current_user,'public.'||t,'UPDATE') THEN RAISE EXCEPTION 'broad_update:%',t; END IF;
  BEGIN EXECUTE format('UPDATE public.%I SET id=id',t); RAISE EXCEPTION 'update_allowed:%',t;
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 RAISE NOTICE 'PASS 2l M1 SET-role simulated: forged token/core/table context/5 UPDATE denied';
END $$;
RESET ROLE;
ROLLBACK;
BEGIN;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM set_config('issue335.ctx',gen_random_uuid()::text,true);
 IF public.issue335_context_valid() THEN RAISE EXCEPTION 'guc_forge'; END IF;
 PERFORM issue335_test.j_group('2l-lifetime');
 IF public.issue335_context_valid() THEN RAISE EXCEPTION 'context_reused_after_rpc'; END IF;
 BEGIN PERFORM public.issue335_worker('{"op":"execute"}'); RAISE EXCEPTION 'worker_allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS 2l M1 authenticated GUC false, worker denied, context revoked after RPC';
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.issue335_execution_context) THEN RAISE EXCEPTION 'context_leftover'; END IF;
END $$;
ROLLBACK;
-- No BP historical approval retained. Exact partially_paid BEFORE requires separate status candidate.
BEGIN;
SET LOCAL ROLE authenticated;
DO $$ DECLARE a uuid; b uuid; BEGIN
 INSERT INTO public.transactions(type,description,status,amount,iva_rate,date,supplier_id,account_id)
 VALUES('income','2l partial','partially_paid',100,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000030') RETURNING id INTO a;
 INSERT INTO public.transactions(type,description,status,amount,iva_rate,date,supplier_id)
 VALUES('expense','2l partial-','approved',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 BEGIN PERFORM public.transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',
 jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset')),
 '{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13');
 RAISE EXCEPTION 'wrong_installation_order';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'installation_order: status_candidate_required' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS 2l M3 wrong order refuses partial before writes';
END $$;
RESET ROLE;
ROLLBACK;
\i :root/supabase/manual/20261021_issue335_offset_approval.INERTE.sql
\i :root/supabase/manual/20261021_issue335_status.INERTE.sql
BEGIN;
SET LOCAL ROLE authenticated;
DO $$ DECLARE a uuid; b uuid; g uuid; st text; BEGIN
 FOREACH st IN ARRAY ARRAY['approved','partially_paid'] LOOP
  INSERT INTO public.transactions(type,description,status,amount,iva_rate,date,supplier_id,account_id)
  VALUES('income','2l status+',st,100,0,'2026-10-13','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000030') RETURNING id INTO a;
  INSERT INTO public.transactions(type,description,status,amount,iva_rate,date,supplier_id)
  VALUES('expense','2l status-','approved',40,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
  SELECT (public.transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',
   jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset')),
   '{"account_id":"00000000-0000-0000-0000-000000000030","date":"2026-10-13","amount":60}','2026-10-13')->>'group_id')::uuid INTO g;
  PERFORM public.transaction_offset_reverse(g,gen_random_uuid(),'2l exact status');
  IF (SELECT status FROM public.transactions WHERE id=a) IS DISTINCT FROM st THEN RAISE EXCEPTION 'status_not_restored:%',st; END IF;
  RAISE NOTICE 'PASS 2l M3 exact status % restored by derivation only',st;
 END LOOP;
END $$;
RESET ROLE;
ROLLBACK;
-- Operational ACLs are unchanged across all levels; revert existing group at level 1.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT issue335_test.j_group('2l-switch');
RESET ROLE;
CREATE TEMP TABLE acl_before AS SELECT oid,proacl FROM pg_proc WHERE proname IN('transaction_offset_execute','transaction_offset_reverse','reconcile_bank_line','reverse_payment','reverse_transaction');
SELECT pg_advisory_xact_lock(335,1);
UPDATE public.transaction_offset_control SET enabled=false;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM public.transaction_offset_reverse((SELECT v FROM issue335_test.j WHERE k='2l-switch:g'),gen_random_uuid(),'2l level1');
 BEGIN PERFORM public.transaction_offset_execute(gen_random_uuid(),NULL,'[]',NULL,current_date);
  RAISE EXCEPTION 'level1_new_allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'encontro_desativado' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS 2l M4 level1 rejects new, reverses existing';
END $$;
RESET ROLE;
UPDATE public.transaction_offset_control SET enabled=false,reverse_enabled=false;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.transaction_offset_reverse(gen_random_uuid(),gen_random_uuid(),'2l emergency');
 RAISE EXCEPTION 'emergency_reverse_allowed'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'encontro_desativado' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS 2l M4 level2 reverse rejected encontro_desativado';
END $$;
RESET ROLE;
UPDATE public.transaction_offset_control SET enabled=true,reverse_enabled=true;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM acl_before b JOIN pg_proc p ON p.oid=b.oid WHERE p.proacl IS DISTINCT FROM b.proacl) THEN RAISE EXCEPTION 'acl_drift'; END IF;
 RAISE NOTICE 'PASS 2l M4 all levels/reactivation exact legacy/new RPC ACL unchanged';
END $$;
ROLLBACK;