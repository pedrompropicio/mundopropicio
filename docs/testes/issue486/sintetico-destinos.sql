-- PREPARADO / NÃO EXECUTADO; catálogo fiel e base exclusivamente sintética.
\set ON_ERROR_STOP on
BEGIN;
\ir fixture.sql
INSERT INTO public.ads_invoice_line(id,invoice_id,company_id,line_no,raw_description,amount,is_adjustment)
VALUES('48600000-0000-4000-8000-000000000603','48600000-0000-4000-8000-000000000501',
 '48600000-0000-4000-8000-000000000001',3,'Anonymous synthetic fee',1,true);
UPDATE public.ads_invoice SET total_amount = 41,lines_sum = 41 WHERE id = '48600000-0000-4000-8000-000000000501';
UPDATE ads486_fixture SET plan = jsonb_set(plan,'{allocations,1}',
 '{"key":"b","line_id":"48600000-0000-4000-8000-000000000602","destination":"company","amount":"20.00","observation":"Corporate media"}') || '{}'::jsonb;
UPDATE ads486_fixture SET plan = jsonb_set(plan,'{allocations}',plan->'allocations' ||
 '[{"key":"tax","line_id":"48600000-0000-4000-8000-000000000603","destination":"prorate","amount":"1.00","observation":""}]');
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ DECLARE p jsonb; x jsonb; amount_event text; amount_company text; BEGIN
  ASSERT session_user = 'authenticated' AND current_user = 'authenticated';
  SELECT plan INTO p FROM ads486_fixture;
  PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',0,'plan',p));
  x := public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
  ASSERT x->'blockers' = '[]'::jsonb,'event_company_prorate_blockers';
  SELECT c->>'amount' INTO amount_event FROM jsonb_array_elements(x->'children') c WHERE c->>'destination' = 'event';
  SELECT c->>'amount' INTO amount_company FROM jsonb_array_elements(x->'children') c WHERE c->>'destination' = 'company';
  ASSERT amount_event = '20.50' AND amount_company = '20.50','positive_fee_exact';
  ASSERT x->'totals'->>'children' = '41.00','company_stays_in_result';
  ASSERT jsonb_array_length(x->'children') = 2,'company_event_distinct';
  -- Ajuste com destino explícito é integral, sem ratear a segunda vez.
  p := jsonb_set(p,'{allocations,2}','{"key":"tax","line_id":"48600000-0000-4000-8000-000000000603","destination":"event","event_id":"48600000-0000-4000-8000-000000000201","forecast_id":"48600000-0000-4000-8000-000000000301","amount":"1.00","observation":"Human assignment"}');
  PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',1,'plan',p));
  x := public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
  ASSERT (SELECT c->>'amount' FROM jsonb_array_elements(x->'children') c WHERE c->>'destination' = 'event') = '21.00','explicit_fee_integral';
  ASSERT (SELECT c->>'amount' FROM jsonb_array_elements(x->'children') c WHERE c->>'destination' = 'company') = '20.00','explicit_fee_not_prorated';
  -- Rejeita inventar Carreira num PDF Meta.
  BEGIN
    PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',2,'plan',jsonb_set(p,'{allocations,1,destination}','"carreira"')));
    RAISE EXCEPTION 'invented_carreira';
  EXCEPTION WHEN SQLSTATE 'P0422' THEN ASSERT SQLERRM = 'invalid_plan'; END;
END $$;
RESET SESSION AUTHORIZATION;
UPDATE public.ads_invoice_line SET amount = -0.01 WHERE id = '48600000-0000-4000-8000-000000000603';
UPDATE public.ads_invoice SET total_amount = 39.99,lines_sum = 39.99 WHERE id = '48600000-0000-4000-8000-000000000501';
SET SESSION AUTHORIZATION authenticated;
DO $$ DECLARE p jsonb; x jsonb; BEGIN
  SELECT plan INTO p FROM ads486_fixture;
  p := jsonb_set(p,'{allocations,2,amount}','"-0.01"');
  PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',2,'plan',p));
  x := public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
  ASSERT x->'blockers' = '[]'::jsonb,'negative_adjustment_blockers';
  ASSERT x->'totals'->>'children' = '39.99','negative_adjustment_exact';
  -- round(-.005,2)=-.01 em ambas; resíduo +.01 na maior base,
  -- empate pela key a. Event=20.00, company=19.99, sem epsilon.
  ASSERT (SELECT c->>'amount' FROM jsonb_array_elements(x->'children') c WHERE c->>'destination' = 'event') = '20.00','stable_residue_event';
  ASSERT (SELECT c->>'amount' FROM jsonb_array_elements(x->'children') c WHERE c->>'destination' = 'company') = '19.99','stable_residue_company';
  p := jsonb_set(jsonb_set(p,'{allocations,1,destination}','"outside"'),'{allocations,1,observation}','"Outside with human reason"');
  PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',3,'plan',p));
  x := public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
  ASSERT x->'totals' = '{"children":"19.99","outside":"20.00","invoice":"39.99"}'::jsonb,'outside_excluded_from_proration';
END $$;
RESET SESSION AUTHORIZATION;
-- Mesmo total mas compromisso maior sem BP: a linha individual ainda cabe,
-- a rubrica bloqueia. Nenhum preenchimento automático do défice residual.
UPDATE public.transactions SET amount = 100,forecast_id = NULL WHERE id = '48600000-0000-4000-8000-000000000401';
UPDATE public.event_forecasts SET transaction_id = NULL WHERE id = '48600000-0000-4000-8000-000000000301';
SET SESSION AUTHORIZATION authenticated;
DO $$ DECLARE x jsonb; BEGIN
  x := public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
  ASSERT EXISTS (SELECT 1 FROM jsonb_array_elements(x->'blockers') b WHERE b->>'reason' = 'category_residual'),'unlinked_commitment_counts';
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(x->'effects') e WHERE e->>'kind' = 'raise'),'no_implicit_category_raise';
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
