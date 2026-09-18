-- D-ERP89 — restauro por evento com a CHAVE PRIMÁRIA REAL de cada tabela.
CREATE OR REPLACE FUNCTION public.restore_table_pk(p_key text)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (SELECT array_agg(att.attname::text ORDER BY k.ord)
          FROM pg_constraint c
          JOIN pg_class cl ON cl.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = cl.relnamespace
          CROSS JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
          JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = k.attnum
          WHERE c.contype = 'p' AND n.nspname = r.sch AND cl.relname = r.tbl)
  FROM public.restore_shadow_ref(p_key) r;
$function$;

REVOKE ALL ON FUNCTION public.restore_table_pk(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_table_pk(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_table_pk(text) TO service_role;

DROP FUNCTION IF EXISTS public.restore_event_scope(uuid[], text[]);
CREATE OR REPLACE FUNCTION public.restore_event_scope(p_event_ids uuid[], p_roots text[] DEFAULT NULL::text[])
RETURNS TABLE(sch text, tbl text, tbl_key text, row_key jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  fk record; v_n bigint; v_total bigint; v_round int := 0; v_keep text[]; v_prev int;
  v_keyexpr text;
BEGIN
  IF p_event_ids IS NULL OR array_length(p_event_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'restore_event_scope: p_event_ids vazio';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _restore_scope (
    sch text, tbl text, key text, row_key jsonb, PRIMARY KEY (key, row_key)
  ) ON COMMIT DROP;
  DELETE FROM _restore_scope WHERE true;

  CREATE TEMP TABLE IF NOT EXISTS _restore_allowed (
    key text PRIMARY KEY, sch text, tbl text, pk text[]
  ) ON COMMIT DROP;
  DELETE FROM _restore_allowed WHERE true;

  INSERT INTO _restore_allowed (key, sch, tbl, pk)
  SELECT x.k, i.schema_name, i.tbl_name, public.restore_table_pk(x.k)
  FROM public.backup_table_inventory() i
  CROSS JOIN LATERAL (
    SELECT CASE WHEN i.schema_name = 'crm' THEN 'crm.' || i.tbl_name ELSE i.tbl_name END
  ) x(k)
  WHERE NOT EXISTS (
          SELECT 1 FROM public.backup_excluded_tables e WHERE e.table_name = i.tbl_name)
    AND public.restore_table_pk(x.k) IS NOT NULL;

  INSERT INTO _restore_scope (sch, tbl, key, row_key)
  SELECT 'public', 'events', 'events', jsonb_build_object('id', e.id)
  FROM public.events e WHERE e.id = ANY (p_event_ids)
  ON CONFLICT DO NOTHING;

  FOR fk IN
    SELECT a.key, a.sch, a.tbl, a.pk FROM _restore_allowed a
    WHERE a.key <> 'events'
      AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = a.sch AND c.table_name = a.tbl
                    AND c.column_name = 'event_id' AND c.data_type = 'uuid')
  LOOP
    SELECT string_agg(format('%L, t.%I', c, c), ', ' ORDER BY ord)
      INTO v_keyexpr FROM unnest(fk.pk) WITH ORDINALITY u(c, ord);
    EXECUTE format(
      'INSERT INTO _restore_scope (sch, tbl, key, row_key)
         SELECT %L, %L, %L, jsonb_build_object(%s) FROM %I.%I t WHERE t.event_id = ANY ($1)
         ON CONFLICT DO NOTHING',
      fk.sch, fk.tbl, fk.key, v_keyexpr, fk.sch, fk.tbl) USING p_event_ids;
  END LOOP;

  LOOP
    v_round := v_round + 1;
    EXIT WHEN v_round > 30;
    v_total := 0;
    FOR fk IN
      SELECT DISTINCT l.child_key, l.c_sch, l.c_tbl, l.parent_key, l.child_col,
             (SELECT a.pk FROM _restore_allowed a WHERE a.key = l.child_key) AS pk
      FROM public.restore_fk_links() l
      WHERE NOT l.ambiguous
    LOOP
      IF fk.pk IS NULL THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM _restore_scope WHERE key = fk.parent_key) THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = fk.c_sch AND table_name = fk.c_tbl
                       AND column_name = fk.child_col AND data_type = 'uuid') THEN CONTINUE; END IF;
      SELECT string_agg(format('%L, t.%I', c, c), ', ' ORDER BY ord)
        INTO v_keyexpr FROM unnest(fk.pk) WITH ORDINALITY u(c, ord);
      EXECUTE format(
        'INSERT INTO _restore_scope (sch, tbl, key, row_key)
           SELECT %L, %L, %L, jsonb_build_object(%s) FROM %I.%I t
           WHERE t.%I IN (SELECT (s.row_key->>''id'')::uuid FROM _restore_scope s
                          WHERE s.key = %L AND s.row_key ? ''id'')
           ON CONFLICT DO NOTHING',
        fk.c_sch, fk.c_tbl, fk.child_key, v_keyexpr, fk.c_sch, fk.c_tbl, fk.child_col, fk.parent_key);
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

  RETURN QUERY SELECT s.sch, s.tbl, s.key, s.row_key FROM _restore_scope s;
END $function$;

REVOKE ALL ON FUNCTION public.restore_event_scope(uuid[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_event_scope(uuid[], text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_event_scope(uuid[], text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_event_scope_json(p_event_ids uuid[], p_roots text[] DEFAULT NULL::text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_keys jsonb; v_ids jsonb; v_counts jsonb; v_allowed jsonb; v_pk jsonb; v_amb jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _restore_scope_out (key text, row_key jsonb) ON COMMIT DROP;
  DELETE FROM _restore_scope_out WHERE true;
  INSERT INTO _restore_scope_out (key, row_key)
  SELECT s.tbl_key, s.row_key FROM public.restore_event_scope(p_event_ids, p_roots) s;

  SELECT COALESCE(jsonb_object_agg(key, ks), '{}'::jsonb) INTO v_keys
  FROM (SELECT key, jsonb_agg(row_key) AS ks FROM _restore_scope_out GROUP BY key) x;

  SELECT COALESCE(jsonb_object_agg(key, ids), '{}'::jsonb) INTO v_ids
  FROM (SELECT key, jsonb_agg(row_key->>'id') AS ids FROM _restore_scope_out
        WHERE row_key ? 'id' GROUP BY key) xi;

  SELECT COALESCE(jsonb_object_agg(key, n), '{}'::jsonb) INTO v_counts
  FROM (SELECT key, count(*) AS n FROM _restore_scope_out GROUP BY key) y;

  SELECT COALESCE(jsonb_agg(z.k ORDER BY z.k), '[]'::jsonb),
         COALESCE(jsonb_object_agg(z.k, to_jsonb(public.restore_table_pk(z.k))), '{}'::jsonb)
    INTO v_allowed, v_pk
  FROM (
    SELECT CASE WHEN i.schema_name = 'crm' THEN 'crm.' || i.tbl_name ELSE i.tbl_name END AS k
    FROM public.backup_table_inventory() i
    WHERE NOT EXISTS (SELECT 1 FROM public.backup_excluded_tables x WHERE x.table_name = i.tbl_name)
  ) z
  WHERE public.restore_table_pk(z.k) IS NOT NULL;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'child', l.child_key, 'parent', l.parent_key, 'child_col', l.child_col)), '[]'::jsonb)
    INTO v_amb
  FROM public.restore_fk_links() l WHERE l.ambiguous;

  RETURN jsonb_build_object('keys', v_keys, 'ids', v_ids, 'counts', v_counts,
                            'allowed', v_allowed, 'pk', v_pk, 'ambiguous_links', v_amb);
END $function$;

REVOKE ALL ON FUNCTION public.restore_event_scope_json(uuid[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_event_scope_json(uuid[], text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_event_scope_json(uuid[], text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_event_snapshot(p_event_ids uuid[], p_roots text[] DEFAULT NULL::text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; v_out jsonb := '{}'::jsonb; v_n bigint; v_md5 text; v_pk text[]; v_keyexpr text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _restore_snap (sch text, tbl text, key text, row_key jsonb) ON COMMIT DROP;
  DELETE FROM _restore_snap WHERE true;
  INSERT INTO _restore_snap (sch, tbl, key, row_key)
  SELECT s.sch, s.tbl, s.tbl_key, s.row_key FROM public.restore_event_scope(p_event_ids, p_roots) s;

  FOR r IN SELECT DISTINCT sch, tbl, key FROM _restore_snap ORDER BY key LOOP
    v_pk := public.restore_table_pk(r.key);
    SELECT string_agg(format('%L, t.%I', c, c), ', ' ORDER BY ord)
      INTO v_keyexpr FROM unnest(v_pk) WITH ORDINALITY u(c, ord);
    EXECUTE format(
      'SELECT count(*), COALESCE(md5(string_agg(row_to_json(t)::text, %L ORDER BY jsonb_build_object(%s)::text)), %L)
         FROM %I.%I t
        WHERE jsonb_build_object(%s) IN (SELECT s.row_key FROM _restore_snap s WHERE s.key = %L)',
      '|', v_keyexpr, 'vazio', r.sch, r.tbl, v_keyexpr, r.key)
    INTO v_n, v_md5;
    v_out := v_out || jsonb_build_object(r.key, jsonb_build_object('n', v_n, 'md5', v_md5));
  END LOOP;

  RETURN v_out;
END $function$;

REVOKE ALL ON FUNCTION public.restore_event_snapshot(uuid[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_event_snapshot(uuid[], text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_event_snapshot(uuid[], text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.restore_apply_from_shadow(p_scope text, p_company_id uuid, p_tables text[], p_extra_deletes jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order text[]; v_all text[]; k text; r record; v_cols text[]; v_list text;
  v_inserted jsonb := '{}'::jsonb; v_deleted jsonb := '{}'::jsonb;
  v_n bigint; v_n2 bigint; i int; v_has_shadow boolean;
  v_pk text[]; v_join text; v_extra jsonb;
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
    IF p_scope = 'rows' AND public.restore_table_pk(k) IS NULL THEN
      RAISE EXCEPTION 'restore_apply_from_shadow: % não tem chave primária e o scope é rows', k;
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
      v_pk := public.restore_table_pk(k);
      SELECT string_agg(format('s.%I = t.%I', c, c), ' AND ') INTO v_join FROM unnest(v_pk) c;
      IF k = ANY (p_tables) THEN
        EXECUTE format(
          'DELETE FROM %I.%I t WHERE EXISTS (SELECT 1 FROM restore_shadow.%I s WHERE %s)',
          r.sch, r.tbl, r.shadow, v_join);
        GET DIAGNOSTICS v_n = ROW_COUNT;
      END IF;
      SELECT COALESCE(jsonb_agg(CASE WHEN jsonb_typeof(e.value) = 'object'
                                     THEN e.value
                                     ELSE jsonb_build_object('id', e.value) END), '[]'::jsonb)
        INTO v_extra
        FROM jsonb_array_elements(COALESCE(p_extra_deletes -> k, '[]'::jsonb)) e;
      IF jsonb_array_length(v_extra) > 0 THEN
        SELECT string_agg(format('t.%I = d.%I', c, c), ' AND ') INTO v_join FROM unnest(v_pk) c;
        EXECUTE format(
          'DELETE FROM %I.%I t USING jsonb_populate_recordset(NULL::%I.%I, $1) d WHERE %s',
          r.sch, r.tbl, r.sch, r.tbl, v_join) USING v_extra;
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
REVOKE ALL ON FUNCTION public.restore_apply_from_shadow(text, uuid, text[], jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_apply_from_shadow(text, uuid, text[], jsonb) TO service_role;