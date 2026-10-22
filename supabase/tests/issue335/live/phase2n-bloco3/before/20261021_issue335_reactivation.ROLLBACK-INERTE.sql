-- LOCAL/INERTE: undo reactivation to emergency level 2, preserve all GRANTs and history.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(335,1);
UPDATE public.transaction_offset_control SET enabled=false,reverse_enabled=false WHERE singleton;
COMMIT;