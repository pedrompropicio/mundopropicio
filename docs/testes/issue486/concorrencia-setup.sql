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

-- C3: cada variante usa uma base nova; opções iguais nas sessões A/B.
\if :{?c3_case}
SELECT set_config('issue486.c3_case',:'c3_case',true);
DO $$ BEGIN
 ASSERT current_setting('issue486.c3_case') IN ('same_key','different_key','different_bp','create','commitment_update','commitment_delete',
  'legacy_parent','legacy_lines_delete','legacy_bp_update','closed'),'known_c3_case';
END $$;
CREATE SCHEMA issue486_test AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA issue486_test FROM PUBLIC;
GRANT USAGE ON SCHEMA issue486_test TO authenticated,service_role;
CREATE TABLE issue486_test.state(invoice_id uuid PRIMARY KEY,plan jsonb NOT NULL,request jsonb,result jsonb);
GRANT SELECT,UPDATE ON issue486_test.state TO authenticated,service_role;
DO $$ BEGIN
 EXECUTE replace(pg_get_functiondef('pg_temp.ads486_digest()'::regprocedure),
  (SELECT quote_ident(nspname)||'.ads486_digest' FROM pg_namespace WHERE oid=pg_my_temp_schema()),'issue486_test.digest');
END $$;
DO $$ BEGIN
 EXECUTE replace(replace(pg_get_functiondef('pg_temp.ads486_expect(text,text,text)'::regprocedure),
  (SELECT quote_ident(nspname)||'.ads486_expect' FROM pg_namespace WHERE oid=pg_my_temp_schema()),'issue486_test.expect'),
  'pg_temp.ads486_digest()','issue486_test.digest()');
END $$;
REVOKE ALL ON FUNCTION issue486_test.expect(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION issue486_test.expect(text,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION issue486_test.digest() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION issue486_test.digest() TO authenticated,service_role;
INSERT INTO issue486_test.state(invoice_id,plan) VALUES
 ('48600000-0000-4000-8000-000000000501',(SELECT plan FROM ads486_fixture)),
 ('48600000-0000-4000-8000-000000000502',jsonb_set((SELECT plan FROM ads486_fixture),'{allocations,0,line_id}','"48600000-0000-4000-8000-000000000602"'));
DO $$ DECLARE mode text:=current_setting('issue486.c3_case'); BEGIN
 IF mode='different_bp' THEN
  INSERT INTO public.event_forecasts(id,company_id,event_id,category_id,type,description,amount,status,currency,iva_rate)
   VALUES('48600000-0000-4000-8000-000000000302','48600000-0000-4000-8000-000000000001',
    '48600000-0000-4000-8000-000000000201','c0000034-0000-0000-0000-000000000001','expense','Purpose B',20,'approved','EUR',0);
  UPDATE issue486_test.state SET plan=jsonb_set(plan,'{allocations,0,forecast_id}','"48600000-0000-4000-8000-000000000302"')
   WHERE invoice_id='48600000-0000-4000-8000-000000000502';
 ELSIF mode='create' THEN
  UPDATE issue486_test.state SET plan=jsonb_set(jsonb_set(plan,'{allocations,0}',
   (plan#>'{allocations,0}')-'forecast_id'||jsonb_build_object('new_forecast_key','purpose_'||right(invoice_id::text,3))),
   '{new_forecasts}',jsonb_build_array(jsonb_build_object('key','purpose_'||right(invoice_id::text,3),
    'event_id','48600000-0000-4000-8000-000000000201','category_id','c0000034-0000-0000-0000-000000000001',
    'description','Distinct purpose '||invoice_id::text,'specification',NULL,'currency','EUR','amount','20.00','observation','Human purpose')));
 ELSIF mode LIKE 'legacy_%' THEN
  PERFORM public._ads486_enter('48600000-0000-4000-8000-000000000501','import');
  UPDATE public.ads_invoice SET source_file_sha256=NULL,source_attestation=NULL WHERE id='48600000-0000-4000-8000-000000000501';
  PERFORM public._ads486_leave();
  ASSERT (SELECT generation_revision=0 AND generation_contract_version IS NULL FROM public.ads_invoice
   WHERE id='48600000-0000-4000-8000-000000000501'),'genuine_v0_fixture';
 END IF;
END $$;
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ DECLARE r record; x jsonb; BEGIN
 IF current_setting('issue486.c3_case') NOT LIKE 'legacy_%' THEN
  FOR r IN SELECT * FROM issue486_test.state ORDER BY invoice_id LOOP
   PERFORM public.ads_invoice_generation_v1(r.invoice_id,'save_plan',jsonb_build_object('expected_revision',0,'plan',r.plan));
   x:=public.ads_invoice_generation_v1(r.invoice_id,'preview');
   ASSERT x->'blockers'='[]'::jsonb,'race_initial_preview';
   PERFORM public.ads_invoice_generation_v1(r.invoice_id,'confirm',jsonb_build_object('expected_revision',1,'preview_hash',x->>'preview_hash'));
   UPDATE issue486_test.state SET request=jsonb_build_object('request_key',gen_random_uuid(),'expected_revision',1,
    'preview_hash',x->>'preview_hash','approvals',(SELECT coalesce(jsonb_agg(jsonb_build_object('effect_id',e->>'effect_id',
     'accepted',true,'observation','Accept '||(e->>'effect_id'))),'[]') FROM jsonb_array_elements(x->'effects') e)) WHERE invoice_id=r.invoice_id;
  END LOOP;
 END IF;
END $$;
RESET SESSION AUTHORIZATION;
DO $$ BEGIN
 IF current_setting('issue486.c3_case')='closed' THEN UPDATE ads486_private.control SET enabled=false WHERE singleton; END IF;
END $$;
COMMIT;
\quit
\endif

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
