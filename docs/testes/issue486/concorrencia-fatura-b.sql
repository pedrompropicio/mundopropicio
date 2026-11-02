-- PREPARADO / NÃO EXECUTADO. Terminal B independente, A parado na barreira.
\set ON_ERROR_STOP on
BEGIN;
SET SESSION AUTHORIZATION authenticated;
SET LOCAL application_name = 'issue486-session-b';
SELECT set_config('request.jwt.claim.sub','48600000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claims','{"sub":"48600000-0000-4000-8000-000000000101","role":"authenticated"}',true);
DO $$ DECLARE p jsonb; BEGIN
  ASSERT current_user = 'authenticated' AND session_user = 'authenticated';
  SELECT generation_plan INTO p FROM public.ads_invoice WHERE id = '48600000-0000-4000-8000-000000000501';
  BEGIN
    PERFORM public.ads_invoice_generation_v1('48600000-0000-4000-8000-000000000501','save_plan',jsonb_build_object('expected_revision',1,'plan',p));
    RAISE EXCEPTION 'lost_update';
  EXCEPTION WHEN SQLSTATE 'P0409' THEN ASSERT SQLERRM = 'revision_conflict'; END;
  ASSERT (SELECT generation_revision FROM public.ads_invoice WHERE id = '48600000-0000-4000-8000-000000000501') = 2,'one_winner';
END $$;
ROLLBACK;
RESET SESSION AUTHORIZATION;
