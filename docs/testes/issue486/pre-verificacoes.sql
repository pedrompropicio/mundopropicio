-- PREPARADO / NÃO EXECUTADO. Futuro operador autorizado: catálogo sintético
-- primeiro; instalação noutra base exige autorização própria. Sem bases MP aqui.
-- Guardas abortam a sessão com ON_ERROR_STOP; resultados não substituem revisão.
\set ON_ERROR_STOP on
SELECT current_database(), current_user, version();
DO $$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'installation_owner_must_be_postgres'; END IF;
  IF to_regnamespace('ads486_private') IS NOT NULL THEN RAISE EXCEPTION '0305_schema_collision'; END IF;
  IF to_regclass('public.ads_invoice_generation_operation') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_attribute WHERE attrelid = 'public.ads_invoice'::regclass
      AND attname IN ('generation_revision','generation_cycle','generation_plan','generation_contract_version','source_file_sha256','source_attestation','confirmed_revision','confirmed_preview_hash','generation_maintenance') AND NOT attisdropped
  ) THEN RAISE EXCEPTION '0305_object_collision'; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND (left(p.proname,8) = '_ads486_' OR p.proname IN (
        'ads_invoice_generation_v1','ads_invoice_import_v1','ads_invoice_reopen_v1','ads_invoice_document_complete_v1','ads_invoice_source_attest_v1','ads_invoice_revert_v1','ads_invoice_maintenance_v1'))) THEN
    RAISE EXCEPTION '0305_function_collision';
  END IF;
  IF to_regprocedure('public.raise_forecast_budget(uuid,numeric,text)') IS NULL OR
     to_regprocedure('public.ads_invoice_line_set_tour_split(uuid,jsonb)') IS NULL OR
     to_regprocedure('public.batch_insert_event_forecasts(uuid,uuid,jsonb)') IS NULL OR
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
                             'public.ads_invoice_pending_counts(uuid[])'::regprocedure,
                             'public.ads_invoice_line_set_tour_split(uuid,jsonb)'::regprocedure);
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

-- Terceira pré-imagem: o setter #293 apenas delegará o ramo v1.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.ads_invoice_line_set_tour_split(uuid,jsonb)'::regprocedure
  AND md5(prosrc)='28d59eca2001138466125ffec1f35ae7' AND prosecdef AND pg_get_userbyid(proowner)='postgres'
  AND proconfig=ARRAY['search_path=public, pg_catalog']::text[]) THEN
  RAISE EXCEPTION 'legacy_split_preimage_mismatch'; END IF;
END $$;
-- Dependências da união de locks: ausente é falha, nunca skip.
DO $$ DECLARE relation_name text; BEGIN
 FOREACH relation_name IN ARRAY ARRAY['crm.ad_platform_connections','crm.tiktok_campaign','public.account_categories',
 'public.accountant_transaction_reviews','public.accounting_exports','public.artist_songs','public.artists','public.companies','public.bp_version_audit_log','public.bp_versions',
 'public.event_forecast_formalidade_log','public.event_forecasts','public.event_settlements','public.events','public.forecast_audit_log',
 'public.payment_list_items','public.profiles','public.reimbursement_note_items','public.reimbursement_notes','public.role_permissions',
 'public.standalone_invoices','public.suppliers','public.system_audit_log','public.transaction_audit_log',
 'public.transaction_documents','public.transaction_payments','public.transactions','public.user_permissions','public.user_roles'] LOOP
  IF to_regclass(relation_name) IS NULL THEN RAISE EXCEPTION 'missing_relation: %',relation_name; END IF;
 END LOOP;
END $$;
-- Guardar fontes/overloads/defaults e dependências canónicas, sem #352/bindings.
SELECT p.oid::regprocedure,pg_get_function_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl,
 p.proconfig,pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.proname IN (
 'batch_save_event_forecasts','batch_insert_event_forecasts','batch_update_event_forecasts','create_bp_snapshot',
 'raise_forecast_budget','has_permission_in','enforce_transaction_approval_permission','sync_tx_forecast_to_anchor',
 'sync_forecast_anchor_to_tx','set_forecast_baseline_amount','inherit_house_only_from_forecast','propagate_house_only_to_transactions');
SELECT tgrelid::regclass,tgname,pg_get_triggerdef(oid),tgfoid::regprocedure FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid IN ('public.event_forecasts'::regclass,'public.transactions'::regclass,
 'public.transaction_payments'::regclass,'public.transaction_documents'::regclass,'public.event_settlements'::regclass) ORDER BY 1,2;
-- Rever a união transitiva das relações lidas/escritas por estas fontes; divergência
-- do candidato bloqueia instalação, sem acrescentar objetos #413/#404 ao diff.
-- Guardar FKs e ações ON DELETE; nenhuma conferência pode desaparecer por cascata.
SELECT conrelid::regclass,confrelid::regclass,conname,pg_get_constraintdef(oid) FROM pg_constraint
 WHERE contype='f' AND (conrelid IN ('public.transactions'::regclass,'public.event_forecasts'::regclass)
  OR confrelid IN ('public.transactions'::regclass,'public.event_forecasts'::regclass)) ORDER BY 1,3;

-- C2: fontes empresariais e de identidade são dependências de esquema, nunca
-- valores operacionais inventados. Todas as colunas têm de existir com os tipos.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('public.companies','currency','text'),('public.suppliers','nif','text'),('public.suppliers','is_active','boolean'),
  ('crm.ad_platform_connections','selected_ad_account_id','text'),('crm.ad_platform_connections','company_id','uuid'),
  ('crm.ad_platform_connections','platform','text'),('crm.ad_platform_connections','connection_scope','text'),
  ('crm.ad_platform_connections','artist_id','uuid'),('crm.tiktok_campaign','connection_id','uuid')
 ) expected(relation_name,column_name,type_name) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass(r.relation_name)
   AND a.attname=r.column_name AND NOT a.attisdropped AND format_type(a.atttypid,a.atttypmod)=r.type_name) THEN
   RAISE EXCEPTION '0305_source_column_mismatch: %.%',r.relation_name,r.column_name;
  END IF;
 END LOOP;
END $$;
-- Antes de promover: coordenador confirma catálogo/triggers transitivos, fornecedor
-- por NIF/ID e conta/empresa/fonte documental reais. Estas leituras de esquema
-- não certificam dados instalados, disponibilidade de NIF nem compatibilidade D3.
