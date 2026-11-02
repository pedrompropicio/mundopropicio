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
