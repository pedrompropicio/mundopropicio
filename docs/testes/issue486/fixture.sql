-- SINTÉTICO / PREPARADO / NÃO EXECUTADO. Incluir dentro de BEGIN.
-- Exige catálogo fiel, sem dados operacionais, database issue486_synthetic,
-- rede/cron/HTTP desligados pelo futuro harness. Não desliga triggers para passar.
DO $$ BEGIN
  IF current_database() <> 'issue486_synthetic' THEN RAISE EXCEPTION 'synthetic_database_required'; END IF;
  IF EXISTS (SELECT 1 FROM public.companies) OR EXISTS (SELECT 1 FROM public.ads_invoice) OR
     EXISTS (SELECT 1 FROM public.account_categories WHERE id = 'c0000034-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'empty_synthetic_fixture_required';
  END IF;
END $$;
INSERT INTO public.companies(id,slug,display_name,legal_name,currency,status) VALUES
 ('48600000-0000-4000-8000-000000000001','issue486-a','Synthetic A','Synthetic A','EUR','active'),
 ('48600000-0000-4000-8000-000000000002','issue486-b','Synthetic B','Synthetic B','EUR','active');
-- auth.users pode ter o trigger normal de perfil; a fixture não o contorna.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('48600000-0000-4000-8000-000000000101','a@issue486.invalid','{"full_name":"Synthetic A","company_id":"48600000-0000-4000-8000-000000000001"}'),
 ('48600000-0000-4000-8000-000000000102','b@issue486.invalid','{"full_name":"Synthetic B","company_id":"48600000-0000-4000-8000-000000000002"}');
INSERT INTO public.profiles(id,full_name,company_id,active_company_id) VALUES
 ('48600000-0000-4000-8000-000000000101','Synthetic A','48600000-0000-4000-8000-000000000001','48600000-0000-4000-8000-000000000001'),
 ('48600000-0000-4000-8000-000000000102','Synthetic B','48600000-0000-4000-8000-000000000002','48600000-0000-4000-8000-000000000002')
ON CONFLICT(id) DO UPDATE SET company_id = excluded.company_id,active_company_id = excluded.active_company_id;
INSERT INTO public.user_roles(user_id,company_id,role) VALUES
 ('48600000-0000-4000-8000-000000000101','48600000-0000-4000-8000-000000000001','admin'),
 ('48600000-0000-4000-8000-000000000102','48600000-0000-4000-8000-000000000002','admin');
INSERT INTO public.account_categories(id,company_id,code,name,type,is_active) VALUES
 ('c0000034-0000-0000-0000-000000000001','48600000-0000-4000-8000-000000000001','3.2.01','Digital','expense',true);
INSERT INTO public.events(id,company_id,name,date,event_nature,parent_event_id) VALUES
 ('48600000-0000-4000-8000-000000000201','48600000-0000-4000-8000-000000000001','Synthetic Master','2026-11-01','producao_propria',NULL),
 ('48600000-0000-4000-8000-000000000202','48600000-0000-4000-8000-000000000001','Synthetic City','2026-11-02','producao_propria','48600000-0000-4000-8000-000000000201'),
 ('48600000-0000-4000-8000-000000000203','48600000-0000-4000-8000-000000000002','Synthetic Foreign','2026-11-03','producao_propria',NULL);
INSERT INTO public.event_forecasts(id,company_id,event_id,category_id,type,description,amount,baseline_amount,status,currency,iva_rate)
VALUES('48600000-0000-4000-8000-000000000301','48600000-0000-4000-8000-000000000001',
 '48600000-0000-4000-8000-000000000201','c0000034-0000-0000-0000-000000000001','expense','Digital fixture',100,100,'approved','EUR',0);
INSERT INTO public.transactions(id,company_id,event_id,forecast_id,category_id,type,description,amount,status,date,currency,iva_rate)
VALUES('48600000-0000-4000-8000-000000000401','48600000-0000-4000-8000-000000000001',
 '48600000-0000-4000-8000-000000000201','48600000-0000-4000-8000-000000000301',
 'c0000034-0000-0000-0000-000000000001','expense','Synthetic commitment',70,'pending','2026-11-01','EUR',0);
INSERT INTO public.ads_invoice(id,company_id,platform,invoice_number,currency,billing_period,issue_date,total_amount,lines_sum,source,file_path)
VALUES('48600000-0000-4000-8000-000000000501','48600000-0000-4000-8000-000000000001','meta','SYNTHETIC-486-A','EUR',
 '2026-11-01','2026-11-02',40,40,'pdf','48600000-0000-4000-8000-000000000001/meta/synthetic.pdf');
INSERT INTO public.ads_invoice_line(id,invoice_id,company_id,line_no,raw_description,campaign_name,amount,event_id,match_source,matched_by,matched_at) VALUES
 ('48600000-0000-4000-8000-000000000601','48600000-0000-4000-8000-000000000501','48600000-0000-4000-8000-000000000001',
  1,'Synthetic media A','campaign-A',20,'48600000-0000-4000-8000-000000000201','manual','48600000-0000-4000-8000-000000000101',now()),
 ('48600000-0000-4000-8000-000000000602','48600000-0000-4000-8000-000000000501','48600000-0000-4000-8000-000000000001',
  2,'Synthetic media B','campaign-B',20,'48600000-0000-4000-8000-000000000201','manual','48600000-0000-4000-8000-000000000101',now());
CREATE TEMP TABLE ads486_fixture(plan jsonb,header jsonb,lines jsonb);
INSERT INTO ads486_fixture VALUES (
 '{"version":1,"allocations":[
   {"key":"a","line_id":"48600000-0000-4000-8000-000000000601","destination":"event","event_id":"48600000-0000-4000-8000-000000000201","forecast_id":"48600000-0000-4000-8000-000000000301","amount":"20.00","observation":""},
   {"key":"b","line_id":"48600000-0000-4000-8000-000000000602","destination":"event","event_id":"48600000-0000-4000-8000-000000000201","forecast_id":"48600000-0000-4000-8000-000000000301","amount":"20.00","observation":""}],"new_forecasts":[],"budget_proposals":[]}',
 '{"company_id":"48600000-0000-4000-8000-000000000001","platform":"meta","invoice_number":"SYNTHETIC-486-A","currency":"EUR","billing_period":"2026-11-01","issue_date":"2026-11-02","total_amount":"40.00","lines_sum":"40.00","source":"pdf","source_ref":null,"file_path":"48600000-0000-4000-8000-000000000001/meta/synthetic.pdf"}',
 '[{"line_no":1,"raw_description":"Synthetic media A","campaign_name":"campaign-A","external_campaign_id":null,"placement":null,"amount":"20.00","is_adjustment":false},
   {"line_no":2,"raw_description":"Synthetic media B","campaign_name":"campaign-B","external_campaign_id":null,"placement":null,"amount":"20.00","is_adjustment":false}]');
GRANT SELECT ON ads486_fixture TO authenticated;
