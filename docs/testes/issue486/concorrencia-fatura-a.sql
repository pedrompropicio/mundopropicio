-- PREPARADO / NÃO EXECUTADO. Terminal A, depois do setup sintético.
\set ON_ERROR_STOP on
BEGIN;
SET SESSION AUTHORIZATION authenticated;
SET LOCAL application_name = 'issue486-session-a';
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',
 jsonb_build_object('expected_revision',1,'plan',(SELECT generation_plan FROM public.ads_invoice WHERE id = '48600000-0000-4000-8000-000000000501')));
\prompt 'A detém locks; iniciar B e observar espera real antes de continuar: ' barrier_release
COMMIT;
RESET SESSION AUTHORIZATION;
