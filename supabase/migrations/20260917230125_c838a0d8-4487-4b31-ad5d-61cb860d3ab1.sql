ALTER TABLE public.backup_runs ADD COLUMN IF NOT EXISTS folder_path text NULL;

CREATE OR REPLACE FUNCTION public.backup_table_inventory()
RETURNS TABLE(schema_name text, tbl_name text, has_company_id boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    t.table_schema::text,
    t.table_name::text,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = t.table_schema
        AND c.table_name = t.table_name
        AND c.column_name = 'company_id'
    )
  FROM information_schema.tables t
  WHERE t.table_schema IN ('public', 'crm')
    AND t.table_type = 'BASE TABLE'
    AND t.table_name <> 'backup_runs'
  ORDER BY 1, 2
$$;

REVOKE ALL ON FUNCTION public.backup_table_inventory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backup_table_inventory() FROM anon;
REVOKE ALL ON FUNCTION public.backup_table_inventory() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.backup_table_inventory() TO service_role;

GRANT USAGE ON SCHEMA crm TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA crm TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm GRANT SELECT ON TABLES TO service_role;