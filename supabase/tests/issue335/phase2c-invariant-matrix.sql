-- LOCAL ONLY: existing + five new invariants before/during/after applying and reversing an encounter.
-- Everything is inside one discarded transaction so that the following zero-history rollback is valid.
BEGIN;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',true);
CREATE FUNCTION pg_temp.matrix() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_agg(jsonb_build_object('n',name,'ok',conforme,'c',current_count) ORDER BY name) FROM (
  SELECT name,conforme,current_count FROM public._run_invariant_checks_extra()
  UNION ALL SELECT name,conforme,current_count FROM public._run_invariant_checks_paid()
  UNION ALL SELECT name,conforme,current_count FROM public._run_invariant_checks_paid_below_gross()) x $$;
DO $$ DECLARE before jsonb; during jsonb; after jsonb; a uuid; b uuid; g jsonb; BEGIN
 before:=pg_temp.matrix();
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(before) e WHERE NOT (e->>'ok')::boolean) THEN RAISE EXCEPTION 'matrix not conforming before: %',before; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(before) e WHERE e->>'n' LIKE 'encontro_%')<>5 THEN RAISE EXCEPTION 'new invariants not registered'; END IF;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('income','Matrix+',30996,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO a;
 INSERT INTO transactions(type,description,amount,iva_rate,date,supplier_id) VALUES('expense','Matrix-',7590,0,'2026-10-13','00000000-0000-0000-0000-000000000020') RETURNING id INTO b;
 EXECUTE 'SET LOCAL ROLE authenticated';
 g:=transaction_offset_execute(gen_random_uuid(),'00000000-0000-0000-0000-000000000020',jsonb_build_array(jsonb_build_object('transaction_id',a,'mode','settle'),jsonb_build_object('transaction_id',b,'mode','offset')),jsonb_build_object('account_id','00000000-0000-0000-0000-000000000030','date','2026-10-13','amount',23406),'2026-10-13');
 EXECUTE 'RESET ROLE';
 during:=pg_temp.matrix();
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(during) e WHERE NOT (e->>'ok')::boolean) THEN RAISE EXCEPTION 'matrix not conforming during: %',during; END IF;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM transaction_offset_reverse((g->>'group_id')::uuid,gen_random_uuid(),'matrix');
 EXECUTE 'RESET ROLE';
 after:=pg_temp.matrix();
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(after) e WHERE NOT (e->>'ok')::boolean) THEN RAISE EXCEPTION 'matrix not conforming after: %',after; END IF;
 RAISE NOTICE 'PASS invariant matrix (% checks incl. 5 new) conforming before, during and after apply/reverse',jsonb_array_length(before);
END $$;
ROLLBACK;
