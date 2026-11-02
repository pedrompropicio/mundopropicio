-- P7: real operation producer + SQL document consumer. PREPARADO, NÃO EXECUTADO.
-- SHA256/bytes are worker attestations; this script makes no Storage claim.
\set ON_ERROR_STOP on
BEGIN;
\ir fixture.sql
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT pg_temp.ads486_generate_fixture();
DO $$ BEGIN
 BEGIN PERFORM public.ads_invoice_document_complete_v1('48600000-0000-4000-8000-000000000801','original','{}');RAISE EXCEPTION 'client_document_callback';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE r jsonb; task jsonb; payload jsonb; x jsonb; y jsonb; before_state jsonb; op uuid; BEGIN
 ASSERT session_user='service_role' AND current_user='service_role';
 SELECT result INTO r FROM ads486_run;op:=(r->'operation'->>'id')::uuid;
 FOR task IN SELECT value FROM jsonb_array_elements(r->'operation'->'documents') LOOP
  payload:=jsonb_build_object('company_id','48600000-0000-4000-8000-000000000001','transaction_id',task->>'transaction_id',
    'bucket',task->>'bucket','path',task->>'path','status','error','error_code','download_failed');
  x:=public.ads_invoice_document_complete_v1(op,task->>'key',payload);
  ASSERT x->>'state'='financial_committed' AND x#>>'{task,error_code}'='download_failed','failure_retains_finance';
  payload:=(payload-'error_code')||jsonb_build_object('status','complete','sha256',
    repeat(CASE WHEN task->>'key'='original' THEN 'a' ELSE 'b' END,64));
  before_state:=pg_temp.ads486_digest();
  BEGIN PERFORM public.ads_invoice_document_complete_v1(op,task->>'key',payload||'{"path":"wrong"}'::jsonb);RAISE EXCEPTION 'wrong_object';
  EXCEPTION WHEN SQLSTATE 'P0422' THEN ASSERT SQLERRM='invalid_plan'; END;
  BEGIN PERFORM public.ads_invoice_document_complete_v1(op,task->>'key',payload||'{"company_id":"48600000-0000-4000-8000-000000000002"}'::jsonb);RAISE EXCEPTION 'tenant_mismatch';
  EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='forbidden'; END;
  ASSERT before_state=pg_temp.ads486_digest(),'bad_callbacks_zero_write';
  IF task->>'key'='original' THEN
   BEGIN PERFORM public.ads_invoice_document_complete_v1(op,task->>'key',payload||jsonb_build_object('sha256',repeat('c',64)));RAISE EXCEPTION 'wrong_original_digest';
   EXCEPTION WHEN SQLSTATE 'P0422' THEN ASSERT SQLERRM='document_digest_mismatch'; END;
  END IF;
  x:=public.ads_invoice_document_complete_v1(op,task->>'key',payload);
  y:=public.ads_invoice_document_complete_v1(op,task->>'key',payload);
  ASSERT x=y AND x#>>'{task,document_id}' IS NOT NULL,'same_document_on_retry';
  BEGIN PERFORM public.ads_invoice_document_complete_v1(op,task->>'key',payload||jsonb_build_object('sha256',repeat('d',64)));RAISE EXCEPTION 'changed_completed_digest';
  EXCEPTION WHEN SQLSTATE 'P0409' THEN ASSERT SQLERRM='document_digest_mismatch'; END;
 END LOOP;
 ASSERT x->>'state'='complete','all_tasks_required';
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.transaction_documents)=2,'one_original_one_proof';
 ASSERT (SELECT count(*) FROM public.transaction_documents WHERE is_accounting)=1,'only_mother_fiscal';
 ASSERT (SELECT count(*) FROM public.transactions)=3,'document_retry_no_cost';
 ASSERT (SELECT amount=110 AND baseline_amount=100 FROM public.event_forecasts WHERE id='48600000-0000-4000-8000-000000000301'),'document_retry_no_raise';
END $$;
-- C2/P7: outbox com consumo ordenado, error/ack/retry e recibos estáveis.
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE x jsonb; task jsonb; payload jsonb; first_ack jsonb; retry_payload jsonb; BEGIN
 x:=public.ads_invoice_maintenance_v1('48600000-0000-4000-8000-000000000501','list',
  '{"company_id":"48600000-0000-4000-8000-000000000001"}');
 task:=x->'task'; ASSERT task->>'action'='lock_campaigns' AND task->>'status'='pending','real_confirm_task';
 ASSERT task#>>'{resources,source,identity,account_id}'='synthetic-account-486','source_bound_outbox';
 payload:=(task-ARRAY['resources','receipts','invoice_id','generation_cycle','status','error_code'])||jsonb_build_object(
  'request_key','48600000-0000-4000-8000-000000000851','status','error','error_code','synthetic_retryable');
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_maintenance_v1(%L,''ack'',%L::jsonb)',
  '48600000-0000-4000-8000-000000000501',payload||'{"company_id":"48600000-0000-4000-8000-000000000002"}'::jsonb), '42501','forbidden');
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_maintenance_v1(%L,''ack'',%L::jsonb)',
  '48600000-0000-4000-8000-000000000501',payload||'{"action":"unlock_campaigns"}'::jsonb), 'P0409','maintenance_conflict');
 first_ack:=public.ads_invoice_maintenance_v1('48600000-0000-4000-8000-000000000501','ack',payload);
 ASSERT first_ack=public.ads_invoice_maintenance_v1('48600000-0000-4000-8000-000000000501','ack',payload),'ack_exact_retry';
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_maintenance_v1(%L,''ack'',%L::jsonb)',
  '48600000-0000-4000-8000-000000000501',payload||'{"error_code":"changed"}'::jsonb), 'P0409','request_conflict');
 ASSERT public.ads_invoice_maintenance_v1('48600000-0000-4000-8000-000000000501','list',
  '{"company_id":"48600000-0000-4000-8000-000000000001"}')#>>'{task,status}'='error','failed_head_visible';
 retry_payload:=payload||'{"request_key":"48600000-0000-4000-8000-000000000852","status":"pending","error_code":null}'::jsonb;
 x:=public.ads_invoice_maintenance_v1('48600000-0000-4000-8000-000000000501','retry',retry_payload);
 ASSERT x#>>'{task,attempt}'='2' AND x#>>'{task,status}'='pending','explicit_retry_advances_attempt';
 ASSERT x=public.ads_invoice_maintenance_v1('48600000-0000-4000-8000-000000000501','retry',retry_payload),'retry_receipt_stable';
 payload:=payload||'{"request_key":"48600000-0000-4000-8000-000000000853","status":"complete","error_code":null,"attempt":2}'::jsonb;
 x:=public.ads_invoice_maintenance_v1('48600000-0000-4000-8000-000000000501','ack',payload);
 ASSERT x#>>'{task,status}'='complete','ack_completes_head';
 ASSERT public.ads_invoice_maintenance_v1('48600000-0000-4000-8000-000000000501','list',
  '{"company_id":"48600000-0000-4000-8000-000000000001"}')->'task'='null'::jsonb,'outbox_drained';
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT public.ads_invoice_revert_v1('48600000-0000-4000-8000-000000000501',(SELECT (result#>>'{operation,id}')::uuid FROM ads486_run),1);
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE task jsonb; op uuid; payload jsonb; x jsonb; BEGIN
 SELECT result#>'{operation,documents,0}',(result#>>'{operation,id}')::uuid INTO task,op FROM ads486_run;
 payload:=jsonb_build_object('company_id','48600000-0000-4000-8000-000000000001','transaction_id',task->>'transaction_id',
  'bucket',task->>'bucket','path',task->>'path','status','complete','sha256',repeat('a',64));
 PERFORM pg_temp.ads486_expect(format('SELECT public.ads_invoice_document_complete_v1(%L,''original'',%L::jsonb)',op,payload),
  'P0409','request_conflict');
 x:=public.ads_invoice_maintenance_v1('48600000-0000-4000-8000-000000000501','list',
  '{"company_id":"48600000-0000-4000-8000-000000000001"}');
 ASSERT x#>>'{task,action}'='revert_cleanup' AND x#>>'{task,operation_id}'=op::text,'revert_task_bound';
 ASSERT x#>'{task,resources,documents}' IS NOT NULL,'cleanup_exact_document_ids';
 ASSERT (SELECT count(*) FROM public.transactions)=1,'callback_cannot_restore_finance';
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
