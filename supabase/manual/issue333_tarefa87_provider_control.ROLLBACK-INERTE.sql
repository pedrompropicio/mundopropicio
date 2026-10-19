-- LOCAL REVIEW ONLY. Do not apply to Cloud. No CASCADE or legacy objects.
BEGIN;
-- Keep the lock until rollback completes; an in-flight/uncertain claim blocks removal.
DO $$ BEGIN
 PERFORM 1 FROM public.data_entry_analysis_control_333 WHERE singleton FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.data_entry_analysis_control_333 WHERE active_claim IS NOT NULL) THEN RAISE EXCEPTION 'confer_claim_before_rollback'; END IF;
END $$;
UPDATE public.data_entry_analysis_control_333 SET enabled=false,reviewed=false,state='closed',revision=revision+1;
DROP FUNCTION public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer);
DROP TABLE public.data_entry_analysis_audit_333;
DROP TABLE public.data_entry_analysis_control_333;
COMMIT;