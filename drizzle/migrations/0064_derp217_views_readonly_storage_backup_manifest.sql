-- #294: views só de leitura para anon/authenticated (public + crm).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('v','m') AND n.nspname IN ('public','crm')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I.%I FROM anon, authenticated', r.nspname, r.relname);
  END LOOP;
END $$;

-- #268 (1): os 3 buckets que faltavam passam pela storage-delete.
CREATE OR REPLACE FUNCTION public.can_delete_storage_object(p_bucket text, p_name text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_uid IS NULL OR p_name IS NULL OR p_name = '' OR p_name LIKE '%/' OR p_name LIKE '_trash/%' THEN
    RETURN false;
  END IF;
  IF p_bucket IN ('transaction-documents','closing-cost-documents','supplier-documents') THEN
    RETURN (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'manager'::app_role))
       AND storage_path_belongs_to_current_company(p_name);
  ELSIF p_bucket = 'ticket-office-settlements' THEN
    RETURN has_role(v_uid,'admin'::app_role) AND storage_path_belongs_to_current_company(p_name);
  ELSIF p_bucket = 'camarim-documents' THEN
    SELECT owner INTO v_owner FROM storage.objects WHERE bucket_id = p_bucket AND name = p_name;
    RETURN (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'manager'::app_role)
            OR has_permission(v_uid,'camarim_manage')
            OR (has_permission(v_uid,'camarim_team') AND v_owner = v_uid))
       AND storage_path_belongs_to_current_company(p_name);
  ELSIF p_bucket = 'card-documents' THEN
    RETURN can_manage_cards(v_uid) OR EXISTS (
      SELECT 1 FROM card_sessions s
      WHERE s.id::text = split_part(p_name, '/', 1) AND s.status = 'open' AND s.holder_profile_id = v_uid);
  ELSIF p_bucket = 'standalone-invoices' THEN
    RETURN split_part(p_name, '/', 1) = current_company_id()::text
       AND (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'platform_admin'::app_role)
            OR has_role(v_uid,'manager'::app_role) OR has_role(v_uid,'editor'::app_role));
  ELSIF p_bucket = 'bank-statements' THEN
    RETURN split_part(p_name, '/', 1) = current_company_id()::text
       AND (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'platform_admin'::app_role)
            OR has_role(v_uid,'manager'::app_role));
  ELSIF p_bucket IN ('event-forecast-attachments','event-ab-attachments') THEN
    RETURN is_platform_admin() OR (split_part(p_name, '/', 1) = current_company_id()::text
       AND (has_role(v_uid,'admin'::app_role) OR has_role(v_uid,'manager'::app_role) OR has_role(v_uid,'editor'::app_role)));
  END IF;
  RETURN false;
END;
$function$;

DROP POLICY IF EXISTS "bank_statements_storage_delete" ON storage.objects;
DROP POLICY IF EXISTS "efa-storage delete privileged" ON storage.objects;
DROP POLICY IF EXISTS "eaba-storage delete privileged" ON storage.objects;

-- #202: manifesto de storage de todos os buckets + relatório na corrida.
ALTER TABLE public.backup_runs ADD COLUMN IF NOT EXISTS storage_report jsonb;

CREATE OR REPLACE FUNCTION public.backup_storage_manifest()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage', 'pg_catalog'
AS $function$
  SELECT coalesce(jsonb_object_agg(b.id, jsonb_build_object(
           'objects', coalesce(x.n, 0),
           'bytes', coalesce(x.bytes, 0),
           'trash_objects', coalesce(x.trash_n, 0),
           'trash_bytes', coalesce(x.trash_bytes, 0),
           'files', coalesce(x.files, '[]'::jsonb))), '{}'::jsonb)
    FROM storage.buckets b
    LEFT JOIN LATERAL (
      SELECT count(*) n,
             sum(coalesce((o.metadata->>'size')::bigint, 0)) bytes,
             count(*) FILTER (WHERE o.name LIKE '\_trash/%') trash_n,
             sum(coalesce((o.metadata->>'size')::bigint, 0)) FILTER (WHERE o.name LIKE '\_trash/%') trash_bytes,
             jsonb_agg(jsonb_build_object('name', o.name, 'size', (o.metadata->>'size')::bigint,
                       'mimetype', o.metadata->>'mimetype', 'updated_at', o.updated_at) ORDER BY o.name) files
        FROM storage.objects o WHERE o.bucket_id = b.id
    ) x ON true
   WHERE b.id <> 'database-backups';
$function$;
REVOKE ALL ON FUNCTION public.backup_storage_manifest() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backup_storage_manifest() TO service_role;

-- Invariantes: documentos por tabela (sem transaction_documents, que é o documentos_inalcancaveis) + manifesto.
CREATE OR REPLACE FUNCTION public._run_invariant_checks_storage()
RETURNS TABLE(name text, description text, severity text, scope text, current_count bigint, reference_count bigint, conforme boolean, notes text, sample jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'storage', 'pg_catalog'
AS $function$
DECLARE
  refs constant jsonb := '{"camarim_item_documents":9,"payment_list_documents":2,"card_item_documents":0,"event_forecast_attachments":0,"bank_line_documents":0,"event_ab_attachments":0}';
  cD bigint; sD jsonb; okD boolean; cM bigint; sM jsonb;
BEGIN
  WITH d(tbl, bucket, id, path) AS (
    SELECT 'camarim_item_documents', 'camarim-documents', id, file_path FROM public.camarim_item_documents
    UNION ALL SELECT 'payment_list_documents', 'transaction-documents', id, file_url FROM public.payment_list_documents
    UNION ALL SELECT 'card_item_documents', 'card-documents', id, file_path FROM public.card_item_documents
    UNION ALL SELECT 'event_forecast_attachments', 'event-forecast-attachments', id, storage_path FROM public.event_forecast_attachments
    UNION ALL SELECT 'bank_line_documents', 'bank-statements', id, file_url FROM public.bank_line_documents
    UNION ALL SELECT 'event_ab_attachments', 'event-ab-attachments', id, storage_path FROM public.event_ab_attachments
  ), m AS (
    SELECT * FROM d
     WHERE path IS NOT NULL AND path !~ '^(ref|bank|camarim|card)://' AND path !~* '^https?://'
       AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = d.bucket AND o.name = d.path)
  ), t AS (
    SELECT k AS tbl, (SELECT count(*) FROM m WHERE m.tbl = k) n, (refs->>k)::bigint r,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', path)), '[]'::jsonb)
              FROM (SELECT id, path FROM m WHERE m.tbl = k ORDER BY path LIMIT 5) s) amostra
      FROM jsonb_object_keys(refs) k
  )
  SELECT sum(n), bool_and(n <= r),
         jsonb_object_agg(tbl, jsonb_build_object('atual', n, 'referencia', r, 'amostra', amostra))
    INTO cD, okD, sD FROM t;

  WITH last AS (
    SELECT storage_report FROM public.backup_runs
     WHERE scope = 'global' AND status = 'ok' ORDER BY finished_at DESC NULLS LAST LIMIT 1
  ), miss AS (
    SELECT b.id FROM storage.buckets b
     WHERE b.id <> 'database-backups'
       AND NOT coalesce((SELECT storage_report ? b.id FROM last), false)
  )
  SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO cM, sM FROM miss;

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
REVOKE ALL ON FUNCTION public._run_invariant_checks_storage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._run_invariant_checks_storage() TO service_role;

INSERT INTO public.system_invariants (name, description, severity, scope, reference_count, notes)
VALUES
 ('documento_sem_ficheiro_por_tabela',
  'Linhas das tabelas de documentos (camarim, listas de pagamento, cartões, BP, extrato, A&B) sem objeto no bucket. transaction_documents fica no documentos_inalcancaveis. Conforme = cada tabela ≤ a sua referência.',
  'error', 'global', 11,
  '#268 — referência por tabela medida a 10/10/2026: camarim 9, listas de pagamento 2, resto 0. Não reparar sem autorização.'),
 ('backup_manifesto_cobre_todos_os_buckets',
  'Buckets de storage.buckets (menos database-backups) ausentes do storage_report da última corrida global ok do backup.',
  'error', 'global', 0,
  '#202 — manifesto dinâmico via backup_storage_manifest().')
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
  UNION ALL SELECT * FROM public._run_invariant_checks_isolation()
  UNION ALL SELECT * FROM public._run_invariant_checks_storage()
$function$;