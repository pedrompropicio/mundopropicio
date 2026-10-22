-- LOCAL/INERTE ONLY. Level 1: stop new encounters, retain reversal and exact ACLs.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(335,1);
UPDATE public.transaction_offset_control SET enabled=false WHERE singleton;
-- No ACL changes: checks in the scoped core give encontro_desativado, not a view privilege error.
-- reconcile_bank_line legacy EXECUTE remains byte-for-byte at its captured ACL.
-- Reverse remains enabled. All admitted operations drain before this transition commits.
COMMIT;