-- LOCAL ONLY: exhaustive physical-write injection across bank adapter AND BP creation.
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
-- Snapshot covers every public table, not a hand-selected subset.
CREATE OR REPLACE FUNCTION issue335_test.snapshot() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t text; rows jsonb; result jsonb:='{}'; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
  EXECUTE format('SELECT jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text) FROM public.%I x',t) INTO rows;
  result:=result||jsonb_build_object(t,rows);
 END LOOP; RETURN result;
END $$;
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS zzz_issue335_failure ON public.%I',t);
  EXECUTE format('CREATE TRIGGER zzz_issue335_failure AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION issue335_test.fail_write()',t);
 END LOOP;
END $$;
DO $$ DECLARE f uuid; ev uuid; a uuid; b uuid; r uuid:=gen_random_uuid(); items jsonb; snap jsonb; k int; hit boolean; total int:=0; g uuid; BEGIN
 INSERT INTO events(id,company_id,name) VALUES(gen_random_uuid(),current_company_id(),'Bank/BP fault') RETURNING id INTO ev;
 INSERT INTO event_forecasts(company_id,event_id,type,description,amount,iva_rate,approved_at) VALUES(current_company_id(),ev,'income','Bank/BP income',25200,23,now()) RETURNING id INTO f;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','Bank/BP cost',7590,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO bank_statement_lines(id,company_id,financial_account_id,amount,booking_date) VALUES(gen_random_uuid(),current_company_id(),'00000000-0000-0000-0000-000000000030',23406,'2026-10-13') RETURNING id INTO b;
 items:=jsonb_build_array(jsonb_build_object('forecast_id',f,'mode','settle','request_id',r,'supplier_id','00000000-0000-0000-0000-000000000020'),jsonb_build_object('transaction_id',a,'mode','offset'));
 FOR k IN 1..500 LOOP
  snap:=issue335_test.snapshot();hit:=false;
  PERFORM set_config('issue335_test.fail_at',k::text,true);PERFORM set_config('issue335_test.write_count','0',true);
  BEGIN PERFORM reconcile_bank_line(b,items);
   EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'issue335_test_injected_%' THEN RAISE; END IF;hit:=true; END;
  PERFORM set_config('issue335_test.fail_at','',true);
  IF hit THEN IF snap IS DISTINCT FROM issue335_test.snapshot() THEN RAISE EXCEPTION 'partial bank/BP apply at %',k; END IF;total:=total+1; ELSE EXIT; END IF;
 END LOOP;
 IF total<20 THEN RAISE EXCEPTION 'bank/BP writes not exercised: %',total; END IF;
 RAISE NOTICE 'PASS bank adapter + BP creation: % physical injected writes; all public tables identical on rollback',total;
 IF (SELECT count(*) FROM transactions WHERE forecast_id=f)<>1 OR (SELECT count(*) FROM bank_line_transactions WHERE line_id=b)<>1 THEN RAISE EXCEPTION 'bank/BP retry not committed'; END IF;
 SELECT offset_group_id INTO g FROM bank_statement_lines WHERE id=b;
 IF NOT EXISTS(SELECT 1 FROM system_audit_log WHERE entity_id=b::text AND action='issue335_attach') THEN RAISE EXCEPTION 'bank audit absent'; END IF;
 total:=0;
 FOR k IN 1..500 LOOP
  snap:=issue335_test.snapshot();hit:=false;
  PERFORM set_config('issue335_test.fail_at',k::text,true);PERFORM set_config('issue335_test.write_count','0',true);
  BEGIN PERFORM transaction_offset_reverse(g,'00000000-0000-0000-0000-0000000008aa','bank/BP reverse'); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'issue335_test_injected_%' THEN RAISE; END IF;hit:=true; END;
  PERFORM set_config('issue335_test.fail_at','',true);
  IF hit THEN IF snap IS DISTINCT FROM issue335_test.snapshot() THEN RAISE EXCEPTION 'partial bank/BP reverse at %',k; END IF;total:=total+1; ELSE EXIT; END IF;
 END LOOP;
 IF total<10 THEN RAISE EXCEPTION 'bank/BP reversal not exercised'; END IF;
 RAISE NOTICE 'PASS bank/BP reversal: % physical writes; all public tables identical after every failure',total;
 IF EXISTS(SELECT 1 FROM bank_line_transactions WHERE line_id=b) OR (SELECT status FROM bank_statement_lines WHERE id=b)<>'unmatched' THEN RAISE EXCEPTION 'bank reverse failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM system_audit_log WHERE entity_id=b::text AND action='issue335_detach') THEN RAISE EXCEPTION 'detach audit absent'; END IF;
 IF EXISTS(SELECT 1 FROM issue335_invariant_counts() WHERE current_count<>0) THEN RAISE EXCEPTION 'bank/BP invariants'; END IF;
END $$;
