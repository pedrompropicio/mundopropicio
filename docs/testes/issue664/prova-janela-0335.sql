-- #664 / 0335 — prova de janela, APENAS SELECT; preparação sem executar.
-- Guardar saídas antes da PARTE 1; repetir antes da PARTE 2 e depois dela.
-- A PARTE 2 só avança com country NOT NULL, sem DEFAULT, inválidos=0 e escritores publicados.
SELECT country, count(*) AS fornecedores FROM public.suppliers GROUP BY country ORDER BY country;

SELECT count(*) FILTER (WHERE country !~ '^[A-Z]{2}$' OR country IS NULL) AS invalidos_esperado_zero
FROM public.suppliers;

SELECT a.attnotnull AS country_not_null_esperado_true,
       pg_get_expr(d.adbin, d.adrelid) AS country_default_esperado_null
FROM pg_attribute a
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = 'public.suppliers'::regclass AND a.attname = 'country' AND NOT a.attisdropped;

SELECT EXISTS (
  SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.suppliers'::regclass
    AND tgname = 'suppliers_default_country_trigger' AND NOT tgisinternal
) AS trigger_presente_antes_true_depois_false,
  to_regprocedure('public.suppliers_default_country()') IS NOT NULL AS funcao_presente_antes_true_depois_false;

SELECT c.conname, c.convalidated, pg_get_constraintdef(c.oid) AS definicao
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname IN ('country', 'tax_id_type')
WHERE c.conrelid = 'public.suppliers'::regclass AND c.contype = 'c' AND a.attnum = ANY(c.conkey)
ORDER BY c.conname;

-- Diagnóstico histórico: não bloqueia a edição que mantém o país, não faz backfill.
SELECT s.company_id, s.country, c.country AS pais_empresa,
  count(*) FILTER (WHERE nullif(btrim(s.tax_id_foreign), '') IS NULL) AS estrangeiros_sem_nif,
  count(*) FILTER (WHERE s.tax_id_type = 'sem_nif') AS sem_nif_explicito,
  count(*) FILTER (WHERE nullif(btrim(s.tax_id_foreign), '') IS NULL
    AND s.tax_id_type IS DISTINCT FROM 'sem_nif') AS antigos_sem_decisao
FROM public.suppliers s JOIN public.companies c ON c.id = s.company_id
WHERE c.country IS NOT NULL AND s.country <> upper(c.country)
GROUP BY s.company_id, s.country, c.country ORDER BY s.company_id, s.country;

-- MD5 da definição integral: comparar as assinaturas antigas e novas, antes/depois.
SELECT p.oid::regprocedure::text AS assinatura, md5(pg_get_functiondef(p.oid)) AS md5_definicao,
  pg_get_function_arguments(p.oid) AS argumentos,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'supplier_resolve_or_create', '_supplier_resolve_or_create',
  'get_or_create_generic_camarim_supplier', 'run_rls_isolation_test'
) ORDER BY assinatura;

-- One-shot histórica termina em DROP; a 0335 não a reinstala.
SELECT to_regprocedure('public._seed_coala_from_mp()') AS seed_historica_esperado_null;
