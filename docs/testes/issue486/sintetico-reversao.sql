-- P8: independent blockers + idempotent reversal. PREPARADO, NÃO EXECUTADO.
\set ON_ERROR_STOP on
BEGIN;
\ir fixture.sql
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT pg_temp.ads486_generate_fixture();
RESET SESSION AUTHORIZATION;
DO $$ DECLARE blocker text; tid uuid; op uuid; header uuid; before_state jsonb; x jsonb; y jsonb; req jsonb; BEGIN
 SELECT (result#>>'{operation,result_snapshot,children,0,transaction_id}')::uuid,
   (result#>>'{operation,id}')::uuid,request INTO tid,op,req FROM ads486_run;
 FOREACH blocker IN ARRAY ARRAY['paid','paid_amount','payment_list','reimbursement_item','reimbursement_payment','accountant_review','accounting_export'] LOOP
  BEGIN
   CASE blocker
   WHEN 'paid' THEN UPDATE public.transactions SET status='paid' WHERE id=tid;
   WHEN 'paid_amount' THEN UPDATE public.transactions SET paid_amount=1 WHERE id=tid;
   WHEN 'payment_list' THEN
    INSERT INTO public.payment_lists(company_id,title,payment_date) VALUES('48600000-0000-4000-8000-000000000001','Synthetic payment list','2026-11-02') RETURNING id INTO header;
    INSERT INTO public.payment_list_items(company_id,payment_list_id,transaction_id) VALUES('48600000-0000-4000-8000-000000000001',header,tid);
   WHEN 'reimbursement_item' THEN
    INSERT INTO public.reimbursement_notes(company_id,code,employee_name) VALUES('48600000-0000-4000-8000-000000000001','SYNTHETIC486','Synthetic actor') RETURNING id INTO header;
    INSERT INTO public.reimbursement_note_items(company_id,reimbursement_note_id,transaction_id) VALUES('48600000-0000-4000-8000-000000000001',header,tid);
   WHEN 'reimbursement_payment' THEN
    INSERT INTO public.reimbursement_notes(company_id,code,employee_name,payment_transaction_id)
     VALUES('48600000-0000-4000-8000-000000000001','SYNTHETIC486','Synthetic actor',tid);
   WHEN 'accountant_review' THEN
    INSERT INTO public.accountant_transaction_reviews(company_id,transaction_id,status)
     VALUES('48600000-0000-4000-8000-000000000001',tid,'pendente');
   WHEN 'accounting_export' THEN
    INSERT INTO public.accounting_exports(company_id,period_from,period_to)
     VALUES('48600000-0000-4000-8000-000000000001','2026-11-01','2026-11-30');
   ELSE RAISE EXCEPTION 'unknown_blocker'; END CASE;
   before_state:=pg_temp.ads486_digest();
   EXECUTE 'SET SESSION AUTHORIZATION authenticated';
   ASSERT session_user='authenticated' AND current_user='authenticated';
   BEGIN PERFORM public.ads_invoice_revert_v1('48600000-0000-4000-8000-000000000501',op,1);RAISE EXCEPTION 'blocker_ignored_%',blocker;
   EXCEPTION WHEN SQLSTATE 'P0409' THEN ASSERT SQLERRM='revert_blocked'; END;
   ASSERT before_state=pg_temp.ads486_digest(),'blocked_reversal_atomic_'||blocker;
   EXECUTE 'RESET SESSION AUTHORIZATION';
   RAISE EXCEPTION USING ERRCODE='P0487',MESSAGE='rollback_isolated_blocker';
  EXCEPTION WHEN SQLSTATE 'P0487' THEN ASSERT SQLERRM='rollback_isolated_blocker'; END;
 END LOOP;
 EXECUTE 'SET SESSION AUTHORIZATION authenticated';
 x:=public.ads_invoice_revert_v1('48600000-0000-4000-8000-000000000501',op,1);
 y:=public.ads_invoice_revert_v1('48600000-0000-4000-8000-000000000501',op,1);
 ASSERT x->'operation'=y->'operation' AND y->'already'='true'::jsonb,'idempotent_revert';
 ASSERT x->>'revision'='2' AND x->>'generation_cycle'='1','one_cycle_increment';
 ASSERT (SELECT count(*) FROM public.transactions)=1,'exact_group_removed';
 ASSERT (SELECT amount=110 AND baseline_amount=100 FROM public.event_forecasts WHERE id='48600000-0000-4000-8000-000000000301'),'reversal_retains_budget';
 y:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','generate',req);
 ASSERT y->'operation'->>'state'='reverted' AND y->'already'='true'::jsonb,'retry_never_regenerates_reverted';
 EXECUTE 'RESET SESSION AUTHORIZATION';
 ASSERT EXISTS(SELECT 1 FROM public.ads_invoice_generation_operation WHERE id=op AND state='reverted'),'history_retained';
 ASSERT NOT EXISTS(SELECT 1 FROM public.ads_invoice_line WHERE invoice_id='48600000-0000-4000-8000-000000000501' AND transaction_id IS NOT NULL),'all_source_links_cleared';
END $$;
ROLLBACK;
