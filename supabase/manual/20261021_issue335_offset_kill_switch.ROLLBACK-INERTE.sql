-- LOCAL/INERTE ONLY. Reopening requires separate technical and Pedro approval.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(335,1);
UPDATE public.transaction_offset_control SET enabled=true WHERE singleton;
-- Exact ACL preservation: closure never changes any GRANT; reactivation adds none.
COMMIT;