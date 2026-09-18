DROP FUNCTION IF EXISTS public._tmp_apply_probe();

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
  v_pk text[]; v_join text; v_extra jsonb; v_pklist text; v_set text;
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

  -- Fase de eliminação (filhos primeiro).
  -- Em scope 'rows' NÃO se apagam as linhas em âmbito: um DELETE na linha do
  -- evento arrastaria em cascata sub-eventos e tudo abaixo. As linhas em âmbito
  -- são repostas por UPSERT. Só se apaga o que existe hoje e não vem no backup.
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

  -- Reposição (pais primeiro).
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

    IF p_scope = 'rows' THEN
      v_pk := public.restore_table_pk(k);
      SELECT string_agg(quote_ident(c), ', ') INTO v_pklist FROM unnest(v_pk) c;
      SELECT string_agg(format('%I = EXCLUDED.%I', c, c), ', ') INTO v_set
        FROM unnest(v_cols) c WHERE NOT (c = ANY (v_pk));
      IF v_set IS NULL THEN
        EXECUTE format('INSERT INTO %I.%I (%s) SELECT %s FROM restore_shadow.%I ON CONFLICT (%s) DO NOTHING',
                       r.sch, r.tbl, v_list, v_list, r.shadow, v_pklist);
      ELSE
        EXECUTE format('INSERT INTO %I.%I (%s) SELECT %s FROM restore_shadow.%I ON CONFLICT (%s) DO UPDATE SET %s',
                       r.sch, r.tbl, v_list, v_list, r.shadow, v_pklist, v_set);
      END IF;
    ELSE
      EXECUTE format('INSERT INTO %I.%I (%s) SELECT %s FROM restore_shadow.%I',
                     r.sch, r.tbl, v_list, v_list, r.shadow);
    END IF;
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