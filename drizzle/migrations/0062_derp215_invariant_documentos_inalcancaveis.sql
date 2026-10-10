-- #213 — invariante: linhas de transaction_documents sem objeto no bucket.
CREATE OR REPLACE FUNCTION public._run_invariant_checks_unreachable_docs()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage', 'pg_catalog'
AS $function$
DECLARE c bigint; s jsonb;
BEGIN
  WITH d AS (
    SELECT td.id, td.transaction_id, td.file_url, td.uploaded_at
      FROM public.transaction_documents td
     WHERE td.file_url IS NOT NULL
       AND td.file_url !~ '^(bank|ref|camarim|card)://'
       AND td.file_url !~* '^https?://'
       AND NOT EXISTS (SELECT 1 FROM storage.objects o
                        WHERE o.bucket_id = 'transaction-documents' AND o.name = td.file_url)
  )
  SELECT (SELECT count(*) FROM d),
         COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM d ORDER BY uploaded_at LIMIT 10) x), '[]'::jsonb)
    INTO c, s;
  RETURN QUERY
  SELECT i.name, i.description, i.severity, i.scope, c, i.reference_count, (c <= i.reference_count), i.notes, s
    FROM public.system_invariants i WHERE i.name = 'documentos_inalcancaveis';
END;
$function$;
REVOKE ALL ON FUNCTION public._run_invariant_checks_unreachable_docs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_unreachable_docs() TO service_role;

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES ('documentos_inalcancaveis',
        'Anexos de transação cujo file_url não existe no bucket transaction-documents (NoSuchKey só ao abrir). Exclui bank://, ref://, camarim://, card:// e links http(s).',
        'error', 'global', 0,
        '#213 — resíduo histórico listado para decisão do Pedro; não reparar sem autorização.')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public._run_invariant_checks_all()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT * FROM public._run_invariant_checks_raw()
  UNION ALL SELECT * FROM public._run_invariant_checks_extra()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid()
  UNION ALL SELECT * FROM public._run_invariant_checks_secrets()
  UNION ALL SELECT * FROM public._run_invariant_checks_infra()
  UNION ALL SELECT * FROM public._run_invariant_checks_secdef()
  UNION ALL SELECT * FROM public._run_invariant_checks_docs()
  UNION ALL SELECT * FROM public._run_invariant_checks_extrato()
  UNION ALL SELECT * FROM public._run_invariant_checks_cards()
  UNION ALL SELECT * FROM public._run_invariant_checks_tenant()
  UNION ALL SELECT * FROM public._run_invariant_checks_duplicate_invoices()
  UNION ALL SELECT * FROM public._run_invariant_checks_camarim()
  UNION ALL SELECT * FROM public._run_invariant_checks_suppliers()
  UNION ALL SELECT * FROM public._run_invariant_checks_paid_below_gross()
  UNION ALL SELECT * FROM public._run_invariant_checks_ticketline_series()
  UNION ALL SELECT * FROM public._run_invariant_checks_unreachable_docs()
$function$;