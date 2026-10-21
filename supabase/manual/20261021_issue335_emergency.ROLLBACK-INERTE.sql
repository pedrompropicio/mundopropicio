-- LOCAL/INERTE: return to level 1 (new admissions still closed), separate Sim required.
BEGIN;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(335,1);
UPDATE public.transaction_offset_control SET enabled=false,reverse_enabled=true WHERE singleton;
COMMIT;