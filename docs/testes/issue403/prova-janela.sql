-- #403 / 0315 — PREPARADA, NÃO EXECUTADA. Operador: 0, PROC-promocao com Sim.
-- Ordem: §1–2 → migração → §3–4 → backfill manual §5 → Publish.

-- §1 — Antes: guardar o resultado para decidir se o rollback é fiel.
SELECT has_column_privilege('authenticated', 'public.suppliers', 'country', 'SELECT') AS auth_country,
       has_column_privilege('authenticated', 'public.suppliers', 'nif', 'SELECT') AS auth_nif,
       has_column_privilege('authenticated', 'public.suppliers', 'iban', 'SELECT') AS auth_iban,
       has_column_privilege('anon', 'public.suppliers', 'country', 'SELECT') AS anon_country,
       has_column_privilege('anon', 'public.suppliers', 'nif', 'SELECT') AS anon_nif,
       has_column_privilege('anon', 'public.suppliers', 'iban', 'SELECT') AS anon_iban;
SELECT column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'country';

-- §2 — Antes: distribuição existente (não é corrigida pela migração).
SELECT company_id, country, count(*) FROM public.suppliers GROUP BY company_id, country ORDER BY company_id, country;

-- §3 — Depois: auth_country=true, auth_iban=false, anon_country=false, default=NULL.
SELECT has_column_privilege('authenticated', 'public.suppliers', 'country', 'SELECT') AS auth_country,
       has_column_privilege('authenticated', 'public.suppliers', 'iban', 'SELECT') AS auth_iban,
       has_column_privilege('anon', 'public.suppliers', 'country', 'SELECT') AS anon_country;
SELECT column_default FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'country';
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE tgrelid = 'public.suppliers'::regclass
  AND tgname = 'zz_suppliers_default_country' AND NOT tgisinternal;

-- §4 — Ensaio TRANSACCIONAL, comentado para o ficheiro ser só leitura por omissão.
-- Só na janela com Sim; usar sessão autenticada real com acesso à empresa BR.
-- Confirmar identidade/empresa activa (RLS) antes de descomentar o bloco completo.
SELECT id, display_name, country FROM public.companies WHERE country = 'BR' ORDER BY id;
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- INSERT INTO public.suppliers (name, company_id) VALUES ('TESTE 0315 — ROLLBACK', '<ID_EMPRESA_BR>'::uuid) RETURNING id, country; -- esperado BR
-- ROLLBACK;

-- §5 — BACKFILL MANUAL PELO 0; sem inferir país pelo formato da conta.
-- Confirmar IDs nos SELECTs; preencher cada ID e confirmar o país da BRAVADO com Pedro.
SELECT s.id, s.name, s.company_id, s.country
FROM public.suppliers s JOIN public.companies c ON c.id = s.company_id
WHERE c.display_name ILIKE '%Social Music%' ORDER BY s.id;
SELECT id, name, company_id, country FROM public.suppliers
WHERE id = 'd76c4970-7370-499e-b540-367afb6d8dec';
-- UPDATE public.suppliers SET country = 'BR' WHERE id = '<ID_FORNECEDOR_TESTE_SOCIAL_MUSIC>'::uuid;
-- UPDATE public.suppliers SET country = '<PAIS_CONFIRMADO_PELO_PEDRO>' WHERE id = '<ID_BRAVADO_CONFIRMADO_NO_SELECT>'::uuid;
-- Rever os quatro fornecedores com conta não-IBAN (referência Pedro 04/11: 2 MP, 2 Coala).
-- A conta serve apenas para localizar os candidatos de revisão; nenhum dado bancário é devolvido.
-- Divergência de quantidade exige revisão do 0; não limitar nem corrigir automaticamente.
SELECT s.id, s.name, s.company_id, s.country
FROM public.suppliers s JOIN public.companies c ON c.id = s.company_id
WHERE (c.id = '7c858982-6ccd-47ca-bd65-e0dd3eebf01c' OR c.display_name ILIKE '%Coala%')
  AND EXISTS (
    SELECT 1 FROM unnest(ARRAY[s.iban, s.iban_2, s.iban_3]) AS a(value)
    WHERE nullif(btrim(a.value), '') IS NOT NULL
      AND regexp_replace(btrim(a.value), '\s', '', 'g') !~* '^[A-Z]{2}[0-9]{2}'
  )
ORDER BY s.company_id, s.id;
