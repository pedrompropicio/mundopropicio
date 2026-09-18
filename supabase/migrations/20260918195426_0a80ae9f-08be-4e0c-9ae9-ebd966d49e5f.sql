-- #203: restore_topo_order usa tabela temporária; não pode ser STABLE.
CREATE OR REPLACE FUNCTION public.restore_topo_order(p_tables text[])
RETURNS text[] LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_order text[] := '{}';
  v_rem text[] := p_tables;
  k text;
  v_progress boolean;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _restore_deps (child text, parent text) ON COMMIT DROP;
  DELETE FROM _restore_deps;
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

REVOKE EXECUTE ON FUNCTION public.restore_topo_order(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_topo_order(text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_topo_order(text[]) TO service_role;