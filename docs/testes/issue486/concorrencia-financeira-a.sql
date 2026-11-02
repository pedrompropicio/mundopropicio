-- C2/P9: -v noninterference=true, com A aberto e B apenas a ler.
\if :{?noninterference}
\if :noninterference
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.transactions(company_id,event_id,type,description,amount,status,date)
VALUES('48600000-0000-4000-8000-000000000002','48600000-0000-4000-8000-000000000203','expense','Unrelated tenant writer',1,'pending','2026-11-02');
SELECT pg_backend_pid(),session_user,current_user;
\prompt 'Controller: retain A until B finished both reads and lock assertions: ' release_unrelated
ROLLBACK;
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
