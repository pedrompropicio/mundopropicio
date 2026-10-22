-- INERTE / LOCAL ONLY. Removes only this fresh, separately authorized candidate.
-- Ordem de instalação única (correcção D, docs/testes/issue335-quadro-final.md): storage → core → approval → status → invariants → balance → cash_position → cash_position_invariant → restore → kill_switch/emergency/reactivation → trigger_watch/cash_watch; ROLLBACK na ordem inversa.
BEGIN;
SET LOCAL lock_timeout='5s';
DROP FUNCTION public.issue335_trigger_watch();
COMMIT;
