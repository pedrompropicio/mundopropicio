-- Issue #311 E2b / 0316 — prova de janela só de leitura; não executada nesta preparação.
-- Ordem: guardar §1–§3 antes; migração primeiro, depois Publish do código.
-- Após a migração, repetir §3 (esperado: 0 linhas) e guardar §4 antes do Publish.
-- O operador da janela precisa de acesso a public._effective_permissions_for.

-- §1 — Defaults antes: guardar para decidir se o rollback pode retirar cada linha.
SELECT id, role, permission, created_at
FROM public.role_permissions
WHERE permission IN ('crm.audience.export', 'module.crm')
ORDER BY permission, role;

-- §2 — Exceções individuais existentes, por utilizador e empresa.
SELECT user_id, company_id, permission, granted
FROM public.user_permissions
WHERE permission IN ('crm.audience.export', 'module.crm')
ORDER BY user_id, company_id, permission, granted;

-- §3 — Perdas potenciais: entra no CRM mas não tem a chave de exportação.
-- Depois da migração: esperado 0 linhas; qualquer linha exige resolver antes do Publish.
WITH memberships AS (
  SELECT DISTINCT user_id, company_id
  FROM public.user_roles
  WHERE company_id IS NOT NULL
), effective AS (
  SELECT user_id, company_id,
    public._effective_permissions_for(
      user_id, company_id, ARRAY['module.crm', 'crm.audience.export']
    ) AS resolved
  FROM memberships
)
SELECT user_id, company_id, resolved->'permissions' AS permissions
FROM effective
WHERE (resolved->'permissions' ? 'module.crm')
  AND NOT (resolved->'permissions' ? 'crm.audience.export')
ORDER BY user_id, company_id;

-- §4 — Defaults depois: repetir §1 e comparar com o registo anterior.
SELECT id, role, permission, created_at
FROM public.role_permissions
WHERE permission IN ('crm.audience.export', 'module.crm')
ORDER BY permission, role;
