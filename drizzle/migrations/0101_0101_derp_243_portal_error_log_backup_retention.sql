-- D-ERP243 / #252: portal_error_log fora do backup + função de retenção 90 dias.
INSERT INTO public.backup_excluded_tables (schema_name, table_name, reason)
VALUES ('public','portal_error_log','Registo de erros de front anónimo do portal. Diagnóstico sem valor histórico; retenção 90 dias (purge_portal_error_log).')
ON CONFLICT (schema_name, table_name) DO NOTHING;

UPDATE public.system_invariants SET reference_count = 2
 WHERE name = 'backup_tabelas_excluidas' AND reference_count = 1;

CREATE OR REPLACE FUNCTION public.purge_portal_error_log(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF p_days IS NULL OR p_days < 30 THEN
    RAISE EXCEPTION 'Retenção mínima de 30 dias.';
  END IF;
  DELETE FROM public.portal_error_log WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_portal_error_log(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_portal_error_log(integer) TO service_role;