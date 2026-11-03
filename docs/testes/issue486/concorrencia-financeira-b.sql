-- C3-P9: sessão/PID independente; nunca capturar prévia depois do writer.
\if :{?c3_case}
\set ON_ERROR_STOP on
\if :{?winner_rollback}
\else
\set winner_rollback false
\endif
BEGIN;
SET LOCAL application_name='issue486-c3-b';
SELECT set_config('issue486.c3_case',:'c3_case',true);
SELECT set_config('issue486.winner_rollback',:'winner_rollback',true);
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT pg_backend_pid(),session_user,current_user;
DO $$ DECLARE mode text:=current_setting('issue486.c3_case'); rolled boolean:=current_setting('issue486.winner_rollback')::boolean;
 id_b uuid:='48600000-0000-4000-8000-000000000502'; req jsonb; x jsonb; before_state jsonb; fail boolean:=false; expected_message text; BEGIN
 ASSERT session_user='authenticated' AND current_user='authenticated','race_b_actor';
 IF mode LIKE 'legacy_%' THEN
  req:=jsonb_build_object('expected_revision',0,'plan',(SELECT plan FROM issue486_test.state WHERE invoice_id='48600000-0000-4000-8000-000000000501'));
  IF mode='legacy_bp_update' OR rolled THEN
   x:=public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',req);
   ASSERT x->>'revision'='1','conversion_after_writer';
   ASSERT EXISTS(SELECT 1 FROM public.event_forecasts WHERE id='48600000-0000-4000-8000-000000000301'
    AND (transaction_id IS NULL)= (mode='legacy_bp_update' AND NOT rolled)),'conversion_preserves_committed_anchor_state';
  ELSE
   expected_message:=CASE WHEN mode='legacy_parent' THEN 'duplicate_invoice' ELSE 'invalid_plan' END;
   BEGIN PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',req);
   EXCEPTION WHEN SQLSTATE 'P0409' OR SQLSTATE 'P0422' THEN ASSERT SQLERRM=expected_message;fail:=true; END;
   ASSERT fail,'conversion_revalidates_written_v0';
   PERFORM issue486_test.expect(format('SELECT public.ads_invoice_generation_v1(%L,''save_plan'',%L::jsonb)',
    '48600000-0000-4000-8000-000000000501',req),CASE WHEN mode='legacy_parent' THEN 'P0409' ELSE 'P0422' END,expected_message);
   ASSERT (SELECT generation_revision=0 AND generation_plan IS NULL FROM public.ads_invoice
    WHERE id='48600000-0000-4000-8000-000000000501'),'refused_conversion_still_v0';
  END IF;
  ASSERT NOT EXISTS(SELECT 1 FROM public.ads_invoice_generation_operation),'legacy_no_partial_operation';
  ASSERT (SELECT count(*) FROM public.transactions WHERE invoice_ref='SYNTHETIC-486-A')=
   CASE WHEN mode='legacy_parent' AND NOT rolled THEN 1 ELSE 0 END,'no_added_or_deleted_legacy_mother';
  ASSERT (SELECT count(*) FROM public.ads_invoice_line WHERE invoice_id='48600000-0000-4000-8000-000000000501')=
   CASE WHEN mode='legacy_lines_delete' AND NOT rolled THEN 0 ELSE 1 END,'no_lost_source_rows';
  RETURN;
 END IF;
 IF mode IN ('same_key','different_key') THEN
  id_b:='48600000-0000-4000-8000-000000000501';
  SELECT request INTO req FROM issue486_test.state WHERE invoice_id=id_b;
  IF mode='different_key' THEN req:=jsonb_set(req,'{request_key}','"48600000-0000-4000-8000-000000000799"'); END IF;
  x:=public.ads_invoice_generation_v1(id_b,'generate',req);
  ASSERT x->'already'=to_jsonb(NOT rolled),'same_invoice_winner_outcome';
  ASSERT (SELECT count(*) FROM public.transactions WHERE invoice_ref='SYNTHETIC-486-A')=2,'same_invoice_one_group';
  ASSERT (SELECT count(*) FROM public.transactions WHERE invoice_ref='SYNTHETIC-486-B')=0,'other_invoice_untouched';
  before_state:=issue486_test.digest();
  ASSERT public.ads_invoice_generation_v1(id_b,'generate',req)->'operation'=x->'operation','same_invoice_stable_ids';
  ASSERT before_state=issue486_test.digest(),'same_invoice_retry_no_effects';
  RETURN;
 END IF;
 SELECT request INTO req FROM issue486_test.state WHERE invoice_id=id_b;
 IF mode='closed' THEN
  before_state:=issue486_test.digest();
  PERFORM issue486_test.expect(format('SELECT public.ads_invoice_generation_v1(%L,''generate'',%L::jsonb)',id_b,req),'0A000','feature_disabled');
  PERFORM public.ads_invoice_generation_v1(id_b,'operation');
  PERFORM public.ads_invoice_generation_v1(id_b,'preview');
  ASSERT before_state=issue486_test.digest(),'closed_all_effects_absent';
  ASSERT NOT EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid() AND relation IN ('public.transactions'::regclass,
   'public.event_forecasts'::regclass,'public.companies'::regclass) AND mode<>'AccessShareLock'),'closed_no_financial_fence';
  RETURN;
 END IF;
 IF NOT rolled THEN
  BEGIN PERFORM public.ads_invoice_generation_v1(id_b,'generate',req);
  EXCEPTION WHEN SQLSTATE 'P0409' THEN ASSERT SQLERRM='preview_stale';fail:=true; END;
  ASSERT fail,'writer_commit_requires_new_preview';
  -- Repetição da recusa já após a espera: fotografia integral, sem depender
  -- de contagens globais que mudaram legitimamente com o commit de A.
  PERFORM issue486_test.expect(format('SELECT public.ads_invoice_generation_v1(%L,''generate'',%L::jsonb)',id_b,req),'P0409','preview_stale');
  ASSERT NOT EXISTS(SELECT 1 FROM public.transactions WHERE invoice_ref='SYNTHETIC-486-B'),'stale_no_b_finance';
  x:=public.ads_invoice_generation_v1(id_b,'preview');
  PERFORM public.ads_invoice_generation_v1(id_b,'confirm',jsonb_build_object('expected_revision',1,'preview_hash',x->>'preview_hash'));
  req:=jsonb_set(req,'{preview_hash}',x->'preview_hash');
 END IF;
 x:=public.ads_invoice_generation_v1(id_b,'generate',req);
 ASSERT x->'already'='false'::jsonb,'exactly_one_b_operation';
 IF mode='different_bp' THEN
  ASSERT x#>>'{operation,result_snapshot,children,0,forecast_id}'='48600000-0000-4000-8000-000000000302','distinct_bp_preserved';
  ASSERT x#>'{operation,result_snapshot,effects}'='[]'::jsonb,'no_reselection_or_extra_raise';
 ELSIF mode='create' THEN
  ASSERT x#>>'{operation,result_snapshot,effects,0,kind}'='create','concurrent_create_not_reused';
  ASSERT (SELECT count(*) FROM public.event_forecasts WHERE version_id IS NULL AND status='approved')=
   CASE WHEN rolled THEN 2 ELSE 3 END,'one_new_bp_per_committed_purpose';
  ASSERT (SELECT count(DISTINCT e->>'forecast_id') FROM public.ads_invoice_generation_operation o
   CROSS JOIN LATERAL jsonb_array_elements(o.result_snapshot->'effects') e WHERE e->>'kind'='create')=
   CASE WHEN rolled THEN 1 ELSE 2 END,'created_ids_distinct';
 ELSIF mode='commitment_update' THEN
  ASSERT (SELECT amount FROM public.transactions WHERE id='48600000-0000-4000-8000-000000000401')=
   CASE WHEN rolled THEN 70 ELSE 80 END,'updated_commitment_revalidated';
 ELSE
  ASSERT EXISTS(SELECT 1 FROM public.transactions WHERE id='48600000-0000-4000-8000-000000000401')=rolled,'deleted_commitment_revalidated';
 END IF;
 before_state:=issue486_test.digest();
 ASSERT public.ads_invoice_generation_v1(id_b,'generate',req)->'operation'=x->'operation','race_retry_same_ids';
 ASSERT before_state=issue486_test.digest(),'race_retry_no_effects';
END $$;
COMMIT;
RESET SESSION AUTHORIZATION;
\quit
\endif

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
