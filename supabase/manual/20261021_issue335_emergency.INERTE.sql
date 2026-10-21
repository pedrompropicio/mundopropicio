-- LOCAL/INERTE level 2 exceptional stop, separate Sim required. ACLs unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(335,1);
UPDATE public.transaction_offset_control SET enabled=false,reverse_enabled=false WHERE singleton;
COMMIT;