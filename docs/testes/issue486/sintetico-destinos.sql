-- PREPARADO / NÃO EXECUTADO; catálogo fiel e base exclusivamente sintética.
\set ON_ERROR_STOP on
BEGIN;
\ir fixture.sql
SELECT public._ads486_enter('48600000-0000-4000-8000-000000000501','import');
UPDATE ads486_private.command_context SET line_ids=array_append(line_ids,'48600000-0000-4000-8000-000000000603'::uuid);
INSERT INTO public.ads_invoice_line(id,invoice_id,company_id,line_no,raw_description,amount,is_adjustment)
VALUES('48600000-0000-4000-8000-000000000603','48600000-0000-4000-8000-000000000501',
 '48600000-0000-4000-8000-000000000001',3,'Anonymous synthetic fee',1,true);
UPDATE public.ads_invoice SET total_amount = 41,lines_sum = 41 WHERE id = '48600000-0000-4000-8000-000000000501';
UPDATE ads486_fixture SET plan = jsonb_set(plan,'{allocations,1}',
 '{"key":"b","line_id":"48600000-0000-4000-8000-000000000602","destination":"company","amount":"20.00","observation":"Corporate media"}') || '{}'::jsonb;
UPDATE ads486_fixture SET plan = jsonb_set(plan,'{allocations}',plan->'allocations' ||
 '[{"key":"tax","line_id":"48600000-0000-4000-8000-000000000603","destination":"prorate","amount":"1.00","observation":""}]');
SELECT public._ads486_leave();
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
SELECT public._ads486_enter('48600000-0000-4000-8000-000000000501','import');
UPDATE public.ads_invoice_line SET amount = -0.01 WHERE id = '48600000-0000-4000-8000-000000000603';
UPDATE public.ads_invoice SET total_amount = 39.99,lines_sum = 39.99 WHERE id = '48600000-0000-4000-8000-000000000501';
SELECT public._ads486_leave();
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

-- C2/P1: ajuste negativo explícito, base zero e Master com duas cidades.
BEGIN;
\ir fixture.sql
SELECT public._ads486_enter('48600000-0000-4000-8000-000000000501','import');
UPDATE ads486_private.command_context SET line_ids=array_append(line_ids,'48600000-0000-4000-8000-000000000603'::uuid);
INSERT INTO public.ads_invoice_line(id,invoice_id,company_id,line_no,raw_description,amount,is_adjustment)
VALUES('48600000-0000-4000-8000-000000000603','48600000-0000-4000-8000-000000000501',
 '48600000-0000-4000-8000-000000000001',3,'Explicit negative credit',-1,true);
UPDATE public.ads_invoice SET total_amount=39,lines_sum=39 WHERE id='48600000-0000-4000-8000-000000000501';
SELECT public._ads486_leave();
UPDATE ads486_fixture SET plan=jsonb_set(plan,'{allocations}',plan->'allocations'||jsonb_build_array(
 (plan->'allocations'->0)||'{"key":"negative","line_id":"48600000-0000-4000-8000-000000000603","amount":"-1.00"}'::jsonb));
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ DECLARE p jsonb; x jsonb; BEGIN
 SELECT plan INTO p FROM ads486_fixture;
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',0,'plan',p));
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT x#>>'{children,0,amount}'='39.00','explicit_negative_integral';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(x->'allocations') a WHERE a->>'key'='negative' AND a->>'amount'='-1.00' AND a->'prorated'='false'::jsonb),'negative_sign_retained';
 p:=jsonb_set(p,'{allocations,2}',p#>'{allocations,2}'-ARRAY['event_id','forecast_id']||'{"destination":"company"}'::jsonb);
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',1,'plan',p));
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT (SELECT c->>'amount' FROM jsonb_array_elements(x->'children') c WHERE c->>'destination'='company')='-1.00','company_negative_preserved';
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(x->'blockers') b WHERE b->>'code'='unsupported_financial_shape'),'standalone_negative_denied';
 p:=jsonb_set(p,'{allocations}',(SELECT jsonb_agg(CASE WHEN a->>'key'='negative' THEN a||'{"destination":"prorate"}'::jsonb
  ELSE a-ARRAY['event_id','forecast_id']||'{"destination":"outside","observation":"Explicit outside"}'::jsonb END) FROM jsonb_array_elements(p->'allocations') a));
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',2,'plan',p));
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(x->'blockers') b WHERE b->>'reason'='adjustment_without_media'),'zero_media_base_denied';
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
BEGIN;
\ir fixture.sql
INSERT INTO public.events(id,company_id,name,date,event_nature,parent_event_id) VALUES
 ('48600000-0000-4000-8000-000000000204','48600000-0000-4000-8000-000000000001','Synthetic second city','2026-11-04','producao_propria','48600000-0000-4000-8000-000000000201');
INSERT INTO public.event_forecasts(id,company_id,event_id,category_id,type,description,amount,baseline_amount,status,currency,iva_rate,master_forecast_id) VALUES
 ('48600000-0000-4000-8000-000000000302','48600000-0000-4000-8000-000000000001','48600000-0000-4000-8000-000000000202','c0000034-0000-0000-0000-000000000001','expense','City A adopted purpose',50,50,'approved','EUR',0,'48600000-0000-4000-8000-000000000301'),
 ('48600000-0000-4000-8000-000000000303','48600000-0000-4000-8000-000000000001','48600000-0000-4000-8000-000000000204','c0000034-0000-0000-0000-000000000001','expense','City B adopted purpose',50,50,'approved','EUR',0,'48600000-0000-4000-8000-000000000301');
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ DECLARE p jsonb; x jsonb; BEGIN
 SELECT plan INTO p FROM ads486_fixture;
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',0,'plan',p));
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(x->'blockers') b WHERE b->>'code'='ambiguous_master_budget'),'master_root_cannot_refill_adoptions';
 p:=jsonb_set(jsonb_set(p,'{allocations,0,event_id}','"48600000-0000-4000-8000-000000000202"'),'{allocations,0,forecast_id}','"48600000-0000-4000-8000-000000000302"');
 p:=jsonb_set(jsonb_set(p,'{allocations,1,event_id}','"48600000-0000-4000-8000-000000000204"'),'{allocations,1,forecast_id}','"48600000-0000-4000-8000-000000000303"');
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',1,'plan',p));
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT x->'blockers'='[]'::jsonb AND jsonb_array_length(x->'children')=2,'two_adopted_city_purposes';
 ASSERT (SELECT sum((b->>'current')::numeric) FROM jsonb_array_elements(x->'category_budgets') b)=100,'only_city_shares_once';
 ASSERT x->'effects'='[]'::jsonb AND x#>>'{totals,children}'='40.00','no_master_double_budget';
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','set_split',
  '{"expected_revision":2,"line_id":"48600000-0000-4000-8000-000000000601","parts":[{"event_id":"48600000-0000-4000-8000-000000000202","amount":"10.00"},{"event_id":"48600000-0000-4000-8000-000000000204","amount":"10.00"}]}');
 ASSERT NOT EXISTS(SELECT 1 FROM public.ads_invoice i CROSS JOIN LATERAL jsonb_array_elements(i.generation_plan->'allocations') a
   WHERE i.id='48600000-0000-4000-8000-000000000501' AND a->>'line_id'='48600000-0000-4000-8000-000000000601'),'split_invalidates_line_choices';
 p:=jsonb_set(p,'{allocations,0,amount}','"10.00"');
 p:=jsonb_set(p,'{allocations}',p->'allocations'||jsonb_build_array(p#>'{allocations,0}'||
  '{"key":"a-city-b","event_id":"48600000-0000-4000-8000-000000000204","forecast_id":"48600000-0000-4000-8000-000000000303"}'::jsonb));
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',3,'plan',p));
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT x->'blockers'='[]'::jsonb AND jsonb_array_length(x->'allocations')=3,'human_split_keeps_all_parts';
 ASSERT (SELECT c->>'amount' FROM jsonb_array_elements(x->'children') c WHERE c->>'event_id'='48600000-0000-4000-8000-000000000202')='10.00','human_city_a_exact';
 ASSERT (SELECT c->>'amount' FROM jsonb_array_elements(x->'children') c WHERE c->>'event_id'='48600000-0000-4000-8000-000000000204')='30.00','human_city_b_exact';

END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;

-- C2/P1/P3: carreira TikTok exige conta atestada, empresa e música verificáveis.
-- A outra conta tem o MESMO código; nunca serve como prova da conta do PDF.
BEGIN;
\ir fixture.sql
INSERT INTO public.artists(id,company_id,name,slug) VALUES
 ('48600000-0000-4000-8000-000000000911','48600000-0000-4000-8000-000000000001','Synthetic artist','synthetic-486');
INSERT INTO public.artist_songs(id,company_id,artist_id,title) VALUES
 ('48600000-0000-4000-8000-000000000912','48600000-0000-4000-8000-000000000001','48600000-0000-4000-8000-000000000911','Synthetic song');
INSERT INTO crm.ad_platform_connections(id,company_id,platform,external_business_id,access_token_encrypted,
 token_type,selected_ad_account_id,status,connection_scope,artist_id) VALUES
 ('48600000-0000-4000-8000-000000000913','48600000-0000-4000-8000-000000000001','tiktok','synthetic-business',
 'INERT-NOT-A-CREDENTIAL','system_user','synthetic-tiktok-account','active','artist','48600000-0000-4000-8000-000000000911'),
 ('48600000-0000-4000-8000-000000000914','48600000-0000-4000-8000-000000000001','tiktok','synthetic-business',
 'INERT-NOT-A-CREDENTIAL','system_user','synthetic-other-account','active','artist','48600000-0000-4000-8000-000000000911');
INSERT INTO crm.tiktok_campaign(company_id,connection_id,external_campaign_id,name,linked_song_id) VALUES
 ('48600000-0000-4000-8000-000000000001','48600000-0000-4000-8000-000000000913','campaign-486/strong','Same visible name','48600000-0000-4000-8000-000000000912'),
 ('48600000-0000-4000-8000-000000000001','48600000-0000-4000-8000-000000000914','campaign-486/strong','Same visible name','48600000-0000-4000-8000-000000000912');
SELECT public._ads486_enter('48600000-0000-4000-8000-000000000501','import');
-- Prova semeada só para testar o consumidor SQL, sem alegar leitura de PDF real.
UPDATE public.ads_invoice SET platform='tiktok',source_attestation=jsonb_set(source_attestation,'{identity}',
 source_attestation->'identity'||'{"platform":"tiktok","connection_id":"48600000-0000-4000-8000-000000000913","account_id":"synthetic-tiktok-account"}'::jsonb)
WHERE id='48600000-0000-4000-8000-000000000501';
UPDATE public.ads_invoice_line SET external_campaign_id='campaign-486/strong',event_id=NULL,match_source='none'
WHERE id='48600000-0000-4000-8000-000000000601';
SELECT public._ads486_leave();
UPDATE ads486_fixture SET plan=jsonb_set(plan,'{allocations}',(SELECT jsonb_agg(a-ARRAY['event_id','forecast_id']||
 jsonb_build_object('destination',CASE WHEN a->>'key'='a' THEN 'carreira' ELSE 'company' END)) FROM jsonb_array_elements(plan->'allocations') a));
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ DECLARE x jsonb; BEGIN
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',0,'plan',(SELECT plan FROM ads486_fixture)));
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT x->'blockers'='[]'::jsonb AND x#>>'{totals,children}'='40.00','verified_career_company_costs';
 ASSERT (SELECT count(*) FROM jsonb_array_elements(x->'children') c WHERE c->>'destination'='carreira' AND c->>'amount'='20.00')=1,'career_separate_child';
 ASSERT EXISTS(SELECT 1 FROM public.ads_invoice_line WHERE id='48600000-0000-4000-8000-000000000601' AND match_source='carreira'),'server_classified_career';
END $$;
RESET SESSION AUTHORIZATION;
DO $$ DECLARE proof jsonb; BEGIN
 proof:=public._ads486_tiktok_proof('48600000-0000-4000-8000-000000000501');
 ASSERT jsonb_array_length(proof)=1 AND proof#>>'{0,connection_id}'='48600000-0000-4000-8000-000000000913','campaign_id_alone_does_not_select_account';
END $$;
UPDATE crm.ad_platform_connections SET selected_ad_account_id='synthetic-account-changed' WHERE id='48600000-0000-4000-8000-000000000913';
SET SESSION AUTHORIZATION authenticated;
SELECT pg_temp.ads486_expect('SELECT public.ads_invoice_generation_v1(''48600000-0000-4000-8000-000000000501'',''preview'')','P0422','invalid_plan');
RESET SESSION AUTHORIZATION;
ROLLBACK;
