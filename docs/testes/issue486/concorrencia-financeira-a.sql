\if :{?winner_rollback}
\else
\set winner_rollback false
\endif
-- C3-P9: iniciar B só depois da barreira A; pedidos já confirmados no setup.
\if :{?c3_case}
\set ON_ERROR_STOP on
\if :{?winner_rollback}
\else
\set winner_rollback false
\endif
BEGIN;
SET LOCAL application_name='issue486-c3-a';
SELECT set_config('issue486.c3_case',:'c3_case',true);
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ DECLARE mode text:=current_setting('issue486.c3_case'); x jsonb; n int; BEGIN
 ASSERT session_user='authenticated' AND current_user='authenticated','race_a_actor';
 CASE mode
 WHEN 'same_key','different_key','different_bp','create' THEN
  x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','generate',
   (SELECT request FROM issue486_test.state WHERE invoice_id='48600000-0000-4000-8000-000000000501'));
  UPDATE issue486_test.state SET result=x WHERE invoice_id='48600000-0000-4000-8000-000000000501';
 WHEN 'commitment_update' THEN
  UPDATE public.transactions SET amount=80 WHERE id='48600000-0000-4000-8000-000000000401';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=1,'writer_already_inside_update';
 WHEN 'commitment_delete' THEN
  DELETE FROM public.transactions WHERE id='48600000-0000-4000-8000-000000000401';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=1,'writer_already_inside_delete';
 WHEN 'legacy_parent' THEN
  INSERT INTO public.transactions(company_id,type,category_id,description,amount,date,invoice_ref)
   VALUES('48600000-0000-4000-8000-000000000001','expense','c0000034-0000-0000-0000-000000000001',
    'Synthetic already written v0 mother',20,'2026-11-02','SYNTHETIC-486-A');
 WHEN 'legacy_lines_delete' THEN
  DELETE FROM public.ads_invoice_line WHERE id='48600000-0000-4000-8000-000000000601';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=1,'legacy_already_inside_line_delete';
 WHEN 'legacy_bp_update' THEN
  ASSERT EXISTS(SELECT 1 FROM public.event_forecasts WHERE id='48600000-0000-4000-8000-000000000301' AND transaction_id IS NOT NULL),'real_anchor_before_update';
  UPDATE public.event_forecasts SET transaction_id=NULL WHERE id='48600000-0000-4000-8000-000000000301';
  GET DIAGNOSTICS n=ROW_COUNT; ASSERT n=1,'legacy_already_inside_bp_update';
 WHEN 'closed' THEN
  -- A fica com um writer de outra empresa. B deve acabar ANTES de o soltar.
  PERFORM set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000102',true);
  PERFORM set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000102","role":"authenticated"}',true);
  INSERT INTO public.transactions(company_id,event_id,type,description,amount,status,date)
   VALUES('48600000-0000-4000-8000-000000000002','48600000-0000-4000-8000-000000000203','expense','Closed-control writer',1,'pending','2026-11-02');
 ELSE RAISE EXCEPTION 'unknown_race_case'; END CASE;
END $$;
SELECT pg_backend_pid(),session_user,current_user;
\prompt 'Controller: capture B wait (closed: B must finish); release A within deadline: ' release_c3_a
\if :winner_rollback
ROLLBACK;
\else
COMMIT;
\endif
RESET SESSION AUTHORIZATION;
\quit
\endif

-- C2/P9: -v noninterference=true, com A aberto e B apenas a ler.
\if :{?noninterference}
\if :noninterference
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.transactions(company_id,event_id,type,description,amount,status,date)
VALUES('48600000-0000-4000-8000-000000000002','48600000-0000-4000-8000-000000000203','expense','Unrelated tenant writer',1,'pending','2026-11-02');
SELECT pg_backend_pid(),session_user,current_user;
\prompt 'Controller: retain A until B finished both reads and lock assertions: ' release_unrelated
\if :winner_rollback
ROLLBACK;
\else
COMMIT;
\endif
\quit
\endif
\endif
-- C2: -v currency_race=true executa o writer empresarial em A.
-- -v winner_rollback=true escolhe a variante de rollback do vencedor.
\if :{?winner_rollback}
\else
\set winner_rollback false
\endif
\if :{?currency_race}
\if :currency_race
\set ON_ERROR_STOP on
BEGIN;
UPDATE public.companies SET currency='BRL' WHERE id='48600000-0000-4000-8000-000000000001';
SELECT pg_backend_pid(),session_user,current_user;
\prompt 'B captured/confirmed EUR first; release A after controller observes B waiting: ' release_currency
\if :winner_rollback
ROLLBACK;
\else
COMMIT;
\endif
\quit
\endif
\endif
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
\if :winner_rollback
ROLLBACK;
\else
COMMIT;
\endif
RESET SESSION AUTHORIZATION;
