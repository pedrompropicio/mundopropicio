-- INERTE / LOCAL ONLY. Removes only this fresh, separately authorized candidate.
BEGIN;
SET LOCAL lock_timeout='5s';
DROP FUNCTION public.issue335_trigger_watch();
COMMIT;
