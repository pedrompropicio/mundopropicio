CREATE OR REPLACE FUNCTION public.restore_apply_from_shadow(
  p_scope text,
  p_company_id uuid,
  p_tables text[],
  p_extra_deletes jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order text[]; v_all text[]; k text; r record; v_cols text[]; v_list text;
  v_inserted jsonb := '{}'::jsonb; v_deleted jsonb := '{}'::jsonb;
  v_n bigint; v_n2 bigint; i int; v_extra uuid[]; v_has_shadow boolean;
BEGIN
  IF p_scope NOT IN ('company','global','rows') THEN
    RAISE EXCEPTION 'restore_apply_from_shadow: p_scope tem de ser company, global ou rows';
  END IF;
  IF p_scope = 'company' AND p_company_id IS NULL THEN
    RAISE EXCEPTION 'restore_apply_from_shadow: p_company_id obrigatório em scope company';
  END IF;
  IF p_tables IS NULL OR array_length(p_tables, 1) IS NULL THEN
    RAISE EXCEPTION 'restore_apply_from_shadow: p_tables vazio';
  END IF;

  v_all := p_tables;
  IF p_extra_deletes IS NOT NULL AND jsonb_typeof(p_extra_deletes) = 'object'
     AND p_extra_deletes <> '{}'::jsonb THEN
    IF p_scope <> 'rows' THEN
      RAISE EXCEPTION 'restore_apply_from_shadow: p_extra_deletes só é válido em scope rows';
    END IF;
    FOR k IN SELECT jsonb_object_keys(p_extra_deletes) LOOP
      IF NOT (k = ANY (v_all)) THEN v_all := v_all || k; END IF;
    END LOOP;
  END IF;

  SET CONSTRAINTS ALL DEFERRED;
  v_order := public.restore_topo_order(v_all);

  FOREACH k IN ARRAY v_order LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    v_has_shadow := to_regclass('restore_shadow.' || quote_ident(r.shadow)) IS NOT NULL;
    IF k = ANY (p_tables) AND NOT v_has_shadow THEN
      RAISE EXCEPTION 'restore_apply_from_shadow: sombra inexistente para %', k;
    END IF;
    IF p_scope = 'rows' AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = r.sch AND table_name = r.tbl AND column_name = 'id') THEN
      RAISE EXCEPTION 'restore_apply_from_shadow: % não tem coluna id e o scope é rows', k;
    END IF;
    EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER USER', r.sch, r.tbl);
  END LOOP;

  FOR i IN REVERSE array_length(v_order, 1) .. 1 LOOP
    k := v_order[i];
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    v_n := 0;
    IF p_scope = 'company' THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = r.sch AND table_name = r.tbl AND column_name = 'company_id') THEN
        EXECUTE format('DELETE FROM %I.%I WHERE company_id = $1', r.sch, r.tbl) USING p_company_id;
      ELSE
        RAISE EXCEPTION 'restore_apply_from_shadow: % não tem company_id e o scope é company', k;
      END IF;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSIF p_scope = 'global' THEN
      EXECUTE format('DELETE FROM %I.%I WHERE true', r.sch, r.tbl);
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSE
      IF k = ANY (p_tables) THEN
        EXECUTE format(
          'DELETE FROM %I.%I t WHERE t.id IN (SELECT s.id FROM restore_shadow.%I s)',
          r.sch, r.tbl, r.shadow);
        GET DIAGNOSTICS v_n = ROW_COUNT;
      END IF;
      SELECT array_agg((e.value #>> '{}')::uuid) INTO v_extra
        FROM jsonb_array_elements(COALESCE(p_extra_deletes -> k, '[]'::jsonb)) e;
      IF v_extra IS NOT NULL AND array_length(v_extra, 1) > 0 THEN
        EXECUTE format('DELETE FROM %I.%I t WHERE t.id = ANY ($1)', r.sch, r.tbl) USING v_extra;
        GET DIAGNOSTICS v_n2 = ROW_COUNT;
        v_n := v_n + v_n2;
      END IF;
    END IF;
    v_deleted := v_deleted || jsonb_build_object(k, v_n);
  END LOOP;

  FOREACH k IN ARRAY v_order LOOP
    IF NOT (k = ANY (p_tables)) THEN CONTINUE; END IF;
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    SELECT array_agg(p.column_name::text ORDER BY p.ordinal_position) INTO v_cols
      FROM information_schema.columns p
      WHERE p.table_schema = r.sch AND p.table_name = r.tbl
        AND EXISTS (SELECT 1 FROM information_schema.columns s
                    WHERE s.table_schema = 'restore_shadow' AND s.table_name = r.shadow
                      AND s.column_name = p.column_name);
    IF v_cols IS NULL THEN
      RAISE EXCEPTION 'restore_apply_from_shadow: sem colunas comuns em %', k;
    END IF;
    SELECT string_agg(quote_ident(c), ', ') INTO v_list FROM unnest(v_cols) c;
    EXECUTE format('INSERT INTO %I.%I (%s) SELECT %s FROM restore_shadow.%I',
                   r.sch, r.tbl, v_list, v_list, r.shadow);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_inserted := v_inserted || jsonb_build_object(k, v_n);
  END LOOP;

  SET CONSTRAINTS ALL IMMEDIATE;

  FOREACH k IN ARRAY v_order LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    EXECUTE format('ALTER TABLE %I.%I ENABLE TRIGGER USER', r.sch, r.tbl);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'scope', p_scope, 'company_id', p_company_id,
    'order', to_jsonb(v_order), 'deleted', v_deleted, 'inserted', v_inserted);
END $function$;

REVOKE ALL ON FUNCTION public.restore_apply_from_shadow(text, uuid, text[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_apply_from_shadow(text, uuid, text[], jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.restore_apply_from_shadow(text, uuid, text[], jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_apply_from_shadow(text, uuid, text[], jsonb) TO service_role;

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
      SELECT DISTINCT
        CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END AS child_key,
        cn.nspname::text AS c_sch, cc.relname::text AS c_tbl,
        CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END AS parent_key,
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
        SELECT DISTINCT
          CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END
        FROM pg_constraint c
        JOIN pg_class cc ON cc.oid = c.conrelid
        JOIN pg_namespace cn ON cn.oid = cc.relnamespace
        JOIN pg_class pc ON pc.oid = c.confrelid
        JOIN pg_namespace pn ON pn.oid = pc.relnamespace
        WHERE c.contype = 'f' AND c.conrelid <> c.confrelid
          AND (CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END) = ANY (v_keep)
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

CREATE OR REPLACE FUNCTION public.restore_event_scope_json(p_event_ids uuid[], p_roots text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ids jsonb; v_counts jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _restore_scope_out (key text, id uuid) ON COMMIT DROP;
  DELETE FROM _restore_scope_out WHERE true;
  INSERT INTO _restore_scope_out (key, id)
  SELECT s.tbl_key, s.row_id FROM public.restore_event_scope(p_event_ids, p_roots) s;

  SELECT COALESCE(jsonb_object_agg(key, ids), '{}'::jsonb) INTO v_ids
  FROM (SELECT key, jsonb_agg(id) AS ids FROM _restore_scope_out GROUP BY key) x;
  SELECT COALESCE(jsonb_object_agg(key, n), '{}'::jsonb) INTO v_counts
  FROM (SELECT key, count(*) AS n FROM _restore_scope_out GROUP BY key) y;

  RETURN jsonb_build_object('ids', v_ids, 'counts', v_counts);
END $function$;

REVOKE ALL ON FUNCTION public.restore_event_scope_json(uuid[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_event_scope_json(uuid[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.restore_event_scope_json(uuid[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_event_scope_json(uuid[], text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_scope_links(p_tables text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'child', child_key, 'parent', parent_key, 'child_col', child_col)), '[]'::jsonb)
  FROM (
    SELECT
      CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END AS child_key,
      CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END AS parent_key,
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
      AND (SELECT a.attname FROM pg_attribute a
            WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[1]) = 'id'
      AND (CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END) = ANY (p_tables)
      AND (CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END) = ANY (p_tables)
  ) z;
$function$;

REVOKE ALL ON FUNCTION public.restore_scope_links(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_scope_links(text[]) FROM anon;
REVOKE ALL ON FUNCTION public.restore_scope_links(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_scope_links(text[]) TO service_role;

DROP TABLE IF EXISTS restore_shadow._snapshot;