CREATE OR REPLACE FUNCTION public._run_invariant_checks_storage()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage', 'pg_catalog'
AS $function$
DECLARE
  refs constant jsonb := '{"camarim_item_documents":9,"payment_list_documents":2,"card_item_documents":0,"event_forecast_attachments":0,"bank_line_documents":0,"event_ab_attachments":0}';
  cD bigint; sD jsonb; okD boolean; cM bigint; sM jsonb;
BEGIN
  WITH d(tbl, bucket, did, dpath) AS (
    SELECT 'camarim_item_documents', 'camarim-documents', x.id, x.file_path FROM public.camarim_item_documents x
    UNION ALL SELECT 'payment_list_documents', 'transaction-documents', x.id, x.file_url FROM public.payment_list_documents x
    UNION ALL SELECT 'card_item_documents', 'card-documents', x.id, x.file_path FROM public.card_item_documents x
    UNION ALL SELECT 'event_forecast_attachments', 'event-forecast-attachments', x.id, x.storage_path FROM public.event_forecast_attachments x
    UNION ALL SELECT 'bank_line_documents', 'bank-statements', x.id, x.file_url FROM public.bank_line_documents x
    UNION ALL SELECT 'event_ab_attachments', 'event-ab-attachments', x.id, x.storage_path FROM public.event_ab_attachments x
  ), m AS (
    SELECT * FROM d
     WHERE d.dpath IS NOT NULL AND d.dpath !~ '^(ref|bank|camarim|card)://' AND d.dpath !~* '^https?://'
       AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = d.bucket AND o.name = d.dpath)
  ), t AS (
    SELECT k AS tbl, (SELECT count(*) FROM m WHERE m.tbl = k) n, (refs->>k)::bigint r,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.did, 'path', s.dpath)), '[]'::jsonb)
              FROM (SELECT m.did, m.dpath FROM m WHERE m.tbl = k ORDER BY m.dpath LIMIT 5) s) amostra
      FROM jsonb_object_keys(refs) k
  )
  SELECT sum(t.n), bool_and(t.n <= t.r),
         jsonb_object_agg(t.tbl, jsonb_build_object('atual', t.n, 'referencia', t.r, 'amostra', t.amostra))
    INTO cD, okD, sD FROM t;

  WITH last AS (
    SELECT br.storage_report FROM public.backup_runs br
     WHERE br.scope = 'global' AND br.status = 'ok' ORDER BY br.finished_at DESC NULLS LAST LIMIT 1
  ), miss AS (
    SELECT b.id AS bid FROM storage.buckets b
     WHERE b.id <> 'database-backups'
       AND NOT coalesce((SELECT l.storage_report ? b.id FROM last l), false)
  )
  SELECT count(*), coalesce(jsonb_agg(miss.bid ORDER BY miss.bid), '[]'::jsonb) INTO cM, sM FROM miss;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         CASE i.name WHEN 'documento_sem_ficheiro_por_tabela' THEN cD ELSE cM END,
         i.reference_count,
         CASE i.name WHEN 'documento_sem_ficheiro_por_tabela' THEN okD ELSE cM <= i.reference_count END,
         i.notes,
         CASE i.name WHEN 'documento_sem_ficheiro_por_tabela' THEN sD ELSE sM END
    FROM public.system_invariants i
   WHERE i.name IN ('documento_sem_ficheiro_por_tabela', 'backup_manifesto_cobre_todos_os_buckets');
END;
$function$;