CREATE OR REPLACE FUNCTION public.backup_table_inventory()
 RETURNS TABLE(schema_name text, tbl_name text, has_company_id boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT
    n.nspname::text,
    c.relname::text,
    EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attname = 'company_id' AND a.attnum > 0 AND NOT a.attisdropped
    )
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'crm')
    AND c.relkind IN ('r', 'p')          -- tabelas e tabelas particionadas (a mãe)
    AND NOT c.relispartition             -- as partições-filhas não são alvo próprio
    AND c.relname <> 'backup_runs'
  ORDER BY 1, 2
$function$;

REVOKE EXECUTE ON FUNCTION public.backup_table_inventory() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.backup_table_inventory() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_table_inventory() TO service_role;