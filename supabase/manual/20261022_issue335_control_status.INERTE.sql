-- #335 — leitura do controlo pelo ecrã: public.transaction_offset_control_status()
-- Já instalado em Live a 22/10/2026 com Sim do Pedro; mantido para registo.
-- Expõe só (enabled, reverse_enabled). Tabela, políticas, núcleo e scripts
-- kill_switch/reactivation inalterados. Rollback: ficheiro .ROLLBACK-INERTE.sql
-- (DROP FUNCTION; o botão volta a falhar fechado).
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF to_regclass('public.transaction_offset_control') IS NULL THEN
    RAISE EXCEPTION 'installation_order: storage_required';
  END IF;
  IF to_regprocedure('public.transaction_offset_control_status()') IS NOT NULL THEN
    RAISE EXCEPTION 'control_status_exists_requires_review';
  END IF;
END
$guard$;

CREATE FUNCTION public.transaction_offset_control_status()
RETURNS TABLE(enabled boolean, reverse_enabled boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
  SELECT c.enabled, c.reverse_enabled
  FROM public.transaction_offset_control c
  WHERE c.singleton
$fn$;

REVOKE ALL ON FUNCTION public.transaction_offset_control_status() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transaction_offset_control_status() TO authenticated, service_role;

COMMIT;
