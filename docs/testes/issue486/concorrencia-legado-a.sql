-- C2/P7/P9: -v callback_race=true; setup com a mesma opção.
\if :{?callback_race}
\if :callback_race
\set ON_ERROR_STOP on
\if :{?revert_first}
\else
\set revert_first false
\endif
\if :{?winner_rollback}
\else
\set winner_rollback false
\endif
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',false);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',false);
CREATE TEMP TABLE callback_operation(o jsonb);
INSERT INTO callback_operation SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','operation')->'operation';
GRANT SELECT ON callback_operation TO service_role;
RESET SESSION AUTHORIZATION;
BEGIN;
\if :revert_first
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',false);
SELECT public.ads_invoice_revert_v1('48600000-0000-4000-8000-000000000501',(SELECT (o->>'id')::uuid FROM callback_operation),1);
\else
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
DO $$ DECLARE o jsonb; task jsonb; payload jsonb; x jsonb; BEGIN
 SELECT c.o INTO o FROM callback_operation c; task:=o#>'{documents,0}';
 ASSERT o->>'state'='financial_committed' AND task->>'key'='original','real_callback_target';
 payload:=jsonb_build_object('company_id',o->>'company_id','transaction_id',task->>'transaction_id',
 'bucket',task->>'bucket','path',task->>'path','status','complete','sha256',repeat('a',64));
 x:=public.ads_invoice_document_complete_v1((o->>'id')::uuid,'original',payload);
 ASSERT x#>>'{task,status}'='complete','callback_completed';
END $$;
\endif
SELECT pg_backend_pid(),session_user,current_user;
\prompt 'Controller: observe B waiting; release A before 2s: ' release_callback
\if :winner_rollback
ROLLBACK;
\else
COMMIT;
\endif
RESET SESSION AUTHORIZATION;
\quit
\endif
\endif
-- P9 writer A reads v0/earlier state, B converts, A resumes each first write.
-- PREPARADO, NÃO EXECUTADO. Run on fresh concurrency setup for each variant.
\set ON_ERROR_STOP on
SET SESSION AUTHORIZATION service_role;
BEGIN;
SELECT pg_backend_pid(),session_user,current_user,status,generation_revision FROM public.ads_invoice
 WHERE id='48600000-0000-4000-8000-000000000501';
\prompt 'A read old state. Run B to commit conversion/generation; then resume A: ' resume_legacy
DO $$ DECLARE parent uuid; child uuid; BEGIN
 SELECT parent_transaction_id INTO parent FROM public.ads_invoice WHERE id='48600000-0000-4000-8000-000000000501';
 SELECT id INTO child FROM public.transactions WHERE parent_transaction_id=parent LIMIT 1;
 ASSERT parent IS NOT NULL AND child IS NOT NULL,'B_really_committed';
 BEGIN
  INSERT INTO public.transactions(company_id,type,category_id,description,amount,date,invoice_ref)
  VALUES('48600000-0000-4000-8000-000000000001','expense','c0000034-0000-0000-0000-000000000001','Trafego Pago',20,'2026-11-02','SYNTHETIC-486-A');
  RAISE EXCEPTION 'late_legacy_parent_inserted';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 BEGIN DELETE FROM public.ads_invoice_line WHERE invoice_id='48600000-0000-4000-8000-000000000501';RAISE EXCEPTION 'late_legacy_lines_deleted';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 BEGIN UPDATE public.event_forecasts SET transaction_id=NULL WHERE transaction_id=child;RAISE EXCEPTION 'late_legacy_anchor_unlinked';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 BEGIN DELETE FROM public.transactions WHERE id=parent;RAISE EXCEPTION 'late_legacy_group_deleted';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 BEGIN UPDATE public.ads_invoice SET status='proposed',confirmed_by=NULL WHERE id='48600000-0000-4000-8000-000000000501';RAISE EXCEPTION 'late_legacy_reopened';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 BEGIN UPDATE public.ads_invoice SET status='confirmed',confirmed_at=now() WHERE id='48600000-0000-4000-8000-000000000501';RAISE EXCEPTION 'late_legacy_confirmed';
 EXCEPTION WHEN insufficient_privilege THEN ASSERT SQLERRM='ads_v1_command_required'; END;
 ASSERT EXISTS(SELECT 1 FROM public.event_forecasts WHERE transaction_id=child),'anchor_retained';
 ASSERT (SELECT count(*) FROM public.transactions WHERE invoice_ref='SYNTHETIC-486-A')=2,'one_financial_group';
END $$;
ROLLBACK;
RESET SESSION AUTHORIZATION;
