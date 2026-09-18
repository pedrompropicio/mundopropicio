CREATE OR REPLACE FUNCTION public.restore_fk_links()
RETURNS TABLE(child_key text, c_sch text, c_tbl text, parent_key text, child_col text, ambiguous boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH raw AS (
    SELECT
      CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END AS child_key,
      cn.nspname::text AS c_sch,
      cc.relname::text AS c_tbl,
      CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END AS parent_key,
      pc.relname::text AS p_tbl,
      (SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1])::text AS child_col
    FROM pg_constraint c
    JOIN pg_class cc ON cc.oid = c.conrelid
    JOIN pg_namespace cn ON cn.oid = cc.relnamespace
    JOIN pg_class pc ON pc.oid = c.confrelid
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace
    WHERE c.contype = 'f'
      AND c.conrelid <> c.confrelid
      AND array_length(c.conkey, 1) = 1
      AND cn.nspname IN ('public','crm') AND pn.nspname IN ('public','crm')
      AND (SELECT a.attname FROM pg_attribute a
            WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[1]) = 'id'
  ), marked AS (
    SELECT r.*,
           regexp_replace(r.p_tbl, 's$', '') || '_id' AS owning_col,
           count(*) OVER (PARTITION BY r.child_key, r.parent_key) AS n_fks,
           bool_or(r.child_col = regexp_replace(r.p_tbl, 's$', '') || '_id')
             OVER (PARTITION BY r.child_key, r.parent_key) AS has_owning
    FROM raw r
  )
  -- Ambígua (= não seguir) só quando existem VÁRIAS ligações ao mesmo pai E uma
  -- delas é a de pertença: as restantes são referências (ex.:
  -- event_simulator_config.sales_curve_prior_event_id, que é um evento anterior
  -- de comparação). Sem coluna de pertença, seguem-se todas (ex.:
  -- bank_statement_lines.matched_transaction_id / created_transaction_id).
  SELECT child_key, c_sch, c_tbl, parent_key, child_col,
         (n_fks > 1 AND has_owning AND child_col <> owning_col) AS ambiguous
  FROM marked;
$function$;

REVOKE ALL ON FUNCTION public.restore_fk_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_fk_links() FROM anon;
REVOKE ALL ON FUNCTION public.restore_fk_links() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_fk_links() TO service_role;