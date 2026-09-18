CREATE OR REPLACE FUNCTION public.restore_event_snapshot(p_event_ids uuid[], p_roots text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; v_out jsonb := '{}'::jsonb; v_n bigint; v_md5 text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _restore_snap (sch text, tbl text, key text, id uuid) ON COMMIT DROP;
  DELETE FROM _restore_snap WHERE true;
  INSERT INTO _restore_snap (sch, tbl, key, id)
  SELECT s.sch, s.tbl, s.tbl_key, s.row_id FROM public.restore_event_scope(p_event_ids, p_roots) s;

  FOR r IN SELECT DISTINCT sch, tbl, key FROM _restore_snap ORDER BY key LOOP
    EXECUTE format(
      'SELECT count(*), COALESCE(md5(string_agg(row_to_json(t)::text, %L ORDER BY t.id)), %L)
         FROM %I.%I t WHERE t.id IN (SELECT s.id FROM _restore_snap s WHERE s.key = %L)',
      '|', 'vazio', r.sch, r.tbl, r.key)
    INTO v_n, v_md5;
    v_out := v_out || jsonb_build_object(r.key, jsonb_build_object('n', v_n, 'md5', v_md5));
  END LOOP;

  RETURN v_out;
END $function$;

REVOKE ALL ON FUNCTION public.restore_event_snapshot(uuid[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_event_snapshot(uuid[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.restore_event_snapshot(uuid[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.restore_event_snapshot(uuid[], text[]) TO service_role;