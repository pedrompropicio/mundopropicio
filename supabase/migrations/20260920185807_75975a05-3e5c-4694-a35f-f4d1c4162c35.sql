INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES (
  'documento_sem_ficheiro_no_storage',
  'Ficheiros distintos referidos em transaction_documents.file_url que não existem no bucket transaction-documents (excluídos os esquemas bank://, ref://, camarim:// e card://).',
  'error',
  'global',
  8,
  'Referência 8 = os 8 ficheiros genuinamente perdidos de Abril/Agosto 2026 (25 linhas), a repor por upload (#213). Qualquer subida acusa: significa que um caminho de escrita gravou um file_url que não bate com o objecto carregado. Conta ficheiros distintos, não linhas.'
)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_docs()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  cR bigint; sR jsonb;
BEGIN
  SELECT count(DISTINCT d.file_url) INTO cR
    FROM public.transaction_documents d
   WHERE d.file_url IS NOT NULL
     AND d.file_url NOT LIKE 'bank://%'
     AND d.file_url NOT LIKE 'ref://%'
     AND d.file_url NOT LIKE 'camarim://%'
     AND d.file_url NOT LIKE 'card://%'
     AND NOT EXISTS (
       SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'transaction-documents'
          AND o.name = d.file_url
     );

  SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO sR
    FROM (
      SELECT d.file_url::text AS file_url,
             count(*)::bigint AS linhas,
             min(d.transaction_id::text) AS transaction_id
        FROM public.transaction_documents d
       WHERE d.file_url IS NOT NULL
         AND d.file_url NOT LIKE 'bank://%'
         AND d.file_url NOT LIKE 'ref://%'
         AND d.file_url NOT LIKE 'camarim://%'
         AND d.file_url NOT LIKE 'card://%'
         AND NOT EXISTS (
           SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = 'transaction-documents'
              AND o.name = d.file_url
         )
       GROUP BY d.file_url
       ORDER BY d.file_url
       LIMIT 5
    ) x;

  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope,
         cR, i.reference_count, (cR <= i.reference_count) AS conforme,
         i.notes, sR
    FROM public.system_invariants i
   WHERE i.name = 'documento_sem_ficheiro_no_storage';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_docs() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._run_invariant_checks_docs() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_docs() TO service_role;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
 RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_secdef()
  UNION ALL
  SELECT * FROM public._run_invariant_checks_docs()
$function$;