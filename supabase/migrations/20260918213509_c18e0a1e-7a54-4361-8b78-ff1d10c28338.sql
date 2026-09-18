-- restore_shadow_validate: em p_scope='rows' (restauro de um evento) o pai pode
-- estar FORA do âmbito e continuar em produção — aceita-se sombra OU produção.
CREATE OR REPLACE FUNCTION public.restore_shadow_validate(p_scope text, p_company_id uuid, p_tables text[], p_counts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  k text; r record; fk record; v_errors jsonb := '[]'::jsonb; v_counts jsonb := '{}'::jsonb;
  v_n bigint; v_exp bigint; v_bad bigint; v_parent text; v_skipped jsonb := '[]'::jsonb;
  v_fk_checked int := 0; v_prod text; v_cond text;
BEGIN
  FOREACH k IN ARRAY p_tables LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(k);
    EXECUTE format('SELECT count(*) FROM restore_shadow.%I', r.shadow) INTO v_n;
    v_counts := v_counts || jsonb_build_object(k, v_n);
    v_exp := COALESCE((p_counts ->> k)::bigint, 0);
    IF v_n <> v_exp THEN
      v_errors := v_errors || jsonb_build_object('table', k, 'kind', 'count',
        'detail', format('sombra tem %s linhas, manifesto diz %s', v_n, v_exp));
    END IF;

    IF p_scope = 'company' AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'restore_shadow' AND table_name = r.shadow AND column_name = 'company_id') THEN
      EXECUTE format('SELECT count(*) FROM restore_shadow.%I WHERE company_id IS DISTINCT FROM $1', r.shadow)
        INTO v_bad USING p_company_id;
      IF v_bad > 0 THEN
        v_errors := v_errors || jsonb_build_object('table', k, 'kind', 'company_id',
          'detail', format('%s linhas com company_id diferente de %s', v_bad, p_company_id));
      END IF;
    END IF;
  END LOOP;

  FOR fk IN
    SELECT c.conname,
           CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END AS child_key,
           CASE WHEN pn.nspname = 'crm' THEN 'crm.' || pc.relname ELSE pc.relname END AS parent_key,
           pn.nspname AS p_sch, pc.relname AS p_tbl,
           array_length(c.conkey, 1) AS ncols,
           (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) AS child_col,
           (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[1]) AS parent_col
    FROM pg_constraint c
    JOIN pg_class cc ON cc.oid = c.conrelid
    JOIN pg_namespace cn ON cn.oid = cc.relnamespace
    JOIN pg_class pc ON pc.oid = c.confrelid
    JOIN pg_namespace pn ON pn.oid = pc.relnamespace
    WHERE c.contype = 'f'
      AND (CASE WHEN cn.nspname = 'crm' THEN 'crm.' || cc.relname ELSE cc.relname END) = ANY (p_tables)
  LOOP
    SELECT * INTO r FROM public.restore_shadow_ref(fk.child_key);
    IF fk.ncols > 1 THEN
      v_skipped := v_skipped || jsonb_build_object('constraint', fk.conname, 'reason', 'FK multi-coluna');
      CONTINUE;
    END IF;
    v_prod := quote_ident(fk.p_sch) || '.' || quote_ident(fk.p_tbl);
    IF fk.parent_key = ANY (p_tables) THEN
      v_parent := 'restore_shadow.' || quote_ident((SELECT shadow FROM public.restore_shadow_ref(fk.parent_key)));
      IF p_scope = 'rows' THEN
        -- O pai pode estar fora do âmbito e permanecer em produção.
        v_cond := format('NOT EXISTS (SELECT 1 FROM %s p WHERE p.%I = c.%I)
                            AND NOT EXISTS (SELECT 1 FROM %s q WHERE q.%I = c.%I)',
                         v_parent, fk.parent_col, fk.child_col, v_prod, fk.parent_col, fk.child_col);
      ELSE
        v_cond := format('NOT EXISTS (SELECT 1 FROM %s p WHERE p.%I = c.%I)',
                         v_parent, fk.parent_col, fk.child_col);
      END IF;
    ELSE
      v_cond := format('NOT EXISTS (SELECT 1 FROM %s p WHERE p.%I = c.%I)',
                       v_prod, fk.parent_col, fk.child_col);
    END IF;
    EXECUTE format(
      'SELECT count(*) FROM restore_shadow.%I c WHERE c.%I IS NOT NULL AND %s',
      r.shadow, fk.child_col, v_cond) INTO v_bad;
    v_fk_checked := v_fk_checked + 1;
    IF v_bad > 0 THEN
      v_errors := v_errors || jsonb_build_object('table', fk.child_key, 'kind', 'fk',
        'detail', format('%s: %s valores sem pai (%s)', fk.conname, v_bad, fk.parent_key));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'tables', array_length(p_tables, 1),
    'scope', p_scope,
    'fks_checked', v_fk_checked,
    'fks_skipped', v_skipped,
    'counts', v_counts,
    'errors', v_errors);
END $function$;

REVOKE ALL ON FUNCTION public.restore_shadow_validate(text, uuid, text[], jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_shadow_validate(text, uuid, text[], jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_shadow_validate(text, uuid, text[], jsonb) TO service_role;