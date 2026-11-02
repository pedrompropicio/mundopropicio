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
