-- #591 E2b — prova de janela da 0324, PREPARADA, NÃO EXECUTADA.
-- Só consultas e contexto local terminado em ROLLBACK; sem DML ou DDL.
-- O 0 corre antes/depois apenas na janela autorizada, pelo PROC-promocao com Sim.
-- Ordem recomendada: 0313 → 0324; a ordem inversa é segura.
-- Substituir __ADMIN_UID__, __MANAGER_UID__ e __PEDRO_UID__ apenas na execução.
-- Escolher admin/manager da empresa activa com downloads e, para demonstrar a fuga,
-- downloads também noutra empresa. A empresa activa vem do perfil; este script não a altera.
-- Uma tabela vazia ou sem downloads de outras empresas não prova isolamento.

-- §1 — Política: esperado 1 linha, PERMISSIVE, SELECT, {authenticated}, with_check NULL.
-- Antes (A Live):
-- (has_role(( SELECT auth.uid() AS uid), 'platform_admin'::app_role)
--  OR has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)
--  OR (has_role(( SELECT auth.uid() AS uid), 'manager'::app_role)
--      AND row_belongs_to_current_company(company_id)))
-- Depois (0324; o catálogo pode acrescentar parênteses/espaços):
-- ((has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)
--   OR has_role(( SELECT auth.uid() AS uid), 'manager'::app_role))
--  AND row_belongs_to_current_company(company_id))
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'document_download_audit'
ORDER BY policyname;

-- §2 — Universo sem RLS do leitor: executar como operador autorizado, antes de SET ROLE.
SELECT company_id, count(*) AS downloads
FROM public.document_download_audit
GROUP BY company_id
ORDER BY company_id;

SELECT count(*) AS downloads, count(DISTINCT company_id) AS empresas_distintas
FROM public.document_download_audit;

-- §3 — Número de memberships por (empresa, papel), não número de utilizadores globais.
SELECT company_id, role, count(*) AS memberships
FROM public.user_roles
WHERE role IN ('admin'::app_role, 'manager'::app_role)
GROUP BY company_id, role
ORDER BY company_id, role;

-- §4 — Leituras reais com RLS; registar empresa_activa e downloads_fora_da_activa.
-- Admin: fora > 0 antes se existirem downloads de outras empresas; 0 depois da 0324.
BEGIN;
SELECT set_config('request.jwt.claim.sub', '__ADMIN_UID__', true);
SET LOCAL ROLE authenticated;
SELECT public.current_company_id() AS empresa_activa,
       count(*) AS downloads,
       count(*) FILTER (WHERE company_id <> public.current_company_id()) AS downloads_fora_da_activa
FROM public.document_download_audit;
ROLLBACK;

-- Manager: fora = 0 antes e depois (utilizador sem platform_admin).
BEGIN;
SELECT set_config('request.jwt.claim.sub', '__MANAGER_UID__', true);
SET LOCAL ROLE authenticated;
SELECT public.current_company_id() AS empresa_activa,
       count(*) AS downloads,
       count(*) FILTER (WHERE company_id <> public.current_company_id()) AS downloads_fora_da_activa
FROM public.document_download_audit;
ROLLBACK;

-- Pedro/platform_admin: fora = 0 só com 0313 + 0324; 0324 isolada mantém o bypass do rbcc.
-- A 0313 isolada também não fecha o ramo explícito de platform_admin da política antiga.
BEGIN;
SELECT set_config('request.jwt.claim.sub', '__PEDRO_UID__', true);
SET LOCAL ROLE authenticated;
SELECT public.current_company_id() AS empresa_activa,
       count(*) AS downloads,
       count(*) FILTER (WHERE company_id <> public.current_company_id()) AS downloads_fora_da_activa
FROM public.document_download_audit;
ROLLBACK;
