-- #333 fase12c rollback INERTE. Recusa se houver revisões/autorizações (retenção; sem CASCADE).
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $r$ BEGIN
  IF EXISTS (SELECT 1 FROM public.data_entry_assistant_reviews_333) OR EXISTS (SELECT 1 FROM public.data_entry_assistant_authorizations_333)
  THEN RAISE EXCEPTION 'reviews_present_retain_before_rollback'; END IF;
END $r$;
DROP FUNCTION public.data_entry_assistant_review_333(text,uuid,integer,text,jsonb,text[],uuid);
DROP TABLE public.data_entry_assistant_authorizations_333;
DROP TABLE public.data_entry_assistant_review_versions_333;
DROP TABLE public.data_entry_assistant_reviews_333;
DROP TABLE public.data_entry_assistant_review_settings_333;
COMMIT;
