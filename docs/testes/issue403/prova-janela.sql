-- Issue #403 / 0315 — PREPARADA, NÃO EXECUTADA. Operador: 0, PROC-promocao com Sim.
-- Ordem: §1–2 → 0315 → §3–4 → backfill manual §5 → Publish.

-- §1 Antes: guardar os resultados; rollback só se confirmarem o estado anterior.
SELECT has_column_privilege('authenticated', 'public.suppliers', 'country', 'SELECT') AS authenticated_country,
       has_column_privilege('authenticated', 'public.suppliers', 'nif', 'SELECT') AS authenticated_nif,
       has_column_privilege('authenticated', 'public.suppliers', 'iban', 'SELECT') AS authenticated_iban,
       has_column_privilege('anon', 'public.suppliers', 'country', 'SELECT') AS anon_country,
       has_column_privilege('anon', 'public.suppliers', 'nif', 'SELECT') AS anon_nif,
       has_column_privilege('anon', 'public.suppliers', 'iban', 'SELECT') AS anon_iban;
SELECT column_default FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'country';

-- §2 Antes: distribuição sem dados bancários.
SELECT company_id, country, count(*) FROM public.suppliers GROUP BY company_id, country ORDER BY company_id, country;

-- §3 Depois: country=true, iban=false, default NULL, trigger BEFORE INSERT presente.
SELECT has_column_privilege('authenticated', 'public.suppliers', 'country', 'SELECT') AS country_readable,
       has_column_privilege('authenticated', 'public.suppliers', 'iban', 'SELECT') AS iban_readable;
SELECT column_default FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'country';
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid = 'public.suppliers'::regclass AND tgname = 'suppliers_default_country_trigger' AND NOT tgisinternal;
SELECT has_function_privilege('anon', 'public.suppliers_default_country()', 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', 'public.suppliers_default_country()', 'EXECUTE') AS authenticated_execute;

-- §4 Ensaio transacional MANUAL pelo 0; comentado para este ficheiro ser SELECT-only.
-- Escolher sessão de operador com permissão de criar fornecedor e empresa BR activa.
-- Substituir ambos os UUIDs após conferir a sessão/empresa; não executar placeholders.
-- BEGIN;
-- SELECT set_config('request.jwt.claim.sub', '<UUID_OPERADOR>', true);
-- SET LOCAL ROLE authenticated;
-- INSERT INTO public.suppliers (name, company_id) VALUES ('PROVA-0315-ROLLBACK', '<UUID_EMPRESA_BR>') RETURNING id, country;
-- Resultado obrigatório: country = BR. Sem company_id, conferir também o default/trigger de empresa.
-- ROLLBACK;

-- §5 Backfill MANUAL pelo 0, apenas após revisão e autorização da janela; nunca nesta preparação.
-- Identificar o fornecedor de teste Social Music e confirmar nome/ID, sem dados bancários.
SELECT s.id, s.name, s.company_id, s.country FROM public.suppliers s
JOIN public.companies c ON c.id = s.company_id WHERE c.display_name ILIKE '%Social Music%';
-- UPDATE public.suppliers SET country = 'BR' WHERE id = '<ID_FORNECEDOR_TESTE_SOCIAL_MUSIC>' AND company_id = '<ID_EMPRESA_SOCIAL_MUSIC>';
SELECT id, name, company_id, country FROM public.suppliers WHERE id = 'd76c4970-7370-499e-b540-367afb6d8dec';
-- BRAVADO: país correcto A CONFIRMAR PELO PEDRO antes de preencher/executar.
-- UPDATE public.suppliers SET country = '<PAIS_CONFIRMADO_PELO_PEDRO>' WHERE id = 'd76c4970-7370-499e-b540-367afb6d8dec' AND company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c';
-- Quatro fornecedores com conta não-IBAN (esperado: 2 MP, 2 Coala), só para revisão.
-- Mesmo discriminador de forma do slot: duas letras e dois dígitos após retirar espaços.
-- O predicado identifica candidatos; o resultado não contém valores bancários nem infere país.
SELECT s.id, s.name, s.company_id, s.country FROM public.suppliers s
WHERE (s.company_id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c' OR s.company_id IN (
  SELECT c.id FROM public.companies c WHERE c.display_name ILIKE '%Coala%'
)) AND EXISTS (
  SELECT 1 FROM unnest(ARRAY[s.iban, s.iban_2, s.iban_3]) AS slot(value)
  WHERE btrim(coalesce(slot.value, '')) <> ''
    AND regexp_replace(slot.value, '\s', '', 'g') !~* '^[A-Z]{2}[0-9]{2}'
) ORDER BY s.company_id, s.name;
