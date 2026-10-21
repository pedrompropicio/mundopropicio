-- INERTE rollback retains registry/history; disables new callable checker only.
BEGIN;
SET LOCAL lock_timeout='5s';
REVOKE EXECUTE ON FUNCTION public.issue335_invariant_counts() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
