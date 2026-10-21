-- LOCAL/INERTE: explicit reactivation after review. Existing ACLs never rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(335,1);
UPDATE public.transaction_offset_control SET enabled=true,reverse_enabled=true WHERE singleton;
COMMIT;