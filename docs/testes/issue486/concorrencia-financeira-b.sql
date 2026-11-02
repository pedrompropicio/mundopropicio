-- C2/P9: iniciar enquanto A mantém INSERT de empresa B não confirmado.
\if :{?noninterference}
\if :noninterference
\set ON_ERROR_STOP on
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',false);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',false);
BEGIN;
DO $$ DECLARE x jsonb; BEGIN
 ASSERT session_user='authenticated' AND current_user='authenticated';
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','operation');
 ASSERT x->>'invoice_id'='48600000-0000-4000-8000-000000000501','operation_without_financial_fence';
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','preview');
 ASSERT x#>>'{totals,children}'='20.00','preview_without_financial_fence';
 ASSERT NOT EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND relation IN (
  'public.transactions'::regclass,'public.event_forecasts'::regclass,'public.companies'::regclass)
  AND mode<>'AccessShareLock'),'reads_only_access_share';
END $$;
SELECT pg_backend_pid(),session_user,current_user;
COMMIT;
RESET SESSION AUTHORIZATION;
\quit
\endif
\endif
-- C2: mesmas opções de A. B captura sempre EUR antes da escrita A.
\if :{?winner_rollback}
\else
\set winner_rollback false
\endif
\if :{?currency_race}
\else
\set currency_race false
\endif
-- P9 B, independent psql process, started BEFORE A. PREPARADO, NÃO EXECUTADO.
\set ON_ERROR_STOP on
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',false);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',false);
BEGIN;
CREATE TEMP TABLE race_request(request jsonb);
INSERT INTO race_request SELECT jsonb_build_object('request_key','48600000-0000-4000-8000-000000000712','expected_revision',1,
 'preview_hash',x->>'preview_hash','approvals','[]'::jsonb)
 FROM (SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','preview') x) q;
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','confirm',(SELECT request-ARRAY['request_key','approvals'] FROM race_request));
COMMIT;
SELECT pg_backend_pid(),session_user,current_user;
\prompt 'Controller: A generated and holds locks; release B now: ' release_b
BEGIN;
\if :currency_race
-- Generate espera o UPDATE companies; não pode gravar EUR para empresa BRL.
-- SET LOCAL transporta só parâmetros de ensaio, nunca contexto de autorização.
SELECT set_config('issue486.winner_rollback',:'winner_rollback',true);
DO $$ DECLARE r jsonb; x jsonb; failed boolean:=false; before_count bigint; BEGIN
 SELECT request INTO r FROM race_request;
 SELECT count(*) INTO before_count FROM public.transactions WHERE invoice_ref='SYNTHETIC-486-B';
 IF current_setting('issue486.winner_rollback')::boolean THEN
  x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','generate',r);
  ASSERT x->'already'='false'::jsonb,'rollback_currency_keeps_eur_generation';
 ELSE
  BEGIN PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','generate',r);
  EXCEPTION WHEN SQLSTATE 'P0409' THEN ASSERT SQLERRM='preview_stale';failed:=true; END;
  ASSERT failed,'concurrent_brl_must_refuse';
  ASSERT before_count=(SELECT count(*) FROM public.transactions WHERE invoice_ref='SYNTHETIC-486-B'),'currency_race_no_cost';
  x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','preview');
  ASSERT EXISTS(SELECT 1 FROM jsonb_array_elements(x->'blockers') b WHERE b->>'code'='currency_unrepresentable'),'concurrent_brl_blocker';
 END IF;
END $$;
COMMIT;
RESET SESSION AUTHORIZATION;
\quit
\endif
\if :winner_rollback
DO $$ DECLARE x jsonb; BEGIN
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','generate',(SELECT request FROM race_request));
 ASSERT x->'already'='false'::jsonb AND x#>'{operation,result_snapshot,effects}'='[]'::jsonb,'winner_rollback_no_raise';
 ASSERT (SELECT amount=100 AND baseline_amount=100 FROM public.event_forecasts WHERE id='48600000-0000-4000-8000-000000000301'),'rollback_preserves_headroom';
END $$;
COMMIT;
RESET SESSION AUTHORIZATION;
\quit
\endif
DO $$ DECLARE x jsonb; r jsonb; before_count bigint; BEGIN
 SELECT request INTO r FROM race_request;
 SELECT count(*) INTO before_count FROM public.transactions WHERE invoice_ref='SYNTHETIC-486-B';
 BEGIN PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','generate',r);RAISE EXCEPTION 'stale_preview_spent_budget';
 EXCEPTION WHEN SQLSTATE 'P0409' THEN ASSERT SQLERRM='preview_stale'; END;
 ASSERT before_count=(SELECT count(*) FROM public.transactions WHERE invoice_ref='SYNTHETIC-486-B'),'stale_zero_write';
 x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','preview');
 ASSERT x#>>'{effects,0,delta}'='10.00' AND jsonb_array_length(x->'effects')=1,'serialized_100_70_20_20';
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','confirm',jsonb_build_object('expected_revision',1,'preview_hash',x->>'preview_hash'));
 r:=jsonb_set(r,'{preview_hash}',x->'preview_hash');
 BEGIN PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','generate',r);RAISE EXCEPTION 'missing_acceptance_succeeded';
 EXCEPTION WHEN SQLSTATE 'P0422' THEN ASSERT SQLERRM='approval_required'; END;
 r:=jsonb_set(r,'{approvals}',jsonb_build_array(jsonb_build_object('effect_id',x#>>'{effects,0,effect_id}','accepted',true,'observation','Aumento 10 aceite em B')));
 PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000502','generate',r);
 ASSERT (SELECT amount=110 AND baseline_amount=100 FROM public.event_forecasts WHERE id='48600000-0000-4000-8000-000000000301'),'single_raise_after_wait';
END $$;
COMMIT;
RESET SESSION AUTHORIZATION;
