-- PREPARADO / NÃO EXECUTADO. Futuro operador autorizado: catálogo sintético
-- primeiro; instalação noutra base exige autorização própria. Sem bases MP aqui.
-- Guardas abortam a sessão com ON_ERROR_STOP; resultados não substituem revisão.
\set ON_ERROR_STOP on
SELECT current_database(), current_user, version();
DO $$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'installation_owner_must_be_postgres'; END IF;
  IF to_regclass('public.ads_invoice_generation_operation') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = 'public.ads_invoice'::regclass
      AND attname IN ('generation_revision','generation_cycle','generation_plan','generation_contract_version') AND NOT attisdropped
  ) THEN RAISE EXCEPTION '0305_object_collision'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND (left(p.proname,8) = '_ads486_' OR p.proname IN (
        'ads_invoice_generation_v1','ads_invoice_import_v1','ads_invoice_reopen_v1','ads_invoice_document_complete_v1'))) THEN
    RAISE EXCEPTION '0305_function_collision';
  END IF;
  IF to_regprocedure('public.batch_insert_event_forecasts(uuid,uuid,jsonb)') IS NULL OR
     to_regprocedure('public.batch_save_event_forecasts(uuid,uuid,jsonb,jsonb,text)') IS NULL OR
     to_regprocedure('public.has_permission_in(uuid,text,uuid)') IS NULL OR
     to_regprocedure('public.current_company_id()') IS NULL OR
     to_regprocedure('public.ads_invoice_line_is_pending(public.ads_invoice_line)') IS NULL OR
     to_regprocedure('public.ads_invoice_pending_counts(uuid[])') IS NULL THEN
    RAISE EXCEPTION 'missing_canonical_dependency';
  END IF;
END $$;
-- Conferir tipos/NOT NULL/defaults e constraints com as fontes do checkout.
SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,
       pg_get_expr(d.adbin,d.adrelid) default_expression
FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE c.oid IN ('public.ads_invoice'::regclass,'public.ads_invoice_line'::regclass,
               'public.event_forecasts'::regclass,'public.transactions'::regclass,
               'public.transaction_documents'::regclass) AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY c.relname,a.attnum;
SELECT conrelid::regclass,conname,pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid IN ('public.ads_invoice'::regclass,'public.ads_invoice_line'::regclass,
                  'public.event_forecasts'::regclass,'public.transaction_documents'::regclass)
ORDER BY 1,2;
-- Pré-imagem obrigatória: guardar definição, owner, proconfig e ACL; rollback
-- só é válido se as duas funções antigas coincidirem com o baseline abaixo.
SELECT p.oid::regprocedure,pg_get_userbyid(p.proowner),p.proconfig,p.proacl,md5(p.prosrc),pg_get_functiondef(p.oid)
FROM pg_proc p WHERE p.oid IN ('public.ads_invoice_line_is_pending(public.ads_invoice_line)'::regprocedure,
                             'public.ads_invoice_pending_counts(uuid[])'::regprocedure);
-- Leituras devolvem só contagens/hashes, nunca conteúdo do PDF ou PII.
SELECT count(*) invoice_count,md5(coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id)::text,'[]')) invoice_digest FROM public.ads_invoice i;
SELECT count(*) line_count,md5(coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id)::text,'[]')) line_digest FROM public.ads_invoice_line l;
-- Triggers existentes não serão alterados. Estas saídas são pré-imagens para
-- comparação na pós-verificação; não assumir cobertura de writers externos.
SELECT tgrelid::regclass,tgname,pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid IN ('public.ads_invoice'::regclass,'public.ads_invoice_line'::regclass,
                  'public.transactions'::regclass,'public.event_forecasts'::regclass) AND NOT tgisinternal ORDER BY 1,2;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.ads_invoice_line_is_pending(public.ads_invoice_line)'::regprocedure AND md5(prosrc) = '5d17486cafee4a4958c3571360261524'
      AND NOT prosecdef AND pg_get_userbyid(proowner) = 'postgres' AND proconfig = ARRAY['search_path=public']::text[]) THEN
    RAISE EXCEPTION 'legacy_identity_mismatch: ads_invoice_line_is_pending(public.ads_invoice_line)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.ads_invoice_pending_counts(uuid[])'::regprocedure AND md5(prosrc) = 'a0dac5afeea4c9890a1fe495a75afd95'
      AND NOT prosecdef AND pg_get_userbyid(proowner) = 'postgres' AND proconfig = ARRAY['search_path=public']::text[]) THEN
    RAISE EXCEPTION 'legacy_identity_mismatch: ads_invoice_pending_counts(uuid[])'; END IF;
END $$;
