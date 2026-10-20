-- #333 fase12d rollback INERTE. Recusa se houver revisões/autorizações (retenção; sem CASCADE, sem TRUNCATE).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $r$ BEGIN
  IF EXISTS (SELECT 1 FROM public.data_entry_assistant_reviews_333) OR EXISTS (SELECT 1 FROM public.data_entry_assistant_review_versions_333)
     OR EXISTS (SELECT 1 FROM public.data_entry_assistant_authorizations_333)
  THEN RAISE EXCEPTION 'reviews_present_retain_before_rollback'; END IF;
END $r$;
DROP FUNCTION public.data_entry_assistant_review_333(text,uuid,uuid,uuid,integer,text,jsonb,text[],uuid);
DROP TABLE public.data_entry_assistant_authorizations_333;
DROP TABLE public.data_entry_assistant_review_versions_333;
DROP TABLE public.data_entry_assistant_reviews_333;
DROP TABLE public.data_entry_assistant_review_settings_333;
DROP TABLE public.data_entry_assistant_scope_333;
DROP FUNCTION public._de333_immutable();
DROP FUNCTION public._de333_canon(jsonb);
COMMIT;
