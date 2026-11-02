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
-- C2/P3: empresa BRL + PDF EUR + custo company; alteração entre prévia,
-- confirmação e geração invalida o hash, sem depender de BP/câmbio.
SAVEPOINT company_currency;
UPDATE ads486_fixture SET plan=jsonb_set(plan,'{allocations}',(
 SELECT jsonb_agg(a-ARRAY['event_id','forecast_id']||'{"destination":"company"}'::jsonb) FROM jsonb_array_elements(plan->'allocations') a));
SET SESSION AUTHORIZATION authenticated;
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',0,'plan',(SELECT plan FROM ads486_fixture)));
INSERT INTO ads486_run(preview) SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','confirm',jsonb_build_object(
 'expected_revision',1,'preview_hash',(SELECT preview->>'preview_hash' FROM ads486_run)));
RESET SESSION AUTHORIZATION;
UPDATE public.companies SET currency='BRL' WHERE id='48600000-0000-4000-8000-000000000001';
SET SESSION AUTHORIZATION authenticated;
DO $$ DECLARE old_hash text; x jsonb; BEGIN
 SELECT preview->>'preview_hash' INTO old_hash FROM ads486_run;
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT x->>'currency'='EUR' AND x->>'preview_hash'<>old_hash,'company_currency_in_hash';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(x->'blockers') b WHERE b->>'code'='currency_unrepresentable'),'company_brl_blocked';
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_generation_v1(%L,''confirm'',%L::jsonb)',
  '48600000-0000-4000-8000-000000000501',jsonb_build_object('expected_revision',1,'preview_hash',old_hash)), 'P0409','preview_stale');
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_generation_v1(%L,''generate'',%L::jsonb)',
  '48600000-0000-4000-8000-000000000501',jsonb_build_object('request_key','48600000-0000-4000-8000-000000000799',
   'expected_revision',1,'preview_hash',old_hash,'approvals','[]'::jsonb)), 'P0409','preview_stale');
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_generation_v1(%L,''confirm'',%L::jsonb)',
  '48600000-0000-4000-8000-000000000501',jsonb_build_object('expected_revision',1,'preview_hash',x->>'preview_hash')), 'P0422','generation_blocked');
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK TO company_currency;
-- C2/P5: cada fonte material e identidade altera a prévia mesmo sem alterar o
-- total PDF. Rollback de subtransação por caso repõe a fonte canónica.
SAVEPOINT hash_sources;
SET SESSION AUTHORIZATION authenticated;
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',0,'plan',(SELECT plan FROM ads486_fixture)));
RESET SESSION AUTHORIZATION;
DO $$ DECLARE mutation text; before_hash text; after_hash text; BEGIN
 FOREACH mutation IN ARRAY ARRAY[
  $m$UPDATE public.event_forecasts SET amount=amount+1 WHERE id='48600000-0000-4000-8000-000000000301'$m$,
  $m$UPDATE public.event_forecasts SET original_amount=1 WHERE id='48600000-0000-4000-8000-000000000301'$m$,
  $m$UPDATE public.transactions SET amount=amount+1 WHERE id='48600000-0000-4000-8000-000000000401'$m$,
  $m$UPDATE public.transactions SET currency='USD' WHERE id='48600000-0000-4000-8000-000000000401'$m$,
  $m$UPDATE public.transactions SET fx_rate=2 WHERE id='48600000-0000-4000-8000-000000000401'$m$,
  $m$UPDATE public.events SET name='Same identity, another label',status='active' WHERE id='48600000-0000-4000-8000-000000000201'$m$,
  $m$UPDATE public.account_categories SET name='Digital changed' WHERE id='c0000034-0000-0000-0000-000000000001'$m$,
  $m$UPDATE public.suppliers SET nif='SYNTHETIC-OTHER-NIF' WHERE id='48600000-0000-4000-8000-000000000901'$m$,
  $m$UPDATE crm.ad_platform_connections SET selected_ad_account_id='synthetic-other-account' WHERE id='48600000-0000-4000-8000-000000000902'$m$,
  $m$UPDATE public.profiles SET email='other@issue486.invalid' WHERE id='48600000-0000-4000-8000-000000000101'$m$,
  $m$INSERT INTO public.user_permissions(user_id,company_id,permission,granted) VALUES('48600000-0000-4000-8000-000000000101','48600000-0000-4000-8000-000000000001','manage_bp',false)$m$
 ] LOOP
  BEGIN
   before_hash:=public._ads486_preview('48600000-0000-4000-8000-000000000501')->>'preview_hash';
   EXECUTE mutation;
   after_hash:=public._ads486_preview('48600000-0000-4000-8000-000000000501')->>'preview_hash';
   ASSERT before_hash<>after_hash,'hash_source_change_'||mutation;
   IF mutation LIKE '%original_amount%' OR mutation LIKE '%fx_rate%' OR mutation LIKE '%currency=%' THEN
    ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(public._ads486_preview('48600000-0000-4000-8000-000000000501')->'blockers') b
      WHERE b->>'code'='currency_unrepresentable'),'currency_metadata_refused';
   END IF;
   EXECUTE 'SET SESSION AUTHORIZATION authenticated';
   PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_generation_v1(%L,''confirm'',%L::jsonb)',
    '48600000-0000-4000-8000-000000000501',jsonb_build_object('expected_revision',1,'preview_hash',before_hash)), 'P0409','preview_stale');
   EXECUTE 'RESET SESSION AUTHORIZATION';
   RAISE EXCEPTION USING ERRCODE='P0487',MESSAGE='isolated_hash_case';
  EXCEPTION WHEN SQLSTATE 'P0487' THEN ASSERT SQLERRM='isolated_hash_case'; END;
 END LOOP;
END $$;
ROLLBACK TO hash_sources;
SAVEPOINT bp_currency;
UPDATE public.event_forecasts SET currency='BRL' WHERE id='48600000-0000-4000-8000-000000000301';
SET SESSION AUTHORIZATION authenticated;
SELECT pg_temp.ads486_expect(format('SELECT public.ads_invoice_generation_v1(%L,''save_plan'',%L::jsonb)',
 '48600000-0000-4000-8000-000000000501',jsonb_build_object('expected_revision',0,'plan',(SELECT plan FROM ads486_fixture))), 'P0422','currency_mismatch');
RESET SESSION AUTHORIZATION;
ROLLBACK TO bp_currency;
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
 (SELECT result#>'{operation,result_snapshot,source}' FROM ads486_run)||'{"company_id":"48600000-0000-4000-8000-000000000002"}'::jsonb);RAISE EXCEPTION 'attest_cross_tenant';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='forbidden'; END;
END $$;
RESET SESSION AUTHORIZATION;
-- C2/P9 fechado: todas as mutações recusam antes do cerco financeiro.
-- O grupo já existente é real e permite exercitar também o callback documental.
UPDATE ads486_private.control SET enabled=false WHERE singleton;
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ DECLARE q text; req jsonb; h jsonb; ls jsonb; op uuid; BEGIN
 SELECT request,(result#>>'{operation,id}')::uuid INTO req,op FROM ads486_run;
 SELECT header,lines INTO h,ls FROM ads486_fixture;
 FOREACH q IN ARRAY ARRAY[
  format('SELECT public.ads_invoice_generation_v1(%L,''save_plan'',%L::jsonb)','48600000-0000-4000-8000-000000000501',jsonb_build_object('expected_revision',1,'plan',(SELECT plan FROM ads486_fixture))),
  format('SELECT public.ads_invoice_generation_v1(%L,''confirm'',%L::jsonb)','48600000-0000-4000-8000-000000000501',req-ARRAY['request_key','approvals']),
  format('SELECT public.ads_invoice_generation_v1(%L,''generate'',%L::jsonb)','48600000-0000-4000-8000-000000000501',req),
  format('SELECT public.ads_invoice_generation_v1(%L,''set_split'',%L::jsonb)','48600000-0000-4000-8000-000000000501','{"expected_revision":1,"line_id":"48600000-0000-4000-8000-000000000601","parts":[]}'),
  format('SELECT public.ads_invoice_reopen_v1(%L,1)','48600000-0000-4000-8000-000000000501'),
  format('SELECT public.ads_invoice_revert_v1(%L,%L,1)','48600000-0000-4000-8000-000000000501',op),
  format('SELECT public.ads_invoice_import_v1(%L::jsonb,%L::jsonb)',h,ls)
 ] LOOP PERFORM pg_temp.ads486_expect(q,'0A000','feature_disabled'); END LOOP;
 ASSERT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','operation')->'operation' IS NOT NULL,'closed_state_readable';
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE r jsonb; task jsonb; payload jsonb; BEGIN
 SELECT result INTO r FROM ads486_run;
 task:=r#>'{operation,documents,0}';
 payload:=jsonb_build_object('company_id','48600000-0000-4000-8000-000000000001','transaction_id',task->>'transaction_id',
  'bucket',task->>'bucket','path',task->>'path','status','complete','sha256',repeat('a',64));
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_document_complete_v1(%L,''original'',%L::jsonb)',r#>>'{operation,id}',payload),'0A000','feature_disabled');
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_source_attest_v1(%L,1,%L::jsonb)','48600000-0000-4000-8000-000000000501',r#>'{operation,result_snapshot,source}'),'0A000','feature_disabled');
 task:=public.ads_invoice_maintenance_v1('48600000-0000-4000-8000-000000000501','list','{"company_id":"48600000-0000-4000-8000-000000000001"}')->'task';
 payload:=task-ARRAY['resources','receipts','invoice_id','generation_cycle']||'{"request_key":"48600000-0000-4000-8000-000000000899","status":"complete","error_code":null}'::jsonb;
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_maintenance_v1(%L,''ack'',%L::jsonb)','48600000-0000-4000-8000-000000000501',payload),'0A000','feature_disabled');
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_maintenance_v1(%L,''retry'',%L::jsonb)','48600000-0000-4000-8000-000000000501',payload),'0A000','feature_disabled');
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
