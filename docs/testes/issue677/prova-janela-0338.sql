-- #677 · R2 PREPARADA, NÃO APLICADA. Prova só SELECT, sem dados de negócio.
-- Ordem da janela: 0338 → esta prova → mapas externos → staging 01 → «Corro?» apply → fecho.
-- Antes: confirmar 0335 PARTE 1 (resolvedor cinco argumentos), 0304 (FX nativo), 0303.
-- Guardar hashes locais SHA-256/md5 da 0338 e comparar os dois ficheiros antes de aplicar.
-- Depois da 0338: oito tabelas, RLS=true; anon sem privilégios;
-- authenticated apenas SELECT nominal, filtrado por platform_admin_read.
-- is_platform_admin é um papel da aplicação, não um papel PostgreSQL independente.
SELECT c.relname, c.relrowsecurity,
  has_table_privilege('anon',c.oid,'SELECT') AS anon_select_esperado_false,
  has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select_filtrado_por_rls,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS authenticated_escrita_esperado_false,
  has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS service_role_acesso_esperado_true
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('import_sm_2026_staging','import_sm_2026_column_map',
  'import_sm_2026_category_map','import_sm_2026_account_map','import_sm_2026_supplier_map',
  'import_sm_2026_event_map','import_sm_2026_batches','import_sm_2026_tx')
ORDER BY c.relname;

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename LIKE 'import_sm_2026_%'
ORDER BY tablename, policyname;

SELECT p.oid::regprocedure::text AS assinatura,p.prosecdef,p.proconfig,
  md5(pg_get_functiondef(p.oid)) AS md5_definicao,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_esperado_false,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_esperado_false,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_esperado_true
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'import_sm_2026_%' ORDER BY assinatura;

SELECT has_sequence_privilege('anon','public.import_sm_2026_staging_id_seq','USAGE') AS anon_esperado_false,
  has_sequence_privilege('authenticated','public.import_sm_2026_staging_id_seq','USAGE') AS authenticated_esperado_false,
  has_sequence_privilege('service_role','public.import_sm_2026_staging_id_seq','USAGE') AS service_role_esperado_true;

SELECT conname,convalidated,pg_get_constraintdef(oid) AS definicao
FROM pg_constraint WHERE conrelid = 'public.supplier_similarity_flags'::regclass
  AND conname = 'supplier_similarity_flags_source_check';

SELECT to_regprocedure('public._supplier_resolve_or_create(uuid,text,text,text,text)') AS resolvedor,
  to_regprocedure('public.account_true_balances_asof(uuid[],date)') AS saldo_canonico;

SELECT t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definicao,
  md5(pg_get_functiondef(t.tgfoid)) AS md5_corpo
FROM pg_trigger t WHERE NOT t.tgisinternal AND (
  (t.tgrelid = 'public.transactions'::regclass AND t.tgname IN (
    'zz_materialize_paid_amount_payment','trg_enforce_admin_window_event','trg_force_transitory_capital','enforce_paid_payment_date'))
  OR (t.tgrelid = 'public.transaction_payments'::regclass AND t.tgname IN (
    'zz_issue498_payment_native_fx','trg_sync_paid_amount_from_payments'))
) ORDER BY t.tgrelid,t.tgname;

-- Inicialmente oito zeros (staging/mapas/lotes vazios). Depois da carga, não esperar zeros.
SELECT 'staging' AS tabela,count(*) AS linhas FROM public.import_sm_2026_staging
UNION ALL SELECT 'column_map',count(*) FROM public.import_sm_2026_column_map
UNION ALL SELECT 'category_map',count(*) FROM public.import_sm_2026_category_map
UNION ALL SELECT 'account_map',count(*) FROM public.import_sm_2026_account_map
UNION ALL SELECT 'supplier_map',count(*) FROM public.import_sm_2026_supplier_map
UNION ALL SELECT 'event_map',count(*) FROM public.import_sm_2026_event_map
UNION ALL SELECT 'batches',count(*) FROM public.import_sm_2026_batches
UNION ALL SELECT 'tx',count(*) FROM public.import_sm_2026_tx;
-- Saldo NULL com service_role sem sujeito autorizado: conservar NULL e parar;
-- account_true_balances_asof mantém as suas permissões. Usar contexto autorizado de leitura
-- na janela, sem substituir a fórmula nem inventar saldo zero.
