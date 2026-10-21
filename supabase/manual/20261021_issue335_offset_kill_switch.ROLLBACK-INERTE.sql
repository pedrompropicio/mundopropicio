-- LOCAL/INERTE ONLY. Reopening requires separate technical and Pedro approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(335,1);
UPDATE public.transaction_offset_control SET enabled=true WHERE singleton;
GRANT EXECUTE ON FUNCTION public.transaction_offset_execute(uuid,uuid,jsonb,jsonb,date,text),public.transaction_offset_reverse(uuid,uuid,text) TO authenticated,service_role;
GRANT INSERT ON public.issue335_commands TO authenticated,service_role;
COMMIT;