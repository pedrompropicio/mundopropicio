-- restore_shadow_load: inserir só as colunas presentes no backup, para que as
-- colunas criadas DEPOIS do backup assumam o default da tabela em vez de NULL
-- (senão um NOT NULL novo faz falhar a carga — ex.: transaction_payments.closes_transaction).
CREATE OR REPLACE FUNCTION public.restore_shadow_load(p_table text, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; v_unknown text[]; v_n bigint; v_present text[]; v_list text;
BEGIN
  SELECT * INTO r FROM public.restore_shadow_ref(p_table);
  IF to_regclass('restore_shadow.' || quote_ident(r.shadow)) IS NULL THEN
    RAISE EXCEPTION 'restore_shadow_load: sombra inexistente para %', p_table;
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'restore_shadow_load: p_rows tem de ser um array jsonb';
  END IF;

  SELECT array_agg(DISTINCT kk) INTO v_unknown
  FROM jsonb_array_elements(p_rows) e, jsonb_object_keys(e.value) kk
  WHERE kk NOT IN (SELECT column_name FROM information_schema.columns
                   WHERE table_schema = 'restore_shadow' AND table_name = r.shadow);

  SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position) INTO v_present
  FROM information_schema.columns c
  WHERE c.table_schema = 'restore_shadow' AND c.table_name = r.shadow
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e
                WHERE e.value ? c.column_name);

  IF v_present IS NULL THEN
    RAISE EXCEPTION 'restore_shadow_load: nenhuma coluna do backup existe hoje em %', p_table;
  END IF;

  SELECT string_agg(quote_ident(c), ', ') INTO v_list FROM unnest(v_present) c;
  EXECUTE format(
    'INSERT INTO restore_shadow.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::restore_shadow.%I, $1)',
    r.shadow, v_list, v_list, r.shadow) USING p_rows;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('inserted', v_n, 'unknown_cols', COALESCE(to_jsonb(v_unknown), '[]'::jsonb),
                            'cols_defaulted', (SELECT COALESCE(to_jsonb(array_agg(c.column_name::text ORDER BY c.column_name)), '[]'::jsonb)
                                               FROM information_schema.columns c
                                               WHERE c.table_schema = 'restore_shadow' AND c.table_name = r.shadow
                                                 AND NOT (c.column_name::text = ANY (v_present))));
END $function$;

REVOKE ALL ON FUNCTION public.restore_shadow_load(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_shadow_load(text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_shadow_load(text, jsonb) TO service_role;