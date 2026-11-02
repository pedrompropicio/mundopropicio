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
