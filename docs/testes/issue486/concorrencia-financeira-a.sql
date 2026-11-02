-- P9 A. PREPARADO, NÃO EXECUTADO. B must already have captured its old preview.
\set ON_ERROR_STOP on
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',false);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',false);
BEGIN;
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview') AS preview \gset
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','confirm',
 jsonb_build_object('expected_revision',1,'preview_hash',:'preview'::jsonb->>'preview_hash'));
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','generate',jsonb_build_object(
 'request_key','48600000-0000-4000-8000-000000000711','expected_revision',1,'preview_hash',:'preview'::jsonb->>'preview_hash','approvals','[]'::jsonb));
SELECT pg_backend_pid(),session_user,current_user;
\prompt 'Controller: observe B blocked, then release A before the 2s deadline: ' release_a
COMMIT;
RESET SESSION AUTHORIZATION;
