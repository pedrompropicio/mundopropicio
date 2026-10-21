-- LOCAL/INERTE ONLY. Emergency closure; separate authorization required for Live.
BEGIN;
SET LOCAL lock_timeout='5s';
UPDATE public.transaction_offset_control SET enabled=false WHERE singleton;
REVOKE EXECUTE ON FUNCTION public.transaction_offset_execute(uuid,uuid,jsonb,jsonb,date,text),public.transaction_offset_reverse(uuid,uuid,text) FROM authenticated,service_role;
REVOKE INSERT ON public.issue335_commands FROM authenticated,service_role;
-- reconcile_bank_line legacy EXECUTE remains byte-for-byte at its captured ACL.
-- Offset dispatch cannot run: view INSERT is revoked and execute flag is false.
COMMIT;