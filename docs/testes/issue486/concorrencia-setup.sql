-- PREPARADO / NÃO EXECUTADO. Apenas base descartável issue486_synthetic.
-- Este setup faz COMMIT somente numa futura execução expressamente autorizada.
\set ON_ERROR_STOP on
BEGIN;
\ir fixture.sql
SET SESSION AUTHORIZATION authenticated;
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SELECT public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',
 jsonb_build_object('expected_revision',0,'plan',(SELECT plan FROM ads486_fixture)));
RESET SESSION AUTHORIZATION;
COMMIT;
-- Não limpar com DELETE/CASCADE: destruir apenas o contentor descartável depois
-- de conservar as transcrições e receber a autorização própria do ensaio.
