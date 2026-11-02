-- P2/P3/P4/P5/P6. PREPARADO, NÃO EXECUTADO. Catálogo fiel obrigatório.
\set ON_ERROR_STOP on
BEGIN;
\ir fixture.sql
-- Failpoints existem só no harness. Nunca se acrescentam GUCs de bypass ao candidato.
CREATE FUNCTION pg_temp.ads486_fail() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE phase text:=current_setting('issue486.fail_at',true); hit boolean:=false;
BEGIN
 IF TG_TABLE_NAME='event_forecasts' THEN
  hit:=(phase='create_bp' AND TG_OP='INSERT') OR (phase='approve_bp' AND TG_OP='UPDATE' AND NEW.status='approved' AND OLD.status='draft')
   OR (phase='raise' AND TG_OP='UPDATE' AND NEW.amount>OLD.amount);
 ELSIF TG_TABLE_NAME='forecast_audit_log' THEN hit:=phase='audit';
 ELSIF TG_TABLE_NAME='transactions' THEN hit:=(phase='parent' AND NEW.parent_transaction_id IS NULL) OR (phase='child' AND NEW.parent_transaction_id IS NOT NULL);
 ELSIF TG_TABLE_NAME='ads_invoice_line' THEN hit:=phase='link' AND NEW.transaction_id IS NOT NULL;
 ELSIF TG_TABLE_NAME='ads_invoice_generation_operation' THEN hit:=phase='operation';
 ELSIF TG_TABLE_NAME='ads_invoice' THEN hit:=phase='applied' AND NEW.status='applied'; END IF;
 IF hit THEN RAISE EXCEPTION USING ERRCODE='P0486',MESSAGE='injected_'||phase; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ads486_test_fail AFTER INSERT OR UPDATE ON public.event_forecasts FOR EACH ROW EXECUTE FUNCTION pg_temp.ads486_fail();
CREATE TRIGGER ads486_test_fail AFTER INSERT ON public.forecast_audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp.ads486_fail();
CREATE TRIGGER ads486_test_fail AFTER INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION pg_temp.ads486_fail();
CREATE TRIGGER ads486_test_fail AFTER UPDATE ON public.ads_invoice_line FOR EACH ROW EXECUTE FUNCTION pg_temp.ads486_fail();
CREATE TRIGGER ads486_test_fail AFTER INSERT ON public.ads_invoice_generation_operation FOR EACH ROW EXECUTE FUNCTION pg_temp.ads486_fail();
CREATE TRIGGER ads486_test_fail AFTER UPDATE ON public.ads_invoice FOR EACH ROW EXECUTE FUNCTION pg_temp.ads486_fail();
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$
DECLARE phase text; before_state jsonb; result jsonb; retry jsonb; req jsonb; snapshot jsonb;
BEGIN
 ASSERT session_user='authenticated' AND current_user='authenticated';
 -- Each injected phase rolls back the complete command: source+plan/confirm,
 -- canonical BP/snapshot/audits, mother/child/links, operation and document tasks.
 FOREACH phase IN ARRAY ARRAY['raise','audit','parent','child','link','operation','applied'] LOOP
  before_state:=pg_temp.ads486_digest();
  PERFORM set_config('issue486.fail_at',phase,true);
  BEGIN
   PERFORM pg_temp.ads486_generate_fixture();
   RAISE EXCEPTION 'missing_failure_%',phase;
  EXCEPTION WHEN SQLSTATE 'P0486' THEN ASSERT SQLERRM='injected_'||phase; END;
  ASSERT pg_temp.ads486_digest()=before_state,'atomic_rollback_'||phase;
 END LOOP;
 PERFORM set_config('issue486.fail_at','',true);
 result:=pg_temp.ads486_generate_fixture();
 ASSERT result->'already'='false'::jsonb AND result->'operation'->>'state'='financial_committed';
 snapshot:=result#>'{operation,result_snapshot}';
 ASSERT snapshot#>>'{parent,amount}'='40.00','mother_included_total';
 ASSERT jsonb_array_length(snapshot->'children')=1 AND snapshot#>>'{children,0,amount}'='40.00','one_child_for_one_purpose';
 ASSERT jsonb_array_length(snapshot#>'{children,0,source_line_allocations}')=2,'detail_lines_preserved';
 ASSERT jsonb_array_length(snapshot->'effects')=1 AND snapshot#>>'{effects,0,delta}'='10.00','one_raise_for_batch';
 ASSERT (SELECT amount=110 AND baseline_amount=100 FROM public.event_forecasts WHERE id='48600000-0000-4000-8000-000000000301'),'budget_baseline';
 ASSERT (SELECT count(*) FROM public.forecast_audit_log WHERE forecast_id='48600000-0000-4000-8000-000000000301' AND field_name='Valor (EUR)')=1,'single_canonical_raise_audit';
 ASSERT (SELECT count(*) FROM public.transactions)=3,'commitment_mother_child';
 ASSERT (SELECT count(*) FROM public.transactions WHERE forecast_id='48600000-0000-4000-8000-000000000301')=2,'canonical_N_to_1';
 ASSERT jsonb_array_length(result#>'{operation,documents}')=2,'original_and_child_task_atomic';
 SELECT request INTO req FROM ads486_run;
 before_state:=pg_temp.ads486_digest();
 retry:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','generate',req);
 ASSERT retry->'already'='true'::jsonb AND retry->'operation'=result->'operation','same_key_same_ids';
 BEGIN
  PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','generate',jsonb_set(req,'{approvals,0,observation}','"Changed acceptance"'));
  RAISE EXCEPTION 'request_collision_accepted';
 EXCEPTION WHEN SQLSTATE 'P0409' THEN ASSERT SQLERRM='request_conflict'; END;
 retry:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','generate',jsonb_set(req,'{request_key}','"48600000-0000-4000-8000-000000000702"'));
 ASSERT retry->'operation'=result->'operation','different_key_same_cycle_same_ids';
 ASSERT pg_temp.ads486_digest()=before_state,'retries_no_writes';
END $$;
RESET SESSION AUTHORIZATION;
-- Creation branch: real canonical batch helper/snapshot/draft/approval/default.
SAVEPOINT create_case;
-- Actual reversal; preserve operation history.
SET SESSION AUTHORIZATION authenticated;
SELECT public.ads_invoice_revert_v1('48600000-0000-4000-8000-000000000501',
 (SELECT (result->'operation'->>'id')::uuid FROM ads486_run),1);
RESET SESSION AUTHORIZATION;
UPDATE ads486_fixture SET plan=jsonb_set(jsonb_set(plan,'{allocations}',(
 SELECT jsonb_agg((a-'forecast_id')||'{"new_forecast_key":"purpose2"}'::jsonb) FROM jsonb_array_elements(plan->'allocations') a)),
 '{new_forecasts}','[{"key":"purpose2","event_id":"48600000-0000-4000-8000-000000000201","category_id":"c0000034-0000-0000-0000-000000000001","description":"Finalidade própria","specification":"Só este lote","currency":"EUR","amount":"40.00","observation":"Proposta de criação"}]');
SET SESSION AUTHORIZATION authenticated;
DO $$ DECLARE before_state jsonb; result jsonb; phase text; BEGIN
 FOREACH phase IN ARRAY ARRAY['create_bp','approve_bp'] LOOP
  before_state:=pg_temp.ads486_digest();PERFORM set_config('issue486.fail_at',phase,true);
  BEGIN PERFORM pg_temp.ads486_generate_fixture(); RAISE EXCEPTION 'missing_create_failure';
  EXCEPTION WHEN SQLSTATE 'P0486' THEN ASSERT SQLERRM='injected_'||phase; END;
  ASSERT before_state=pg_temp.ads486_digest(),'atomic_'||phase;
 END LOOP;
 PERFORM set_config('issue486.fail_at','',true);
 result:=pg_temp.ads486_generate_fixture();
 ASSERT result->'already'='false'::jsonb,'new_cycle_new_key';
 ASSERT result#>>'{operation,result_snapshot,effects,0,kind}'='create','creation_effect';
 ASSERT EXISTS(SELECT 1 FROM public.event_forecasts WHERE id=(result#>>'{operation,result_snapshot,effects,0,forecast_id}')::uuid
  AND status='approved' AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND currency='EUR'
  AND baseline_amount=40 AND amount=40),'approved_new_budget_with_baseline';
 ASSERT EXISTS(SELECT 1 FROM public.bp_versions),'canonical_snapshot_preserved';
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK TO create_case;
ROLLBACK;

-- C2/P2: mãe completa deduplica uma vez; composição parcial bloqueia.
BEGIN;
\ir fixture.sql
INSERT INTO public.transactions(id,company_id,event_id,category_id,type,description,amount,status,date,currency,iva_rate)
VALUES('48600000-0000-4000-8000-000000000402','48600000-0000-4000-8000-000000000001',
 '48600000-0000-4000-8000-000000000201','c0000034-0000-0000-0000-000000000001','expense','Synthetic parent',70,'pending','2026-11-01','EUR',0);
UPDATE public.transactions SET parent_transaction_id='48600000-0000-4000-8000-000000000402' WHERE id='48600000-0000-4000-8000-000000000401';
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',0,'plan',(SELECT plan FROM ads486_fixture)));
DO $$ DECLARE x jsonb; BEGIN
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT x->'blockers'='[]'::jsonb AND x#>>'{line_budgets,0,committed}'='70.00','complete_parent_counted_once';
 ASSERT x#>>'{effects,0,delta}'='10.00','mother_does_not_double_raise';
END $$;
RESET SESSION AUTHORIZATION;
UPDATE public.transactions SET amount=71 WHERE id='48600000-0000-4000-8000-000000000402';
SET SESSION AUTHORIZATION authenticated;
DO $$ DECLARE x jsonb; BEGIN
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(x->'blockers') b WHERE b->>'reason'='ambiguous_parent_commitment'),'partial_parent_refused';
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
-- C2/P3: criação exige manage_bp mesmo em platform_admin; editor com manage_bp
-- pode criar draft no fluxo BP mas não recebe aprovação automática Ads.
BEGIN;
\ir fixture.sql
UPDATE ads486_fixture SET plan=jsonb_set(jsonb_set(plan,'{allocations}',(
 SELECT jsonb_agg(a-'forecast_id'||'{"new_forecast_key":"purpose"}'::jsonb) FROM jsonb_array_elements(plan->'allocations') a)),
 '{new_forecasts}','[{"key":"purpose","event_id":"48600000-0000-4000-8000-000000000201","category_id":"c0000034-0000-0000-0000-000000000001","description":"Separate purpose","specification":"Only invoice costs","currency":"EUR","amount":"40.00","observation":"Create explicitly"}]');
INSERT INTO public.user_roles(user_id,role) VALUES('48600000-0000-4000-8000-000000000101','platform_admin');
INSERT INTO public.user_permissions(user_id,company_id,permission,granted) VALUES
 ('48600000-0000-4000-8000-000000000101','48600000-0000-4000-8000-000000000001','manage_bp',false);
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT pg_temp.ads486_expect('SELECT pg_temp.ads486_generate_fixture()','42501','bp_approval_required');
RESET SESSION AUTHORIZATION;
DELETE FROM public.user_roles WHERE user_id='48600000-0000-4000-8000-000000000101';
INSERT INTO public.user_roles(user_id,company_id,role) VALUES('48600000-0000-4000-8000-000000000101','48600000-0000-4000-8000-000000000001','editor');
UPDATE public.user_permissions SET granted=true WHERE user_id='48600000-0000-4000-8000-000000000101' AND permission='manage_bp';
INSERT INTO public.user_permissions(user_id,company_id,permission,granted) VALUES
 ('48600000-0000-4000-8000-000000000101','48600000-0000-4000-8000-000000000001','manage_transactions',true),
 ('48600000-0000-4000-8000-000000000101','48600000-0000-4000-8000-000000000001','approve_transactions',true);
SET SESSION AUTHORIZATION authenticated;
SELECT pg_temp.ads486_expect('SELECT pg_temp.ads486_generate_fixture()','42501','bp_approval_required');
RESET SESSION AUTHORIZATION;
ROLLBACK;

-- C2/P5: a chave da empresa não pode ser reutilizada noutra fatura.
BEGIN;
\ir fixture.sql
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT pg_temp.ads486_generate_fixture();
DO $$ DECLARE h jsonb; ls jsonb; imported jsonb; request jsonb; before_state jsonb; BEGIN
 SELECT header,lines INTO h,ls FROM ads486_fixture;
 before_state:=pg_temp.ads486_digest();
 imported:=public.ads_invoice_import_v1(h,ls);
 ASSERT imported->'identical'='true'::jsonb AND pg_temp.ads486_digest()=before_state,'applied_identical_import_noop';
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_import_v1(%L::jsonb,%L::jsonb)',h,
  jsonb_set(ls,'{0,raw_description}','"Changed applied PDF content"')),'P0409','applied_invoice_changed');
 h:=h||'{"invoice_number":"SYNTHETIC-486-B","billing_period":"2026-12-01","issue_date":"2026-12-02"}'::jsonb;
 imported:=public.ads_invoice_import_v1(h,ls);
 SELECT r.request INTO request FROM ads486_run r;
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_generation_v1(%L,''generate'',%L::jsonb)',
  imported->>'invoice_id',request),'P0409','request_conflict');
 ASSERT (SELECT count(*) FROM public.ads_invoice_generation_operation)=1,'one_operation_after_cross_invoice_key';
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
-- C2/P5: duplicados legados/Fatura Avulsa/nulo; separadores fortes conservados.
BEGIN;
\ir fixture.sql
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ DECLARE kind text; payload jsonb; query text; BEGIN
 SELECT jsonb_build_object('expected_revision',0,'plan',plan) INTO payload FROM ads486_fixture;
 query:=format('SELECT public.ads_invoice_generation_v1(%L,''save_plan'',%L::jsonb)','48600000-0000-4000-8000-000000000501',payload);
 FOREACH kind IN ARRAY ARRAY['exact','null_supplier','supplier_period','standalone','separators'] LOOP
  BEGIN
   IF kind='standalone' THEN
    INSERT INTO public.standalone_invoices(company_id,file_name,storage_path,invoice_number,total_amount)
    VALUES('48600000-0000-4000-8000-000000000001','synthetic.pdf','synthetic/486.pdf','SYNTHETIC-486-A',40);
   ELSE
    INSERT INTO public.transactions(company_id,type,category_id,description,amount,status,date,invoice_ref,specification,supplier_id)
    VALUES('48600000-0000-4000-8000-000000000001','expense','c0000034-0000-0000-0000-000000000001','Synthetic legacy',40,'pending','2026-11-02',
     CASE kind WHEN 'exact' THEN 'SYNTHETIC-486-A' WHEN 'separators' THEN 'SYNTHETIC486A' ELSE NULL END,
     CASE WHEN kind IN ('null_supplier','supplier_period') THEN 'ref. 11/2026' ELSE 'different source' END,
     CASE WHEN kind='supplier_period' THEN '48600000-0000-4000-8000-000000000901'::uuid END);
   END IF;
   EXECUTE 'SET SESSION AUTHORIZATION authenticated';
   IF kind='separators' THEN
    EXECUTE query;
    ASSERT (SELECT generation_revision FROM public.ads_invoice WHERE id='48600000-0000-4000-8000-000000000501')=1,'separators_not_collapsed';
   ELSE PERFORM pg_temp.ads486_expect(query,'P0409','duplicate_invoice'); END IF;
   EXECUTE 'RESET SESSION AUTHORIZATION';
   RAISE EXCEPTION USING ERRCODE='P0487',MESSAGE='isolated_duplicate_case';
  EXCEPTION WHEN SQLSTATE 'P0487' THEN ASSERT SQLERRM='isolated_duplicate_case'; END;
 END LOOP;
END $$;
ROLLBACK;

-- C2/P2: mesma rubrica/evento com finalidades/BPs distintos, sem eleger maior verba.
BEGIN;
\ir fixture.sql
INSERT INTO public.event_forecasts(id,company_id,event_id,category_id,type,description,amount,baseline_amount,status,currency,iva_rate)
VALUES('48600000-0000-4000-8000-000000000305','48600000-0000-4000-8000-000000000001','48600000-0000-4000-8000-000000000201',
 'c0000034-0000-0000-0000-000000000001','expense','Separate advertising purpose',1000,1000,'approved','EUR',0);
UPDATE ads486_fixture SET plan=jsonb_set(plan,'{allocations,1,forecast_id}','"48600000-0000-4000-8000-000000000305"');
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ DECLARE x jsonb; BEGIN
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',0,'plan',(SELECT plan FROM ads486_fixture)));
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT x->'blockers'='[]'::jsonb AND jsonb_array_length(x->'children')=2,'same_category_separate_purposes';
 ASSERT (SELECT count(DISTINCT c->>'forecast_id') FROM jsonb_array_elements(x->'children') c)=2,'explicit_bp_identity_retained';
 ASSERT (SELECT c->>'amount' FROM jsonb_array_elements(x->'children') c WHERE c->>'forecast_id'='48600000-0000-4000-8000-000000000301')='20.00','no_largest_budget_reselection';
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
