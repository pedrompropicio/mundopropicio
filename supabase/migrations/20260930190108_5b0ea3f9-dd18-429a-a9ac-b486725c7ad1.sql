SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public._run_invariant_checks_docs()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cR bigint; sR jsonb; allR jsonb;
BEGIN
  -- #268: todas as tabelas de documentos; ficheiro distinto = (bucket, caminho).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tabela', m.tabela, 'bucket', m.bucket, 'file_url', m.caminho, 'linhas', m.linhas) ORDER BY m.tabela, m.caminho), '[]'::jsonb)
    INTO allR
    FROM (
      SELECT s.tabela, s.bucket, s.caminho, count(*)::bigint AS linhas
        FROM (
          SELECT 'transaction_documents'::text AS tabela, 'transaction-documents'::text AS bucket, file_url::text AS caminho FROM public.transaction_documents
          UNION ALL SELECT 'payment_list_documents', 'transaction-documents', file_url FROM public.payment_list_documents
          UNION ALL SELECT 'camarim_item_documents', 'camarim-documents', file_path FROM public.camarim_item_documents
          UNION ALL SELECT 'card_item_documents', 'card-documents', file_path FROM public.card_item_documents
          UNION ALL SELECT 'event_forecast_attachments', 'event-forecast-attachments', storage_path FROM public.event_forecast_attachments
          UNION ALL SELECT 'bank_line_documents', 'bank-statements', file_url FROM public.bank_line_documents
          UNION ALL SELECT 'event_ab_attachments', 'event-ab-attachments', storage_path FROM public.event_ab_attachments
          UNION ALL SELECT 'entity_documents', 'entity-documents', storage_path FROM public.entity_documents
          UNION ALL SELECT 'supplier_documents', 'supplier-documents', file_url FROM public.supplier_documents
        ) s
       WHERE s.caminho IS NOT NULL
         AND s.caminho !~ '^(bank:|ref:|camarim:|card:|https?:)'
         AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = s.bucket AND o.name = s.caminho)
       GROUP BY s.tabela, s.bucket, s.caminho
    ) m;

  SELECT count(*) INTO cR
    FROM (SELECT DISTINCT e->>'bucket', e->>'file_url' FROM jsonb_array_elements(allR) e) z;

  SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO sR
    FROM (SELECT e FROM jsonb_array_elements(allR) e LIMIT 5) x;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cR, i.reference_count, (cR <= i.reference_count) AS conforme,
         i.notes, sR
    FROM public.system_invariants i
   WHERE i.name = 'documento_sem_ficheiro_no_storage';
END;
$function$;

REVOKE ALL ON FUNCTION public._run_invariant_checks_docs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_docs() TO service_role;

UPDATE public.system_invariants
   SET description = 'Ficheiros distintos (bucket + caminho) referidos nas tabelas de documentos (transaction_documents, payment_list_documents, camarim_item_documents, card_item_documents, event_forecast_attachments, bank_line_documents, event_ab_attachments, entity_documents, supplier_documents) sem objecto no bucket respectivo; excluídos bank:, ref:, camarim:, card: e http(s):.',
       reference_count = 18,
       notes = '#268 (30/09/2026): referência 18 ficheiros distintos = 9 em transaction-documents (transaction_documents 9; os 2 de payment_list_documents são 2 desses 9) + 9 em camarim-documents. Conformidade por <=. Qualquer subida acusa um caminho que perdeu o ficheiro.',
       reference_updated_at = now(),
       updated_at = now()
 WHERE name = 'documento_sem_ficheiro_no_storage';