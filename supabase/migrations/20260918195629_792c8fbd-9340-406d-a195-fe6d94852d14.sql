-- #203: pg_safeupdate exige WHERE em DELETE na sessão do service_role.
CREATE OR REPLACE FUNCTION public.restore_topo_order(p_tables text[])
RETURNS text[] LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order text[] := '{}';
  v_rem text[] := p_tables;
  k text;
  v_progress boolean;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _restore_deps (child text, parent text) ON COMMIT DROP;
  DELETE FROM _restore_deps WHERE true;
  INSERT INTO _restore_deps (child, parent)
  SELECT DISTINCT
    CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END,
    CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END
  FROM pg_constraint c
  JOIN pg_class cc ON cc.oid = c.conrelid
  JOIN pg_namespace cn ON cn.oid = cc.relnamespace
  JOIN pg_class pc ON pc.oid = c.confrelid
  JOIN pg_namespace pn ON pn.oid = pc.relnamespace
  WHERE c.contype = 'f'
    AND c.conrelid <> c.confrelid
    AND (CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END) = ANY (p_tables)
    AND (CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END) = ANY (p_tables);

  LOOP
    EXIT WHEN array_length(v_rem, 1) IS NULL;
    v_progress := false;
    FOREACH k IN ARRAY v_rem LOOP
      IF NOT EXISTS (SELECT 1 FROM _restore_deps d WHERE d.child = k AND d.parent = ANY (v_rem)) THEN
        v_order := v_order || k;
        v_rem := array_remove(v_rem, k);
        v_progress := true;
      END IF;
    END LOOP;
    IF NOT v_progress THEN
      v_order := v_order || v_rem;
      EXIT;
    END IF;
  END LOOP;
  RETURN v_order;
END $$;

CREATE OR REPLACE FUNCTION public.restore_apply_from_shadow(
  p_scope text, p_company_id uuid, p_tables text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order text[]; k text; r record; v_cols text[]; v_list text;
  v_inserted jsonb := '{}'::jsonb; v_deleted jsonb := '{}'::jsonb; v_n bigint; i int;
BEGIN
  IF p_scope NOT IN ('company','global') THEN
    RAISE EXCEPTION 'restore_apply_from_shadow: p_scope tem de ser company ou global';
  END IF;
  IF p_scope = 'company' AND p_company_id IS NULL THEN
    RAISE EXCEPTION 'restore_apply_from_shadow: p_company_id obrigatório em scope company';
  END IF;
  IF p_tables IS NULL OR array_length(p_tables, 1) IS NULL THEN
    RAISE EXCEPTION 'restore_apply_from_shadow: p_tables vazio';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;
  v_order := public.restore_topo_order(p_tables);

  FOREACH k IN ARRAY v_order LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    IF to_regclass('restore_shadow.' || quote_ident(r.shadow)) IS NULL THEN
      RAISE EXCEPTION 'restore_apply_from_shadow: sombra inexistente para %', k;
    END IF;
    EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER USER', r.sch, r.tbl);
  END LOOP;

  FOR i IN REVERSE array_length(v_order, 1) .. 1 LOOP
    k := v_order[i];
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    IF p_scope = 'company' THEN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = r.sch AND table_name = r.tbl AND column_name = 'company_id') THEN
        EXECUTE format('DELETE FROM %I.%I WHERE company_id = $1', r.sch, r.tbl) USING p_company_id;
      ELSE
        RAISE EXCEPTION 'restore_apply_from_shadow: % não tem company_id e o scope é company', k;
      END IF;
    ELSE
      EXECUTE format('DELETE FROM %I.%I WHERE true', r.sch, r.tbl);
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object(k, v_n);
  END LOOP;

  FOREACH k IN ARRAY v_order LOOP
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

  FOREACH k IN ARRAY v_order LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    EXECUTE format('ALTER TABLE %I.%I ENABLE TRIGGER USER', r.sch, r.tbl);
  END LOOP;

  SET CONSTRAINTS ALL IMMEDIATE;

  RETURN jsonb_build_object(
    'ok', true, 'scope', p_scope, 'company_id', p_company_id,
    'order', to_jsonb(v_order), 'deleted', v_deleted, 'inserted', v_inserted);
END $$;

REVOKE EXECUTE ON FUNCTION public.restore_topo_order(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_topo_order(text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_topo_order(text[]) TO service_role;
REVOKE EXECUTE ON FUNCTION public.restore_apply_from_shadow(text, uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_apply_from_shadow(text, uuid, text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_apply_from_shadow(text, uuid, text[]) TO service_role;