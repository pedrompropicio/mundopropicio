-- #591 / 0329 — prova da janela, PREPARADA, NÃO EXECUTADA em bases externas.
-- Correr integralmente ANTES da parte 1 e DEPOIS da parte 2; guardar ambos os resultados.
-- Substituir __ADMIN_UID__, __MANAGER_UID__, __PEDRO_UID__ por identidades reais.
-- Só SELECT, BEGIN, SET LOCAL ROLE e ROLLBACK; nenhum DDL/DML.
-- §1/§2 requerem o operador que pode ler o catálogo e contar todas as linhas.
-- §3: conferir empresa activa; não comparar identidades com empresas activas diferentes.
-- Depois: admin/manager NULL=0 nas três; platform_admin pode ler NULL nas três.
-- Linhas com empresa mantêm a matriz; o DML move decisões NULL para a empresa da corrida,
-- pelo que as contagens reais com empresa do Coala reflectem também esse preenchimento.
-- service_role_bypass e Sync log viewable by admin/manager ficam inalteradas.

-- §1 — Contagens globais, antes e depois.
SELECT 'crm.meta_creatives_retention_runs'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS linhas_null, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa FROM crm.meta_creatives_retention_runs
UNION ALL
SELECT 'public.coala_sync_decisions'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS linhas_null, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa FROM public.coala_sync_decisions
UNION ALL
SELECT 'public.tickets_v2_sync_log'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS linhas_null, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa FROM public.tickets_v2_sync_log
ORDER BY 1;

-- §2 — Todas as políticas das três tabelas, incluindo as que ficam.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'crm' AND tablename = 'meta_creatives_retention_runs')
   OR (schemaname = 'public' AND tablename IN ('coala_sync_decisions', 'tickets_v2_sync_log'))
ORDER BY schemaname, tablename, policyname;

-- §3 — Cada identidade corre isolada e o ROLLBACK repõe sessão/papel.
BEGIN;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '__ADMIN_UID__', true);
SET LOCAL ROLE authenticated;
SELECT 'ADMIN'::text AS perfil, current_user, auth.uid(), public.current_company_id(),
       public.is_platform_admin(), public.row_belongs_to_current_company(NULL) AS rbcc_null;
SELECT 'crm.meta_creatives_retention_runs'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id = public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra FROM crm.meta_creatives_retention_runs
UNION ALL
SELECT 'public.coala_sync_decisions'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id = public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra FROM public.coala_sync_decisions
UNION ALL
SELECT 'public.tickets_v2_sync_log'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id = public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra FROM public.tickets_v2_sync_log
ORDER BY 1;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '__MANAGER_UID__', true);
SET LOCAL ROLE authenticated;
SELECT 'MANAGER'::text AS perfil, current_user, auth.uid(), public.current_company_id(),
       public.is_platform_admin(), public.row_belongs_to_current_company(NULL) AS rbcc_null;
SELECT 'crm.meta_creatives_retention_runs'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id = public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra FROM crm.meta_creatives_retention_runs
UNION ALL
SELECT 'public.coala_sync_decisions'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id = public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra FROM public.coala_sync_decisions
UNION ALL
SELECT 'public.tickets_v2_sync_log'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id = public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra FROM public.tickets_v2_sync_log
ORDER BY 1;
ROLLBACK;

BEGIN;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '__PEDRO_UID__', true);
SET LOCAL ROLE authenticated;
SELECT 'PEDRO'::text AS perfil, current_user, auth.uid(), public.current_company_id(),
       public.is_platform_admin(), public.row_belongs_to_current_company(NULL) AS rbcc_null;
SELECT 'crm.meta_creatives_retention_runs'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id = public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra FROM crm.meta_creatives_retention_runs
UNION ALL
SELECT 'public.coala_sync_decisions'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id = public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra FROM public.coala_sync_decisions
UNION ALL
SELECT 'public.tickets_v2_sync_log'::text AS tabela, count(*) FILTER (WHERE company_id IS NULL) AS null_visiveis, count(*) FILTER (WHERE company_id IS NOT NULL) AS com_empresa, count(*) FILTER (WHERE company_id = public.current_company_id()) AS activa, count(*) FILTER (WHERE company_id <> public.current_company_id()) AS outra FROM public.tickets_v2_sync_log
ORDER BY 1;
ROLLBACK;

