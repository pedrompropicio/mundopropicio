-- Ligações de PERTENÇA filho→pai, derivadas de pg_constraint.
-- Só FKs de uma coluna que apontam ao `id` do pai. Quando um filho tem mais do
-- que uma FK para o MESMO pai, segue-se apenas a coluna de pertença
-- (<pai singular>_id); as outras ficam marcadas como ambíguas e não são seguidas
-- — sem isto, event_simulator_config.sales_curve_prior_event_id arrastava para o
-- âmbito de um evento as configurações de OUTROS eventos.
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
           count(*) OVER (PARTITION BY r.child_key, r.parent_key) AS n_fks,
           regexp_replace(r.p_tbl, 's$', '') || '_id' AS owning_col
    FROM raw r
  )
  SELECT child_key, c_sch, c_tbl, parent_key, child_col,
         (n_fks > 1 AND child_col <> owning_col) AS ambiguous
  FROM marked;
$function$;

REVOKE ALL ON FUNCTION public.restore_fk_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_fk_links() FROM anon;
REVOKE ALL ON FUNCTION public.restore_fk_links() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_fk_links() TO service_role;

CREATE OR REPLACE FUNCTION public.restore_scope_links(p_tables text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'child', l.child_key, 'parent', l.parent_key, 'child_col', l.child_col)), '[]'::jsonb)
  FROM public.restore_fk_links() l
  WHERE NOT l.ambiguous
    AND l.child_key = ANY (p_tables)
    AND l.parent_key = ANY (p_tables);
$function$;

REVOKE ALL ON FUNCTION public.restore_scope_links(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_scope_links(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.restore_scope_links(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_scope_links(text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_event_scope(p_event_ids uuid[], p_roots text[] DEFAULT NULL)
RETURNS TABLE(sch text, tbl text, tbl_key text, row_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fk record; v_n bigint; v_total bigint; v_round int := 0; v_keep text[]; v_prev int;
BEGIN
  IF p_event_ids IS NULL OR array_length(p_event_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'restore_event_scope: p_event_ids vazio';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _restore_scope (
    sch text, tbl text, key text, id uuid, PRIMARY KEY (key, id)
  ) ON COMMIT DROP;
  DELETE FROM _restore_scope WHERE true;

  CREATE TEMP TABLE IF NOT EXISTS _restore_allowed (key text PRIMARY KEY, sch text, tbl text)
    ON COMMIT DROP;
  DELETE FROM _restore_allowed WHERE true;

  INSERT INTO _restore_allowed (key, sch, tbl)
  SELECT CASE WHEN i.schema_name = 'crm' THEN 'crm.' || i.tbl_name ELSE i.tbl_name END,
         i.schema_name, i.tbl_name
  FROM public.backup_table_inventory() i
  WHERE NOT EXISTS (
          SELECT 1 FROM public.backup_excluded_tables x WHERE x.table_name = i.tbl_name)
    AND EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = i.schema_name AND c.table_name = i.tbl_name
            AND c.column_name = 'id' AND c.data_type = 'uuid');

  INSERT INTO _restore_scope (sch, tbl, key, id)
  SELECT 'public', 'events', 'events', e.id FROM public.events e WHERE e.id = ANY (p_event_ids)
  ON CONFLICT DO NOTHING;

  FOR fk IN
    SELECT a.key, a.sch, a.tbl FROM _restore_allowed a
    WHERE a.key <> 'events'
      AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = a.sch AND c.table_name = a.tbl
                    AND c.column_name = 'event_id' AND c.data_type = 'uuid')
  LOOP
    EXECUTE format(
      'INSERT INTO _restore_scope (sch, tbl, key, id)
         SELECT %L, %L, %L, t.id FROM %I.%I t WHERE t.event_id = ANY ($1)
         ON CONFLICT DO NOTHING',
      fk.sch, fk.tbl, fk.key, fk.sch, fk.tbl) USING p_event_ids;
  END LOOP;

  LOOP
    v_round := v_round + 1;
    EXIT WHEN v_round > 30;
    v_total := 0;
    FOR fk IN
      SELECT DISTINCT l.child_key, l.c_sch, l.c_tbl, l.parent_key, l.child_col
      FROM public.restore_fk_links() l
      WHERE NOT l.ambiguous
    LOOP
      IF NOT EXISTS (SELECT 1 FROM _restore_allowed WHERE key = fk.child_key) THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM _restore_scope WHERE key = fk.parent_key) THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = fk.c_sch AND table_name = fk.c_tbl
                       AND column_name = fk.child_col AND data_type = 'uuid') THEN CONTINUE; END IF;
      EXECUTE format(
        'INSERT INTO _restore_scope (sch, tbl, key, id)
           SELECT %L, %L, %L, t.id FROM %I.%I t
           WHERE t.%I IN (SELECT s.id FROM _restore_scope s WHERE s.key = %L)
           ON CONFLICT DO NOTHING',
        fk.c_sch, fk.c_tbl, fk.child_key, fk.c_sch, fk.c_tbl, fk.child_col, fk.parent_key);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_total := v_total + v_n;
    END LOOP;
    EXIT WHEN v_total = 0;
  END LOOP;

  IF p_roots IS NOT NULL AND array_length(p_roots, 1) > 0 THEN
    v_keep := p_roots;
    LOOP
      v_prev := array_length(v_keep, 1);
      SELECT array_agg(DISTINCT x) INTO v_keep FROM (
        SELECT unnest(v_keep) AS x
        UNION
        SELECT DISTINCT l.child_key FROM public.restore_fk_links() l
        WHERE NOT l.ambiguous AND l.parent_key = ANY (v_keep)
      ) s;
      EXIT WHEN array_length(v_keep, 1) = v_prev;
    END LOOP;
    DELETE FROM _restore_scope WHERE NOT (key = ANY (v_keep));
  END IF;

  RETURN QUERY SELECT s.sch, s.tbl, s.key, s.id FROM _restore_scope s;
END $function$;

REVOKE ALL ON FUNCTION public.restore_event_scope(uuid[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_event_scope(uuid[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.restore_event_scope(uuid[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_event_scope(uuid[], text[]) TO service_role;

-- O âmbito passa a devolver também o universo de tabelas consideradas (para a
-- leitura do backup usar exactamente o mesmo) e as ligações ambíguas.
CREATE OR REPLACE FUNCTION public.restore_event_scope_json(p_event_ids uuid[], p_roots text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ids jsonb; v_counts jsonb; v_allowed jsonb; v_amb jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _restore_scope_out (key text, id uuid) ON COMMIT DROP;
  DELETE FROM _restore_scope_out WHERE true;
  INSERT INTO _restore_scope_out (key, id)
  SELECT s.tbl_key, s.row_id FROM public.restore_event_scope(p_event_ids, p_roots) s;

  SELECT COALESCE(jsonb_object_agg(key, ids), '{}'::jsonb) INTO v_ids
  FROM (SELECT key, jsonb_agg(id) AS ids FROM _restore_scope_out GROUP BY key) x;
  SELECT COALESCE(jsonb_object_agg(key, n), '{}'::jsonb) INTO v_counts
  FROM (SELECT key, count(*) AS n FROM _restore_scope_out GROUP BY key) y;

  SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb) INTO v_allowed
  FROM (
    SELECT CASE WHEN i.schema_name = 'crm' THEN 'crm.' || i.tbl_name ELSE i.tbl_name END AS k
    FROM public.backup_table_inventory() i
    WHERE NOT EXISTS (SELECT 1 FROM public.backup_excluded_tables x WHERE x.table_name = i.tbl_name)
      AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = i.schema_name AND c.table_name = i.tbl_name
                    AND c.column_name = 'id' AND c.data_type = 'uuid')
  ) z;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'child', l.child_key, 'parent', l.parent_key, 'child_col', l.child_col)), '[]'::jsonb)
    INTO v_amb
  FROM public.restore_fk_links() l WHERE l.ambiguous;

  RETURN jsonb_build_object('ids', v_ids, 'counts', v_counts,
                            'allowed', v_allowed, 'ambiguous_links', v_amb);
END $function$;

REVOKE ALL ON FUNCTION public.restore_event_scope_json(uuid[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_event_scope_json(uuid[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.restore_event_scope_json(uuid[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_event_scope_json(uuid[], text[]) TO service_role;