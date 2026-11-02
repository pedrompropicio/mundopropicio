-- PREPARADO / NÃO EXECUTADO. Testa só conclusão documental sobre operação
-- semeada explicitamente pelo owner sintético; NÃO prova geração financeira.
\set ON_ERROR_STOP on
BEGIN;
\ir fixture.sql
UPDATE public.ads_invoice SET status = 'applied',parent_transaction_id = '48600000-0000-4000-8000-000000000401'
WHERE id = '48600000-0000-4000-8000-000000000501';
INSERT INTO public.ads_invoice_generation_operation(id,invoice_id,company_id,generation_cycle,request_key,
 preview_hash,request_hash,plan_snapshot,result_snapshot,documents,state,created_by)
VALUES('48600000-0000-4000-8000-000000000801','48600000-0000-4000-8000-000000000501',
 '48600000-0000-4000-8000-000000000001',0,'48600000-0000-4000-8000-000000000701',repeat('0',64),repeat('1',64),
 '{"version":1,"allocations":[],"new_forecasts":[],"budget_proposals":[]}',
 '{"contract_version":1,"parent":{"id":"48600000-0000-4000-8000-000000000401"},"children":[]}',
 '[{"key":"original","transaction_id":"48600000-0000-4000-8000-000000000401","bucket":"transaction-documents",
 "path":"48600000-0000-4000-8000-000000000001/ads-invoices/operations/48600000-0000-4000-8000-000000000801/original.pdf",
 "name":"Synthetic.pdf","doc_type":"fatura","is_accounting":true,"status":"pending","document_id":null,"error_code":null}]',
 'financial_committed','48600000-0000-4000-8000-000000000101');
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.ads_invoice_document_complete_v1('48600000-0000-4000-8000-000000000801','original','{}');
    RAISE EXCEPTION 'authenticated_document_write';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM 1 FROM public.ads_invoice_generation_operation;
    RAISE EXCEPTION 'direct_operation_read';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE p jsonb; x jsonb; y jsonb; BEGIN
  ASSERT current_user = 'service_role' AND session_user = 'service_role';
  p := '{"company_id":"48600000-0000-4000-8000-000000000001","transaction_id":"48600000-0000-4000-8000-000000000401","bucket":"transaction-documents","path":"48600000-0000-4000-8000-000000000001/ads-invoices/operations/48600000-0000-4000-8000-000000000801/original.pdf","status":"error","error_code":"upload_failed"}';
  x := public.ads_invoice_document_complete_v1('48600000-0000-4000-8000-000000000801','original',p);
  ASSERT x->>'state' = 'financial_committed' AND x->'task'->>'error_code' = 'upload_failed','document_failure_retains_finance';
  p := (p - 'error_code') || '{"status":"complete"}'::jsonb;
  x := public.ads_invoice_document_complete_v1('48600000-0000-4000-8000-000000000801','original',p);
  y := public.ads_invoice_document_complete_v1('48600000-0000-4000-8000-000000000801','original',p);
  ASSERT x = y AND x->>'state' = 'complete' AND x->'task'->>'document_id' IS NOT NULL,'document_retry_same_reference';
  BEGIN
    PERFORM public.ads_invoice_document_complete_v1('48600000-0000-4000-8000-000000000801','original',p || '{"company_id":"48600000-0000-4000-8000-000000000002"}'::jsonb);
    RAISE EXCEPTION 'service_tenant_mismatch';
  EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM = 'forbidden'; END;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.transaction_documents WHERE transaction_id = '48600000-0000-4000-8000-000000000401') = 1,'single_link';
  ASSERT (SELECT count(*) FROM public.transactions) = 1,'document_retry_creates_no_cost';
  ASSERT (SELECT amount = 100 AND baseline_amount = 100 FROM public.event_forecasts WHERE id = '48600000-0000-4000-8000-000000000301'),'document_retry_creates_no_budget';
END $$;
ROLLBACK;
