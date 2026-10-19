-- LOCAL REVIEW ONLY. Do not apply to Cloud. No CASCADE or legacy objects.
-- Retain audit in place, including all prior rows; no export assumption authorizes DROP.
BEGIN;
-- Keep the lock until rollback completes; an in-flight/uncertain claim blocks removal.
DO $$ BEGIN
 PERFORM 1 FROM public.data_entry_analysis_control_333 WHERE singleton FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.data_entry_analysis_control_333 WHERE active_claim IS NOT NULL) THEN RAISE EXCEPTION 'confer_claim_before_rollback'; END IF;
END $$;
WITH closed AS (
 UPDATE public.data_entry_analysis_control_333 SET enabled=false,reviewed=false,state='closed',revision=revision+1,reason_code='closed',upstream_status=NULL,changed_at=clock_timestamp()
 RETURNING revision,active_claim,stage
)
INSERT INTO public.data_entry_analysis_audit_333(revision,claim,stage,reason_code)
SELECT revision,active_claim,stage,'closed' FROM closed;
DROP FUNCTION public.data_entry_analysis_transition_333(text,uuid,bigint,text,integer);
DROP TABLE public.data_entry_analysis_control_333;
COMMENT ON TABLE public.data_entry_analysis_audit_333 IS 'Retained technical audit after inert provider-control rollback; do not drop as rollback cleanup.';
COMMIT;