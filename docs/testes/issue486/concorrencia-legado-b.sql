-- C2/P7/P9: iniciar depois da primeira mutação não confirmada de A.
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
SET SESSION AUTHORIZATION service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
SELECT set_config('issue486.winner_rollback',:'winner_rollback',true);
DO $$ DECLARE o jsonb; task jsonb; payload jsonb; x jsonb; failed boolean:=false; BEGIN
 SELECT c.o INTO o FROM callback_operation c; task:=o#>'{documents,0}';
 payload:=jsonb_build_object('company_id',o->>'company_id','transaction_id',task->>'transaction_id',
 'bucket',task->>'bucket','path',task->>'path','status','complete','sha256',repeat('a',64));
 BEGIN x:=public.ads_invoice_document_complete_v1((o->>'id')::uuid,'original',payload);
 EXCEPTION WHEN SQLSTATE 'P0409' THEN ASSERT SQLERRM='request_conflict';failed:=true; END;
 IF current_setting('issue486.winner_rollback')::boolean THEN
  ASSERT NOT failed AND x#>>'{task,status}'='complete','rolled_back_revert_allows_callback';
 ELSE ASSERT failed,'committed_revert_refuses_callback'; END IF;
END $$;
\else
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',false);
SELECT public.ads_invoice_revert_v1('48600000-0000-4000-8000-000000000501',(SELECT (o->>'id')::uuid FROM callback_operation),1);
\endif
COMMIT;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.ads_invoice_generation_operation WHERE invoice_id='48600000-0000-4000-8000-000000000501')=1,'race_single_operation';
 IF (SELECT state='reverted' FROM public.ads_invoice_generation_operation WHERE invoice_id='48600000-0000-4000-8000-000000000501') THEN
  ASSERT NOT EXISTS(SELECT 1 FROM public.transactions WHERE invoice_ref='SYNTHETIC-486-A'),'race_reverted_group_gone';
  ASSERT EXISTS(SELECT 1 FROM public.ads_invoice i CROSS JOIN LATERAL jsonb_array_elements(i.generation_maintenance) t
   WHERE i.id='48600000-0000-4000-8000-000000000501' AND t->>'action'='revert_cleanup'),'race_cleanup_retained';
 END IF;
END $$;
\quit
\endif
\endif
-- P9 B, independent PID, while A is at its read barrier. PREPARADO, NÃO EXECUTADO.
\set ON_ERROR_STOP on
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',false);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',false);
BEGIN;
DO $$ DECLARE x jsonb; result jsonb; BEGIN
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','confirm',jsonb_build_object('expected_revision',1,'preview_hash',x->>'preview_hash'));
 result:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','generate',jsonb_build_object('request_key',
  '48600000-0000-4000-8000-000000000721','expected_revision',1,'preview_hash',x->>'preview_hash','approvals','[]'::jsonb));
 ASSERT result->'already'='false'::jsonb,'B_created_once';
END $$;
COMMIT;
RESET SESSION AUTHORIZATION;
-- Select a legitimate existing child as anchor to expose handleRevert's first
-- unlink. No false test from UPDATE affecting zero rows.
UPDATE public.event_forecasts SET transaction_id=(SELECT id FROM public.transactions WHERE
 parent_transaction_id=(SELECT parent_transaction_id FROM public.ads_invoice WHERE id='48600000-0000-4000-8000-000000000501') LIMIT 1)
WHERE id='48600000-0000-4000-8000-000000000301';
SELECT pg_backend_pid(),session_user,current_user;
