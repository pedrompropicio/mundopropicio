-- P9 SETUP. PREPARADO, NÃO EXECUTADO; COMMIT só em futura base descartável.
\set ON_ERROR_STOP on
BEGIN;
\ir fixture.sql
SELECT public._ads486_enter('48600000-0000-4000-8000-000000000501','import');
DELETE FROM public.ads_invoice_line WHERE id='48600000-0000-4000-8000-000000000602';
UPDATE public.ads_invoice SET total_amount=20,lines_sum=20 WHERE id='48600000-0000-4000-8000-000000000501';
SELECT public._ads486_leave();
UPDATE ads486_fixture SET plan=jsonb_set(plan,'{allocations}',jsonb_build_array(plan->'allocations'->0));
SELECT public._ads486_enter('48600000-0000-4000-8000-000000000502','import');
INSERT INTO public.ads_invoice(id,company_id,platform,invoice_number,currency,billing_period,issue_date,total_amount,lines_sum,source,file_path,
 source_file_sha256,source_attestation)
VALUES('48600000-0000-4000-8000-000000000502','48600000-0000-4000-8000-000000000001','meta','SYNTHETIC-486-B','EUR','2026-12-01','2026-12-02',20,20,
 'pdf','48600000-0000-4000-8000-000000000001/meta/synthetic-b.pdf',repeat('b',64),
 jsonb_build_object('company_id','48600000-0000-4000-8000-000000000001','bucket','ads-invoices',
 'path','48600000-0000-4000-8000-000000000001/meta/synthetic-b.pdf','sha256',repeat('b',64),
 'identity',(SELECT source_attestation->'identity' FROM public.ads_invoice WHERE id='48600000-0000-4000-8000-000000000501')
 ||jsonb_build_object('invoice_number','SYNTHETIC-486-B','sha256',repeat('b',64))));
UPDATE ads486_private.command_context SET line_ids=ARRAY['48600000-0000-4000-8000-000000000602'::uuid];
INSERT INTO public.ads_invoice_line(id,invoice_id,company_id,line_no,raw_description,amount)
VALUES('48600000-0000-4000-8000-000000000602','48600000-0000-4000-8000-000000000502','48600000-0000-4000-8000-000000000001',1,'Second invoice',20);
SELECT public._ads486_leave();
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',0,'plan',(SELECT plan FROM ads486_fixture)));
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','save_plan',jsonb_build_object('expected_revision',0,
 'plan',jsonb_set((SELECT plan FROM ads486_fixture),'{allocations,0,line_id}','"48600000-0000-4000-8000-000000000602"')));
\if :{?callback_race}
\if :callback_race
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview') AS callback_preview \gset
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','confirm',jsonb_build_object('expected_revision',1,'preview_hash',:'callback_preview'::jsonb->>'preview_hash'));
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','generate',jsonb_build_object('request_key','48600000-0000-4000-8000-000000000877','expected_revision',1,'preview_hash',:'callback_preview'::jsonb->>'preview_hash','approvals','[]'::jsonb));
\endif
\endif
RESET SESSION AUTHORIZATION;
COMMIT;
