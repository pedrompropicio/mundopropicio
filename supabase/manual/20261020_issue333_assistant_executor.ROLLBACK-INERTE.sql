-- #333 fase12e rollback INERTE. Recusa se houver execuções (retenção; sem CASCADE, sem TRUNCATE).
-- Não desfaz efeitos financeiros já conferidos: esses revertem-se pelos fluxos canónicos (estorno), nunca por DROP.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $r$ BEGIN
  IF EXISTS (SELECT 1 FROM public.data_entry_assistant_executions_333) THEN RAISE EXCEPTION 'executions_present_retain_before_rollback'; END IF;
END $r$;
DROP FUNCTION public.data_entry_assistant_execute_333(text,uuid,text);
DROP TABLE public.data_entry_assistant_executions_333;
DROP TABLE public.data_entry_assistant_executor_settings_333;
COMMIT;
