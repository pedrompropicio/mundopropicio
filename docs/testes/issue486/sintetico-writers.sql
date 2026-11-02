-- P3/P5/P8: deny/tenant, DML tardio e atestação. PREPARADO, NÃO EXECUTADO.
\set ON_ERROR_STOP on
BEGIN;
\ir fixture.sql
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
-- Exercise individual deny even on platform_admin, with real session identity.
INSERT INTO public.user_roles(user_id,role) VALUES('48600000-0000-4000-8000-000000000101','platform_admin');
DO $$ DECLARE permission_name text; before_state jsonb; BEGIN
 FOREACH permission_name IN ARRAY ARRAY['manage_transactions','approve_transactions','raise_budget'] LOOP
  INSERT INTO public.user_permissions(user_id,company_id,permission,granted)
  VALUES('48600000-0000-4000-8000-000000000101','48600000-0000-4000-8000-000000000001',permission_name,false);
  before_state:=pg_temp.ads486_digest();
  EXECUTE 'SET SESSION AUTHORIZATION authenticated';
  ASSERT session_user='authenticated' AND current_user='authenticated','deny_actor_identity';
  BEGIN PERFORM pg_temp.ads486_generate_fixture(); RAISE EXCEPTION 'deny_bypassed_%',permission_name;
  EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM IN ('forbidden','bp_approval_required'); END;
  ASSERT pg_temp.ads486_digest()=before_state,'deny_zero_write_'||permission_name;
  EXECUTE 'RESET SESSION AUTHORIZATION';
  DELETE FROM public.user_permissions WHERE user_id='48600000-0000-4000-8000-000000000101' AND permission=permission_name;
 END LOOP;
END $$;
-- Non-EUR preserves import/plan, refuses finance; no legacy insert can bypass.
SAVEPOINT currency_case;
SELECT public._ads486_enter('48600000-0000-4000-8000-000000000501','import');
UPDATE public.ads_invoice SET currency='USD' WHERE id='48600000-0000-4000-8000-000000000501';
SELECT public._ads486_leave();
UPDATE ads486_fixture SET plan=jsonb_set(plan,'{allocations}',(
 SELECT jsonb_agg(a-ARRAY['event_id','forecast_id']||'{"destination":"company"}'::jsonb) FROM jsonb_array_elements(plan->'allocations') a));
SET SESSION AUTHORIZATION authenticated;
DO $$ DECLARE x jsonb; p jsonb; BEGIN
 SELECT plan INTO p FROM ads486_fixture;
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',0,'plan',p));
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(x->'blockers') b WHERE b->>'code'='currency_unrepresentable'),'no_implicit_fx';
 BEGIN PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','confirm',
   jsonb_build_object('expected_revision',x->'revision','preview_hash',x->>'preview_hash'));RAISE EXCEPTION 'non_eur_confirmed';
 EXCEPTION WHEN SQLSTATE 'P0422' THEN ASSERT SQLERRM='generation_blocked'; END;
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK TO currency_case;
SET SESSION AUTHORIZATION authenticated;
SELECT pg_temp.ads486_generate_fixture();
RESET SESSION AUTHORIZATION;
UPDATE public.event_forecasts SET transaction_id=(SELECT (result#>>'{operation,result_snapshot,children,0,transaction_id}')::uuid FROM ads486_run)
WHERE id='48600000-0000-4000-8000-000000000301';
SET SESSION AUTHORIZATION authenticated;
DO $$ DECLARE before_state jsonb; tid uuid; BEGIN
 before_state:=pg_temp.ads486_digest();
 SELECT (result#>>'{operation,result_snapshot,children,0,transaction_id}')::uuid INTO tid FROM ads486_run;
 -- GUC/role claims cannot manufacture the private transaction context.
 PERFORM set_config('app.ads486_command','generate',true);
 BEGIN UPDATE public.ads_invoice SET generation_contract_version=NULL,generation_plan=NULL
  WHERE id='48600000-0000-4000-8000-000000000501';RAISE EXCEPTION 'downgrade_accepted';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 BEGIN DELETE FROM public.ads_invoice_line WHERE invoice_id='48600000-0000-4000-8000-000000000501';RAISE EXCEPTION 'legacy_ingest_deleted_lines';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 BEGIN UPDATE public.event_forecasts SET transaction_id=NULL WHERE transaction_id=tid;RAISE EXCEPTION 'legacy_unlink_accepted';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 BEGIN UPDATE public.transactions SET amount=amount+1 WHERE id=tid;RAISE EXCEPTION 'group_edit_accepted';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 BEGIN DELETE FROM public.transactions WHERE id=tid;RAISE EXCEPTION 'legacy_revert_deleted_child';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 ASSERT before_state=pg_temp.ads486_digest(),'all_writer_refusals_atomic';
 PERFORM set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000102',true);
 PERFORM set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000102","role":"authenticated"}',true);
 BEGIN PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','operation');RAISE EXCEPTION 'tenant_leak';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='forbidden'; END;
END $$;
RESET SESSION AUTHORIZATION;
-- Service attestation cannot cross tenant nor replace the applied PDF version.
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
 BEGIN PERFORM public.ads_invoice_source_attest_v1('48600000-0000-4000-8000-000000000501',1,
 '{"company_id":"48600000-0000-4000-8000-000000000002","bucket":"ads-invoices","path":"wrong","sha256":"bad"}');RAISE EXCEPTION 'attest_cross_tenant';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='forbidden'; END;
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
