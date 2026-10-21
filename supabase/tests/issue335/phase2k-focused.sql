-- LOCAL ONLY. Run after faithful 2j suite. Keeps installed triggers enabled except real restore candidate internally.
\set ON_ERROR_STOP 1
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
BEGIN;
SET LOCAL ROLE authenticated;
SELECT issue335_test.j_group('2k-cash');
RESET ROLE;
DO $$ DECLARE ev numeric; bal numeric; d numeric; ok boolean; BEGIN
 SELECT sum(realized) INTO ev FROM public.get_event_cash_position('00000000-0000-0000-0000-000000000001');
 SELECT sum(public._account_true_balance_raw(id)-coalesce(initial_balance,0)) INTO bal FROM public.financial_accounts
 WHERE company_id='00000000-0000-0000-0000-000000000001' AND type IN ('bank','cash','prepaid_card') AND NOT coalesce(skip_balance_check,false);
 SELECT diff,is_balanced INTO d,ok FROM public.get_event_cash_position_invariant('00000000-0000-0000-0000-000000000001');
 IF ev IS DISTINCT FROM bal OR d<>0 OR ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'A1 coherence: cash %, balance %, invariant %/%',ev,bal,d,ok; END IF;
 RAISE NOTICE 'PASS 2k A1 DEPOIS caixa %=saldo %, invariant zero',ev,bal;
END $$;
ROLLBACK;

-- Values are valid existing FKs or booleans: the guard must reject, not a FK/check.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT issue335_test.j_group('2k-analytics');
RESET ROLE;
CREATE TEMP TABLE k_attacks(col text,val text);
INSERT INTO k_attacks VALUES('category_id',quote_literal('00000000-0000-0000-0000-000000000052')||'::uuid'),('exclude_from_result','true');
DO $$ DECLARE w text; a record; t uuid; BEGIN
 SELECT v INTO t FROM issue335_test.j WHERE k='2k-analytics:a';
 FOREACH w IN ARRAY ARRAY['00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000017'] LOOP
  PERFORM set_config('request.jwt.claim.sub',w,true);
  FOR a IN SELECT * FROM k_attacks LOOP
   BEGIN
    SET LOCAL ROLE authenticated;
    EXECUTE format('UPDATE public.transactions SET %I=%s WHERE id=$1',a.col,a.val) USING t;
    RAISE EXCEPTION 'attack_allowed:%',a.col;
   EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE<>'P0001' OR SQLERRM<>'reverse_entire_group' THEN RAISE; END IF;
   END;
   RESET ROLE;
  END LOOP;
 END LOOP;
 RAISE NOTICE 'PASS 2k analytical category_id/exclude_from_result valid values rejected editor/manager';
END $$;
ROLLBACK;

-- Partial restore: every managed anchor table must reject BEFORE shadow preparation and trigger disabling.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
SET LOCAL ROLE authenticated;
SELECT issue335_test.j_group('2k-restore');
RESET ROLE;
DO $$ DECLARE t text; n bigint; BEGIN
 SELECT count(*) INTO n FROM public.transaction_payments;
 FOREACH t IN ARRAY ARRAY['transaction_payments','transactions','bank_statement_lines','bank_line_transactions','transaction_offsets','transaction_offset_groups','transaction_offset_items'] LOOP
  BEGIN
   SET LOCAL ROLE service_role;
   PERFORM public.restore_apply_from_shadow('company','00000000-0000-0000-0000-000000000001',ARRAY[t],NULL);
   RAISE EXCEPTION 'restore_allowed:%',t;
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT LIKE 'managed_restore_forbidden:%' THEN RAISE; END IF;
  END;
  RESET ROLE;
 END LOOP;
 BEGIN
  SET LOCAL ROLE service_role;
  PERFORM public.restore_apply_from_shadow('global',NULL,ARRAY['transaction_offset_groups','transaction_offset_items','transaction_payments','transactions','transaction_offset_control'],NULL);
  RAISE EXCEPTION 'global_restore_allowed';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'managed_restore_forbidden:%' THEN RAISE; END IF; END;
 RESET ROLE;
 IF n<>(SELECT count(*) FROM public.transaction_payments) OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public.transactions'::regclass,'public.transaction_payments'::regclass) AND NOT tgisinternal AND tgenabled='D') THEN RAISE EXCEPTION 'restore_partial_effect'; END IF;
 RAISE NOTICE 'PASS 2k restore partial 7 tables + global refused before trigger disable; atomic';
END $$;
ROLLBACK;

-- Separate no-history company: original real restore still runs; control restoration cannot reactivate.
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.restore_shadow_prepare(ARRAY['transaction_payments']);
-- restore_shadow_prepare creates an empty shadow; the real loader rejects [] without columns.
SELECT public.restore_apply_from_shadow('company','00000000-0000-0000-0000-000000000002',ARRAY['transaction_payments'],NULL);
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.transaction_payments WHERE company_id='00000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'no_history_restore'; END IF;
 RAISE NOTICE 'PASS 2k no-history company real legacy restore executes';
END $$;
ROLLBACK;