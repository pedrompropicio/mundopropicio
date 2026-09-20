CREATE OR REPLACE FUNCTION public.ticketline_sync_runs_compact_audit(_days integer DEFAULT 7)
 RETURNS TABLE(compacted_rows bigint, before_bytes numeric, after_bytes numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_role text := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_n bigint := 0;
  v_before numeric := 0;
  v_after numeric := 0;
BEGIN
  -- #204: só service_role (cron/edge) ou sessão sem claims (postgres/migração).
  IF v_role NOT IN ('service_role', '') THEN
    RAISE EXCEPTION 'Apenas service_role pode compactar o histórico de sincronização.' USING ERRCODE = '42501';
  END IF;

  FOR v_id, v_old IN
    SELECT r.id, r.import_audit
      FROM public.ticketline_sync_runs r
     WHERE r.import_audit IS NOT NULL
       AND jsonb_typeof(r.import_audit) = 'object'
       AND r.import_audit->>'compacted_at' IS NULL
       AND COALESCE(r.created_at, r.started_at) < now() - make_interval(days => GREATEST(COALESCE(_days, 7), 0))
     ORDER BY COALESCE(r.created_at, r.started_at)
  LOOP
    v_before := v_before + pg_column_size(v_old);

    SELECT COALESCE(jsonb_object_agg(e.k,
             CASE
               WHEN jsonb_typeof(e.val) = 'array' THEN
                 jsonb_build_object('_array_count', jsonb_array_length(e.val))
               WHEN jsonb_typeof(e.val) = 'object' THEN
                 CASE WHEN pg_column_size(e.val) <= 2000 THEN e.val
                      ELSE jsonb_build_object('_keys',
                             (SELECT count(*) FROM jsonb_object_keys(e.val)))
                 END
               ELSE e.val
             END), '{}'::jsonb)
      INTO v_new
      FROM jsonb_each(v_old) AS e(k, val);

    -- preserva uma amostra dos avisos e dos erros para diagnóstico
    IF jsonb_typeof(v_old->'warnings') = 'array' THEN
      v_new := v_new || jsonb_build_object('warnings_sample',
        COALESCE((SELECT jsonb_agg(w) FROM (
          SELECT w FROM jsonb_array_elements(v_old->'warnings') w LIMIT 5
        ) s), '[]'::jsonb));
    END IF;
    IF jsonb_typeof(v_old->'errors') = 'array' THEN
      v_new := v_new || jsonb_build_object('errors_sample',
        COALESCE((SELECT jsonb_agg(w) FROM (
          SELECT w FROM jsonb_array_elements(v_old->'errors') w LIMIT 10
        ) s), '[]'::jsonb));
    END IF;

    v_new := v_new || jsonb_build_object('compacted_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'));

    UPDATE public.ticketline_sync_runs SET import_audit = v_new WHERE id = v_id;

    v_after := v_after + pg_column_size(v_new);
    v_n := v_n + 1;
  END LOOP;

  RETURN QUERY SELECT v_n, v_before, v_after;
END;
$function$;

REVOKE ALL ON FUNCTION public.ticketline_sync_runs_compact_audit(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ticketline_sync_runs_compact_audit(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ticketline_sync_runs_compact_audit(integer) TO service_role;

UPDATE public.backup_excluded_tables
   SET reason = reason || ' Retenção: import_audit completo 7 dias, depois resumo (cron ticketline-sync-runs-retention, #204).'
 WHERE table_name = 'ticketline_sync_runs'
   AND reason NOT LIKE '%ticketline-sync-runs-retention%';

SELECT cron.unschedule('ticketline-sync-runs-retention')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ticketline-sync-runs-retention');

SELECT cron.schedule('ticketline-sync-runs-retention', '20 3 * * *',
  $$SELECT public.ticketline_sync_runs_compact_audit(7);$$);