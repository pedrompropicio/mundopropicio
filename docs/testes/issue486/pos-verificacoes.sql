-- PREPARADO / NÃO EXECUTADO. Só após uma instalação explicitamente autorizada.
\set ON_ERROR_STOP on
DO $$
DECLARE signature text; role_name text; should_execute boolean;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ads_invoice_generation_operation'::regclass) THEN
    RAISE EXCEPTION 'operation_rls_disabled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ads_invoice_generation_operation) OR EXISTS (
    SELECT 1 FROM public.ads_invoice WHERE generation_plan IS NOT NULL OR generation_contract_version IS NOT NULL
      OR generation_revision <> 0 OR generation_cycle <> 0
  ) THEN RAISE EXCEPTION 'unexpected_v1_backfill'; END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(role_name,'public.ads_invoice_generation_operation','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'unexpected_operation_acl: %',role_name;
    END IF;
  END LOOP;
  FOR signature IN SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND (left(p.proname,8) = '_ads486_' OR p.proname IN (
      'ads_invoice_generation_v1','ads_invoice_import_v1','ads_invoice_reopen_v1',
      'ads_invoice_document_complete_v1','ads_invoice_line_is_pending','ads_invoice_pending_counts')) LOOP
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      should_execute := CASE
        WHEN signature LIKE '%ads_invoice_document_complete_v1(%' THEN role_name = 'service_role'
        WHEN signature LIKE '%ads_invoice_line_is_pending(%' OR signature LIKE '%ads_invoice_pending_counts(%'
          THEN role_name IN ('authenticated','service_role')
        WHEN signature LIKE '%_ads486_%' THEN false
        ELSE role_name = 'authenticated' END;
      IF has_function_privilege(role_name,signature,'EXECUTE') IS DISTINCT FROM should_execute THEN
        RAISE EXCEPTION 'function_acl: % / %',signature,role_name;
      END IF;
    END LOOP;
  END LOOP;
END $$;
-- O digest de faturas exclui somente as quatro colunas novas. Comparar com a
-- saída prévia: ambos os hashes e contagens têm de permanecer iguais.
SELECT count(*) invoice_count,md5(coalesce(jsonb_agg(to_jsonb(i) - ARRAY[
  'generation_revision','generation_cycle','generation_plan','generation_contract_version'] ORDER BY i.id)::text,'[]')) invoice_digest
FROM public.ads_invoice i;
SELECT count(*) line_count,md5(coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id)::text,'[]')) line_digest FROM public.ads_invoice_line l;
SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.ads_invoice_generation_operation'::regclass ORDER BY conname;
SELECT tgrelid::regclass,tgname,pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid IN ('public.ads_invoice'::regclass,'public.ads_invoice_line'::regclass,
                  'public.transactions'::regclass,'public.event_forecasts'::regclass) AND NOT tgisinternal ORDER BY 1,2;
-- Identidade dos 16 corpos deve coincidir com function-identities.tsv.
SELECT p.oid::regprocedure,md5(p.prosrc),p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND (left(p.proname,8) = '_ads486_' OR p.proname IN (
  'ads_invoice_generation_v1','ads_invoice_import_v1','ads_invoice_reopen_v1',
  'ads_invoice_document_complete_v1','ads_invoice_line_is_pending','ads_invoice_pending_counts')) ORDER BY 1;
